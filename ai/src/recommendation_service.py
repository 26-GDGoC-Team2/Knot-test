"""Backend-facing orchestration for the frozen Team Hybrid recommender.

The public page and the backend-held session state are separate return values.
No baseline/evaluation policy or model scoring implementation is changed here.
"""
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Mapping

import pandas as pd

from .data_loader import tokens
from .embeddings import EmbeddingCache
from .filters import eligible_candidates
from .ranking_team_hybrid import activity_scores, rank_candidates
from .team_hybrid_text import experience_text, query_text


@dataclass(frozen=True)
class RecommendationConditions:
    post_id: str
    role: str
    required_skills: str | list[str] | tuple[str, ...] | set[str] = ""
    preferred_skills: str | list[str] | tuple[str, ...] | set[str] = ""


def _new_member(value):
    return value is True or value == "Y"


def select_recommendation_page(
    ranking, shown_user_ids=(), page_size=5, guarantee_new_member=True,
    excluded_user_ids=(),
):
    """Choose from saved raw order, excluding both prior exposure and current service IDs.

    ``shown_user_ids`` is session pagination history; ``excluded_user_ids`` is
    the backend's current hard-exclusion snapshot. Neither changes raw scores.
    """
    if not isinstance(page_size, int) or isinstance(page_size, bool) or page_size < 1:
        raise ValueError("page_size must be a positive integer")
    rows = ranking.to_dict("records") if isinstance(ranking, pd.DataFrame) else list(ranking)
    rows = sorted(rows, key=lambda row: row["raw_rank"])
    ids = [str(row["user_id"]) for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate user_id in raw ranking")
    ranks = [int(row["raw_rank"]) for row in rows]
    if len(ranks) != len(set(ranks)):
        raise ValueError("Duplicate raw_rank")
    shown = list(shown_user_ids)
    if len(shown) != len(set(shown)):
        raise ValueError("Duplicate shown user_id")
    unavailable = set(shown) | set(excluded_user_ids)
    unseen = [row for row in rows if row["user_id"] not in unavailable]
    selected = unseen[:page_size]
    if guarantee_new_member and selected and not any(
        _new_member(row["is_new_member"]) for row in selected
    ):
        newcomer = next((row for row in unseen if _new_member(row["is_new_member"])), None)
        if newcomer is not None:
            selected = selected[:-1] + [newcomer]
    selected = [row.copy() for row in selected]
    chosen_ids = [row["user_id"] for row in selected]
    if len(chosen_ids) != len(set(chosen_ids)) or set(chosen_ids) & unavailable:
        raise AssertionError("Page contains an excluded or repeated candidate")
    return {
        "candidates": selected,
        "shown_user_ids": shown + chosen_ids,
        "remaining_count": len(unseen) - len(selected),
    }


def _conditions(value):
    if isinstance(value, RecommendationConditions):
        return value
    if isinstance(value, Mapping):
        return RecommendationConditions(**value)
    raise TypeError("conditions must be RecommendationConditions or a mapping")


def _post_series(post):
    result = post.copy() if isinstance(post, pd.Series) else pd.Series(dict(post))
    required = {"post_id", "title", "description", "interests", "start_date", "end_date"}
    missing = required - set(result.index)
    if missing:
        raise ValueError("Post missing fields: " + ", ".join(sorted(missing)))
    return result


def _prepared_post(post, conditions):
    conditions = _conditions(conditions)
    result = _post_series(post)
    if str(result.post_id) != conditions.post_id or not conditions.role.strip():
        raise ValueError("post_id mismatch or empty role")
    result["required_skills"] = ";".join(sorted(tokens(conditions.required_skills)))
    result["preferred_skills"] = ";".join(sorted(tokens(conditions.preferred_skills)))
    result["start_date"] = pd.to_datetime(result.start_date, errors="raise")
    result["end_date"] = pd.to_datetime(result.end_date, errors="raise")
    if "split" not in result:
        result["split"] = "service"
    return result, conditions.role.strip()


def _context_key(post, role):
    # Include post text/date and normalized skill conditions, so a modified post
    # cannot silently continue an old ranking session.
    canonical = {
        "post_id": str(post.post_id), "role": role,
        "required_skills": sorted(tokens(post.required_skills)),
        "preferred_skills": sorted(tokens(post.preferred_skills)),
        "title": str(post.title), "description": str(post.description),
        "interests": sorted(tokens(post.interests)),
        "start_date": post.start_date.isoformat(),
        "end_date": post.end_date.isoformat(),
    }
    return hashlib.sha256(json.dumps(
        canonical, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def _public_page(selection, page, context_key):
    # raw_rank belongs to the frozen full ranking; display_rank is local to
    # this page after current exclusions and the newcomer selection policy.
    candidates = [
        {
            "user_id": str(row["user_id"]),
            "raw_rank": int(row["raw_rank"]),
            "display_rank": index,
            "score": float(row["score"]),
            "is_new_member": _new_member(row["is_new_member"]),
        }
        for index, row in enumerate(selection["candidates"], start=1)
    ]
    remaining = selection["remaining_count"]
    return {
        "page": page,
        "candidates": candidates,
        "shown_user_ids": selection["shown_user_ids"],
        "remaining_count": remaining,
        "next_action": "SHOW_MORE" if page == 1 and remaining else "CHANGE_CONDITIONS",
        "recommendation_context": context_key,
    }


class TeamHybridRecommendationService:
    """Stateless service: backend stores the returned JSON-compatible state.

    The backend supplies its latest relationship-based exclusions on each call.
    An explicit empty set clears prior exclusions; None reuses the saved set.
    """

    def __init__(self, profiles, experiences, embeddings):
        self.profiles = (profiles.copy() if isinstance(profiles, pd.DataFrame)
                         else pd.DataFrame(profiles))
        self.experiences = (experiences.copy() if isinstance(experiences, pd.DataFrame)
                            else pd.DataFrame(experiences))
        self.profiles["available_from"] = pd.to_datetime(
            self.profiles["available_from"], errors="raise")
        # Demo personas may omit a date while explicitly available now. This
        # service-only normalization leaves the synthetic evaluation filter alone.
        available_now = (self.profiles["availability"].eq("참여 가능")
                         & self.profiles["available_from"].isna())
        self.profiles.loc[available_now, "available_from"] = pd.Timestamp("1900-01-01")
        if self.profiles.user_id.duplicated().any():
            raise ValueError("Duplicate profile user_id")
        if self.experiences.experience_id.duplicated().any():
            raise ValueError("Duplicate project experience_id")
        self.embeddings = embeddings

    @classmethod
    def from_csv(cls, data_dir: Path, embeddings: EmbeddingCache):
        """Load only ranking inputs; no labels or evaluation output."""
        data_dir = Path(data_dir)
        profile_path = data_dir / "profiles.csv"
        experience_path = data_dir / "project_experiences.csv"
        if not profile_path.exists() and (data_dir / "profiles_50.csv").exists():
            profile_path = data_dir / "profiles_50.csv"
            experience_path = data_dir / "project_experiences_50.csv"
        return cls(
            pd.read_csv(profile_path, dtype=str, keep_default_na=False),
            pd.read_csv(experience_path, dtype=str, keep_default_na=False),
            embeddings,
        )

    def _raw_ranking(self, post, role):
        eligible = eligible_candidates(self.profiles, post, role)
        activities, _ = activity_scores(self.profiles)
        if eligible.empty:
            return []
        needed = set(eligible.user_id)
        introductions = {
            member.user_id: member.introduction for member in self.profiles.itertuples()
            if member.user_id in needed
        }
        experience_rows = self.experiences.loc[
            self.experiences.user_id.isin(needed)].sort_values("experience_id")
        experience_texts = {
            exp.experience_id: experience_text(exp)
            for exp in experience_rows.itertuples()
        }
        query = query_text(post, role)
        texts = [query] + [text for text in introductions.values() if text.strip()]
        texts += list(experience_texts.values())
        vectors = self.embeddings.get_many(texts)
        intro_vectors = {
            user_id: vectors[text] if text.strip() else None
            for user_id, text in introductions.items()
        }
        experience_vectors = {user_id: [] for user_id in needed}
        for exp in experience_rows.itertuples():
            experience_vectors[exp.user_id].append(
                (exp.experience_id, vectors[experience_texts[exp.experience_id]]))
        ranked = rank_candidates(
            eligible, post, role, vectors[query], intro_vectors,
            experience_vectors, activities)
        return ranked.to_dict("records")

    def start(self, post, conditions, excluded_user_ids: set[str] | None = None):
        """Rank all filter-eligible users once, then exclude current service IDs."""
        normalized_post, role = _prepared_post(post, conditions)
        excluded = set(excluded_user_ids or ())
        # Keep the full frozen ranking so a later exclusion snapshot may remove
        # IDs without requiring a new embedding/ranking call on SHOW_MORE.
        raw = self._raw_ranking(normalized_post, role)
        key = _context_key(normalized_post, role)
        selection = select_recommendation_page(raw, excluded_user_ids=excluded)
        state = {
            "context_key": key,
            "post": {
                field: (normalized_post[field].isoformat() if field in {"start_date", "end_date"}
                        else normalized_post[field])
                for field in ("post_id", "title", "description", "interests",
                              "start_date", "end_date", "required_skills", "preferred_skills")
            },
            "role": role,
            "raw_ranking": raw,
            "shown_user_ids": selection["shown_user_ids"],
            "excluded_user_ids": sorted(excluded),
            "page": 1,
        }
        return _public_page(selection, 1, key), state

    def show_more(self, post, conditions, state,
                  excluded_user_ids: set[str] | None = None):
        """Use saved ranking and exposure history with current service exclusions.

        ``excluded_user_ids`` replaces the previous exclusion snapshot when
        supplied; None keeps it for callers using the older interface.
        """
        normalized_post, role = _prepared_post(post, conditions)
        if _context_key(normalized_post, role) != state["context_key"]:
            raise ValueError("Recommendation conditions changed; start a new session")
        if state["page"] != 1:
            raise ValueError("A third recommendation page is unavailable")
        excluded = set(state["excluded_user_ids"] if excluded_user_ids is None
                       else excluded_user_ids)
        selection = select_recommendation_page(
            state["raw_ranking"], state["shown_user_ids"], excluded_user_ids=excluded)
        if not selection["candidates"]:
            raise ValueError("No unseen candidates; change conditions")
        new_state = dict(state, shown_user_ids=selection["shown_user_ids"],
                         excluded_user_ids=sorted(excluded), page=2)
        return _public_page(selection, 2, state["context_key"]), new_state

    def restart(self, post, new_conditions, previous_state,
                excluded_user_ids: set[str] | None = None):
        """Reset exposure history; use current exclusions or saved fallback."""
        excluded = set(previous_state["excluded_user_ids"] if excluded_user_ids is None
                       else excluded_user_ids)
        return self.start(post, new_conditions, excluded_user_ids=excluded)

    def reason_inputs(self, state, page_response):
        """Adapter for generate_recommendation_reasons after page selection."""
        if page_response["recommendation_context"] != state["context_key"]:
            raise ValueError("Reason/page context mismatch")
        by_id = {row["user_id"]: row for row in state["raw_ranking"]}
        selected = []
        for candidate in page_response["candidates"]:
            row = by_id[candidate["user_id"]]
            if row["raw_rank"] != candidate["raw_rank"] or float(row["score"]) != candidate["score"]:
                raise ValueError("Reason/page ranking mismatch")
            selected.append(dict(row, final_rank=candidate["display_rank"]))
        return {
            "post": dict(state["post"]),
            "role": state["role"],
            "final_candidates": selected,
            "profiles": self.profiles.to_dict("records"),
            "experiences": self.experiences.to_dict("records"),
        }

    def explain_page(self, state, page_response):
        """Explain only selected Final candidates; never select or rerank them."""
        from .recommendation_reason import generate_recommendation_reasons

        inputs = self.reason_inputs(state, page_response)
        reasons = generate_recommendation_reasons(**inputs)
        expected = [row["user_id"] for row in page_response["candidates"]]
        if [row["user_id"] for row in reasons] != expected:
            raise AssertionError("Reason output changed candidate membership or order")
        return reasons

"""Baseline 0: equal mean of two set-overlap ratios, without embeddings."""
import pandas as pd

from .data_loader import tokens


def match_ratio(owned: str, requested: str) -> float:
    requested_set = tokens(requested)
    # An empty requested set contributes zero; the other signal is not reweighted.
    return len(tokens(owned) & requested_set) / len(requested_set) if requested_set else 0.0


def rank_candidates(candidates: pd.DataFrame, post: pd.Series, role: str) -> pd.DataFrame:
    ranked = candidates[["user_id", "is_new_member"]].copy()
    ranked["preferred_skill_match_ratio"] = candidates.skills.map(
        lambda value: match_ratio(value, post.preferred_skills))
    ranked["interest_match_ratio"] = candidates.interests.map(
        lambda value: match_ratio(value, post.interests))
    ranked["score"] = (ranked.preferred_skill_match_ratio + ranked.interest_match_ratio) / 2
    ranked = ranked.sort_values(["score", "user_id"], ascending=[False, True]).reset_index(drop=True)
    ranked["raw_rank"] = range(1, len(ranked) + 1)
    ranked["post_id"], ranked["role"], ranked["split"] = post.post_id, role, post["split"]
    return ranked

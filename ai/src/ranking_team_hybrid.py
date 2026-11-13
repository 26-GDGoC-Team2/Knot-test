"""Frozen team weights; common filters/policy/metrics remain untouched."""
import math
import pandas as pd
from .data_loader import tokens
from .ranking_baseline_1 import cosine_similarity

WEIGHTS = dict(text=0.50, skill=0.20, interest=0.20, activity=0.10)
TEXT_MIX = dict(experience=0.70, introduction=0.30)
ACTIVITY_FIELDS = ["study_count", "official_project_count", "member_team_project_count"]


def activity_scores(profiles):
    counts = profiles[ACTIVITY_FIELDS].apply(pd.to_numeric, errors="raise")
    if not counts.ge(0).all().all() or not counts.map(math.isfinite).all().all():
        raise ValueError("Activity counts must be finite and nonnegative")
    maxima = counts.max().clip(lower=1)
    scores = (counts.div(maxima).sum(axis=1) + profiles.completion_status.eq("수료").astype(float)) / 4
    return dict(zip(profiles.user_id, scores)), {k: float(v) for k,v in maxima.items()}


def overlap(owned, wanted):
    return len(tokens(owned) & wanted) / len(wanted) if wanted else 0.0


def semantic_parts(query_vector, intro_vector, experience_vectors):
    intro = max(0.0, cosine_similarity(query_vector, intro_vector)) if intro_vector is not None else 0.0
    if not experience_vectors:
        return intro, 0.0, intro, ""
    # Tie in experience cosine: lowest experience_id.
    best_id, best = sorted(
        ((eid, max(0.0, cosine_similarity(query_vector, vector))) for eid,vector in experience_vectors),
        key=lambda pair: (-pair[1], pair[0]))[0]
    return TEXT_MIX["experience"] * best + TEXT_MIX["introduction"] * intro, best, intro, best_id


def weighted_score(text, skill, interest, activity):
    return WEIGHTS["text"]*text + WEIGHTS["skill"]*skill + WEIGHTS["interest"]*interest + WEIGHTS["activity"]*activity


def rank_candidates(candidates, post, role, query_vector, intro_vectors, experience_vectors, activities):
    wanted = tokens(post.required_skills) | tokens(post.preferred_skills)
    rows = []
    for member in candidates.itertuples():
        text, best, intro, best_id = semantic_parts(
            query_vector, intro_vectors[member.user_id], experience_vectors[member.user_id])
        skill = overlap(member.skills, wanted)
        interest = overlap(member.interests, tokens(post.interests))
        activity = activities[member.user_id]
        rows.append(dict(post_id=post.post_id, role=role, split=post["split"], user_id=member.user_id,
                         is_new_member=member.is_new_member, text_score=text,
                         best_experience_similarity=best, introduction_similarity=intro,
                         best_experience_id=best_id, skill_score=skill, interest_score=interest,
                         activity_score=activity, score=weighted_score(text,skill,interest,activity)))
    columns = ["post_id","role","split","user_id","is_new_member","text_score",
               "best_experience_similarity","introduction_similarity","best_experience_id",
               "skill_score","interest_score","activity_score","score"]
    ranked = pd.DataFrame(rows,columns=columns).sort_values(
        ["score","user_id"],ascending=[False,True]).reset_index(drop=True)
    ranked["raw_rank"] = range(1,len(ranked)+1)
    return ranked

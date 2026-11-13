"""Role-level macro metrics; linear relevance gain for nDCG."""
import math

import pandas as pd


def join_relevance(ranking: pd.DataFrame, labels: pd.DataFrame) -> pd.DataFrame:
    """Attach evaluation labels strictly by post + role + user, never by user alone."""
    keys = ["post_id", "role", "user_id"]
    joined = ranking.merge(labels[keys + ["relevance"]], on=keys, how="left",
                           validate="one_to_one", sort=False)
    if joined.relevance.isna().any():
        raise ValueError("Missing post-role-user relevance label")
    return joined


def evaluate_role_ranking(ranking: pd.DataFrame, eligible: pd.DataFrame,
                          labels: pd.DataFrame) -> dict:
    for frame in (ranking, eligible):
        if len(frame[["post_id", "role"]].drop_duplicates()) > 1:
            raise ValueError("Evaluate exactly one role query at a time")
    joined = join_relevance(eligible, labels)
    ranked = join_relevance(ranking, labels)
    if not set(zip(ranked.post_id, ranked.role, ranked.user_id)).issubset(
            set(zip(joined.post_id, joined.role, joined.user_id))):
        raise ValueError("Ranking contains a candidate outside the eligible role query")
    return evaluate_ranking(ranked, joined, joined.set_index("user_id").relevance.to_dict())


def dcg(relevances: list[int], k: int) -> float:
    return sum(rel / math.log2(index + 2) for index, rel in enumerate(relevances[:k]))


def evaluate_ranking(ranking: pd.DataFrame, eligible: pd.DataFrame,
                     relevance: dict[str, int]) -> dict:
    values = [int(relevance[user_id]) for user_id in ranking.user_id]
    ideal = sorted((int(relevance[user_id]) for user_id in eligible.user_id), reverse=True)
    result = {f"Hit@{k}": float(any(rel >= 2 for rel in values[:k])) for k in (3, 5)}
    result["MRR@5"] = next((1 / (i + 1) for i, rel in enumerate(values[:5]) if rel >= 2), 0.0)
    for k in (3, 5):
        denominator = dcg(ideal, k)
        result[f"nDCG@{k}"] = dcg(values, k) / denominator if denominator else 0.0
    has_new = eligible.is_new_member.eq("Y").any()
    result["New Member Coverage@5"] = (
        float(ranking.head(5).is_new_member.eq("Y").any()) if has_new else float("nan"))
    result["eligible_count"] = len(eligible)
    result["eligible_new_member_count"] = int(eligible.is_new_member.eq("Y").sum())
    return result


def summarize(per_role: pd.DataFrame) -> pd.DataFrame:
    names = ["Hit@3", "Hit@5", "MRR@5", "nDCG@3", "nDCG@5", "New Member Coverage@5"]
    grouped = per_role.groupby(["split", "ranking_type"], sort=True)
    summary = grouped[names].mean()
    summary["role_count"] = grouped.size()
    summary["coverage_eligible_role_count"] = grouped["New Member Coverage@5"].count()
    summary["empty_eligible_role_count"] = grouped["eligible_count"].agg(lambda v: int(v.eq(0).sum()))
    return summary.reset_index()

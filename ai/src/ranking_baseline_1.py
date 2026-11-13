"""Cosine-only ranking; no Baseline 0 signals."""
import math
import pandas as pd
from .embeddings import validate_vector


def cosine_similarity(a, b) -> float:
    validate_vector(a)
    validate_vector(b)
    if len(a) != len(b):
        raise ValueError("Embedding dimensions differ")
    return sum(x*y for x, y in zip(a, b)) / (math.sqrt(sum(x*x for x in a)) * math.sqrt(sum(y*y for y in b)))


def rank_candidates(candidates: pd.DataFrame, post: pd.Series, role: str,
                    query_vector, member_vectors: dict) -> pd.DataFrame:
    ranked = candidates[["user_id", "is_new_member"]].copy()
    ranked["score"] = [cosine_similarity(query_vector, member_vectors[u]) for u in ranked.user_id]
    ranked = ranked.sort_values(["score", "user_id"], ascending=[False, True]).reset_index(drop=True)
    ranked["raw_rank"] = range(1, len(ranked) + 1)
    ranked["post_id"], ranked["role"], ranked["split"] = post.post_id, role, post["split"]
    return ranked

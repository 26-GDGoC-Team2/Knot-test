"""Guarantee a new member without modifying any ranking score."""
import pandas as pd


def apply_new_member_policy(raw: pd.DataFrame) -> pd.DataFrame:
    final = raw.head(5).copy()
    newcomers = raw.loc[raw.is_new_member.eq("Y")]
    if not newcomers.empty and not final.is_new_member.eq("Y").any():
        final = pd.concat([final.iloc[:4], newcomers.head(1)], ignore_index=True)
    final = final.reset_index(drop=True)
    final["final_rank"] = range(1, len(final) + 1)
    return final

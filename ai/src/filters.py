"""Hard filters only; relationship exclusions are unavailable in the CSVs."""
import pandas as pd

from .data_loader import tokens


def eligible_candidates(profiles: pd.DataFrame, post: pd.Series, role: str) -> pd.DataFrame:
    required = tokens(post.required_skills)
    # API posts and CSV posts share the recruitment closing-date cutoff.
    deadline = pd.Timestamp(post.end_date)
    mask = (
        profiles.desired_roles.map(lambda value: role in tokens(value))
        & profiles.skills.map(lambda value: not required or bool(required & tokens(value)))
        & profiles.availability.eq("참여 가능")
        & (profiles.available_from.isna() | profiles.available_from.le(deadline))
    )
    return profiles.loc[mask].copy()

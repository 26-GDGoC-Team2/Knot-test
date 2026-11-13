"""Canonical source categories for service demo project experiences."""
from enum import Enum


class ProjectType(str, Enum):
    CLUB_PROJECT = "CLUB_PROJECT"
    MEMBER_TEAM = "MEMBER_TEAM"
    SELF_REPORTED = "SELF_REPORTED"


_LEGACY_TYPES = {"PERSONAL": ProjectType.SELF_REPORTED,
                 "EXTERNAL": ProjectType.SELF_REPORTED}


def normalize_project_type(value: str) -> ProjectType:
    """Convert only known legacy categories; reject unrecognized provenance."""
    if value in _LEGACY_TYPES:
        return _LEGACY_TYPES[value]
    try:
        return ProjectType(value)
    except ValueError as exc:
        raise ValueError(f"Unknown project_type: {value!r}") from exc

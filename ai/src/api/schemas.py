"""Internal HTTP contract; backend IDs remain opaque strings."""
from datetime import date
from enum import Enum
import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StringConstraints, field_validator, model_validator


NonEmpty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


def _date_only(value):
    if isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return value
    raise ValueError("Date must use YYYY-MM-DD")


class DTO(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BackendProjectType(str, Enum):
    OFFICIAL = "OFFICIAL"
    MATCHED = "MATCHED"
    PERSONAL = "PERSONAL"


class Recruitment(DTO):
    recruitment_id: NonEmpty
    title: NonEmpty
    description: str
    start_date: date
    end_date: date
    interests: list[NonEmpty]

    _start_date = field_validator("start_date", mode="before")(_date_only)
    _end_date = field_validator("end_date", mode="before")(_date_only)

    @model_validator(mode="after")
    def ordered_dates(self):
        if self.start_date > self.end_date:
            raise ValueError("start_date must be on or before end_date")
        return self


class TargetRole(DTO):
    role_id: NonEmpty
    role_name: NonEmpty
    required_skills: list[NonEmpty]
    preferred_skills: list[NonEmpty]


class ProjectExperience(DTO):
    experience_id: NonEmpty
    name: NonEmpty
    type: BackendProjectType
    started_on: date | None
    ended_on: date | None
    role: NonEmpty | None
    description: str | None
    skills: list[NonEmpty]

    _started_on = field_validator("started_on", mode="before")(
        lambda value: None if value is None else _date_only(value))
    _ended_on = field_validator("ended_on", mode="before")(
        lambda value: None if value is None else _date_only(value))


class Candidate(DTO):
    user_id: NonEmpty
    desired_roles: list[NonEmpty] = Field(min_length=1)
    skills: list[NonEmpty] = Field(min_length=1)
    interests: list[NonEmpty] = Field(min_length=1)
    introduction: str
    available: StrictBool
    available_from: date | None
    completed: StrictBool
    is_new_member: StrictBool
    study_count: int = Field(ge=0)
    project_experiences: list[ProjectExperience] = Field(default_factory=list)

    _available_from = field_validator("available_from", mode="before")(
        lambda value: None if value is None else _date_only(value))

    @model_validator(mode="after")
    def unique_experiences(self):
        ids = [item.experience_id for item in self.project_experiences]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate project experience_id for candidate")
        return self


class StartRequest(DTO):
    recruitment: Recruitment
    target_role: TargetRole
    candidates: list[Candidate]
    excluded_user_ids: list[NonEmpty] = Field(default_factory=list)

    @model_validator(mode="after")
    def unique_ids(self):
        ids = [item.user_id for item in self.candidates]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate candidate user_id")
        experience_ids = [exp.experience_id for item in self.candidates
                          for exp in item.project_experiences]
        if len(experience_ids) != len(set(experience_ids)):
            raise ValueError("Duplicate project experience_id across candidates")
        self.excluded_user_ids = list(dict.fromkeys(self.excluded_user_ids))
        return self


class MoreRequest(DTO):
    excluded_user_ids: list[NonEmpty]

    @model_validator(mode="after")
    def normalize_exclusions(self):
        self.excluded_user_ids = list(dict.fromkeys(self.excluded_user_ids))
        return self


class ReasonItem(DTO):
    type: Literal["skill", "experience", "interest"]
    label: NonEmpty
    text: NonEmpty


class CandidateResponse(DTO):
    user_id: str
    score: float
    raw_rank: int
    display_rank: int
    best_experience_id: str | None
    reason_items: list[ReasonItem]


class RecommendationResponse(DTO):
    context_id: str
    recruitment_id: str
    role_id: str
    page: int
    page_size: int
    candidates: list[CandidateResponse]
    next_action: Literal["SHOW_MORE", "CHANGE_CONDITIONS"]


class HealthResponse(DTO):
    status: Literal["ok"] = "ok"
    service: Literal["knot-ai-recommendation"] = "knot-ai-recommendation"

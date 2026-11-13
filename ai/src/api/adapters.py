"""Convert backend-oriented DTOs to the existing service's DataFrame schema."""
import pandas as pd

from src.project_type import ProjectType
from src.recommendation_service import RecommendationConditions, TeamHybridRecommendationService

from .schemas import BackendProjectType, StartRequest


PROJECT_TYPES = {
    BackendProjectType.OFFICIAL: ProjectType.CLUB_PROJECT,
    BackendProjectType.MATCHED: ProjectType.MEMBER_TEAM,
    BackendProjectType.PERSONAL: ProjectType.SELF_REPORTED,
}


PROFILE_COLUMNS = [
    "user_id", "desired_roles", "skills", "interests", "introduction",
    "availability", "available_from", "completion_status", "is_new_member",
    "study_count", "official_project_count", "member_team_project_count",
]
EXPERIENCE_COLUMNS = [
    "experience_id", "user_id", "project_name", "project_type", "role",
    "description", "skills",
]


def _tags(values):
    return ";".join(values)


def to_service_inputs(request: StartRequest, embeddings):
    """Use supplied backend snapshot only; never query a DB or demo CSV."""
    profiles, experiences = [], []
    for candidate in request.candidates:
        official = sum(exp.type is BackendProjectType.OFFICIAL
                       for exp in candidate.project_experiences)
        matched = sum(exp.type is BackendProjectType.MATCHED
                      for exp in candidate.project_experiences)
        profiles.append({
            "user_id": candidate.user_id,
            "desired_roles": _tags(candidate.desired_roles),
            "skills": _tags(candidate.skills),
            "interests": _tags(candidate.interests),
            "introduction": candidate.introduction,
            "availability": "참여 가능" if candidate.available else "현재 어려움",
            "available_from": candidate.available_from.isoformat() if candidate.available_from else None,
            "completion_status": "수료" if candidate.completed else "활동중",
            "is_new_member": candidate.is_new_member,
            "study_count": candidate.study_count,
            "official_project_count": official,
            "member_team_project_count": matched,
        })
        for exp in candidate.project_experiences:
            experiences.append({
                "experience_id": exp.experience_id,
                "user_id": candidate.user_id,
                "project_name": exp.name,
                "project_type": PROJECT_TYPES[exp.type].value,
                "role": exp.role or "",
                "description": exp.description or "",
                "skills": _tags(exp.skills),
            })
    service = TeamHybridRecommendationService(
        pd.DataFrame(profiles, columns=PROFILE_COLUMNS),
        pd.DataFrame(experiences, columns=EXPERIENCE_COLUMNS), embeddings)
    post = {
        "post_id": request.recruitment.recruitment_id,
        "title": request.recruitment.title,
        "description": request.recruitment.description,
        "start_date": request.recruitment.start_date.isoformat(),
        "end_date": request.recruitment.end_date.isoformat(),
        "interests": _tags(request.recruitment.interests),
    }
    conditions = RecommendationConditions(
        post_id=request.recruitment.recruitment_id,
        role=request.target_role.role_name,
        required_skills=request.target_role.required_skills,
        preferred_skills=request.target_role.preferred_skills,
    )
    return service, post, conditions

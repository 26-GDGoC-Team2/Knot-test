"""Fixed text templates. No structured profile fields or labels are included."""
import pandas as pd


def post_text(post: pd.Series, role: str) -> str:
    return f"제목: {post.title}\n모집 역할: {role}\n프로젝트 설명: {post.description}"


def member_text(profile: pd.Series, experiences: pd.DataFrame) -> str:
    rows = experiences.loc[experiences.user_id.eq(profile.user_id)].sort_values("experience_id")
    intro = f"자기소개:\n{profile.introduction}\n\n"
    if rows.empty:
        return intro + "프로젝트 경험: 없음"
    items = [f"- 프로젝트명: {r.project_name}\n  역할: {r.role}\n  사용 기술: {r.skills}\n  설명: {r.description}"
             for r in rows.itertuples()]
    return intro + "프로젝트 경험:\n" + "\n".join(items)

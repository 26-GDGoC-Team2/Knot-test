"""Fixed templates for the frozen team hybrid experiment."""
from .data_loader import tokens


def tags(value):
    return ", ".join(sorted(tokens(value)))


def query_text(post, role):
    # v0.3 required_skills is global to the post, including multi-role posts.
    return (f"제목: {post.title}\n모집 역할: {role}\n설명: {post.description}\n"
            f"필수 기술: {tags(post.required_skills)}\n우대 기술: {tags(post.preferred_skills)}\n"
            f"관심 분야: {tags(post.interests)}")


def experience_text(experience):
    return (f"프로젝트명: {experience.project_name}\n역할: {experience.role}\n"
            f"사용 기술: {tags(experience.skills)}\n설명: {experience.description}")

"""Deterministic, factual explanations for already selected Final candidates.

This module never calls an API, computes embeddings, or changes the ranking.
"""
import re

from .data_loader import tokens


ROLE_DESCRIPTION_TERMS = {
    "BE": ("REST API", "API 서버", "사용자 인증", "백엔드", "데이터베이스", "DB 연동"),
    "FE": ("웹 UI", "화면 구현", "프론트엔드", "사용자 화면"),
    "AI": ("모델 학습", "모델 추론", "데이터 전처리", "머신러닝", "딥러닝"),
    "PM": ("요구사항", "일정 관리", "서비스 기획", "기능 기획"),
    "디자인": ("UI 디자인", "UX 디자인", "디자인 시스템", "화면 디자인"),
    "앱": ("모바일 앱", "안드로이드 앱", "iOS 앱", "앱 개발"),
}
PROJECT_ACTIONS = ("구현", "개발", "구축", "설계", "연동", "제작", "개선", "분석", "정리", "학습")
GENERIC_CROSS_ROLE_SKILLS = {"python", "javascript", "typescript", "java", "sql", "c", "c++", "r"}
SAFE_LABEL = re.compile(r"[\w가-힣 /+#.·&()-]+\Z")


def safe_labels(value):
    """Return sorted, bounded labels from CSV strings or nested lists."""
    return sorted(label for label in tokens(value) if len(label) <= 40
                  and SAFE_LABEL.fullmatch(label)
                  and not re.search(r"명령|무시|지시|ignore|instruction|system|@|https?",
                                    label, re.IGNORECASE))


def project_evidence(project, post, role):
    """Accept the saved best project only when it supports the target role."""
    same_role = str(project.get("role", "")).strip() == str(role).strip()
    requested = set(safe_labels(post.get("required_skills", ""))) | set(
        safe_labels(post.get("preferred_skills", "")))
    matched = sorted(set(safe_labels(project.get("skills", ""))) & requested)
    specific = [skill for skill in matched
                if skill.casefold() not in GENERIC_CROSS_ROLE_SKILLS]
    task = ""
    if not same_role:
        for clause in re.split(r"[.!?;\n]+", str(project.get("description") or "")):
            for term in ROLE_DESCRIPTION_TERMS.get(role, ()):
                if term.casefold() in clause.casefold():
                    action = next((word for word in PROJECT_ACTIONS if word in clause), None)
                    if action:
                        task = f"{term} {action}"
                        break
            if task:
                break
    if not same_role and not specific and not task:
        return None
    return {"role_matches_target": same_role,
            "matched_skills": matched if same_role else specific,
            "relevant_task": task}


def prepare_evidence(post, role, final_candidates, profiles, experiences):
    """Join selected IDs and saved best_experience_id without project reselection."""
    if len(final_candidates) > 5:
        raise ValueError("At most five final candidates are allowed")
    ids = [str(c["user_id"]) for c in final_candidates]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate candidate ID")
    profile_map = {}
    for profile in profiles:
        uid = str(profile["user_id"])
        if uid in profile_map:
            raise ValueError("Duplicate profile ID")
        profile_map[uid] = profile
    exp_map = {}
    for experience in experiences:
        eid = str(experience["experience_id"])
        if eid in exp_map:
            raise ValueError("Duplicate experience ID")
        exp_map[eid] = experience
    required = set(safe_labels(post.get("required_skills", "")))
    preferred = set(safe_labels(post.get("preferred_skills", "")))
    interests = set(safe_labels(post.get("interests", "")))
    result = []
    for candidate in final_candidates:
        uid = str(candidate["user_id"])
        if str(candidate.get("post_id", post["post_id"])) != str(post["post_id"]):
            raise ValueError("Candidate post mismatch")
        if str(candidate.get("role", role)) != str(role):
            raise ValueError("Candidate role mismatch")
        if uid not in profile_map:
            raise ValueError("Candidate profile is missing")
        profile = profile_map[uid]
        owned = set(safe_labels(profile.get("skills", "")))
        eid = str(candidate.get("best_experience_id") or "")
        project = None
        if eid:
            project = exp_map.get(eid)
            if project is None or str(project["user_id"]) != uid:
                raise ValueError("Saved best experience is missing or belongs to another user")
        result.append({
            "user_id": uid,
            "matched_skills": sorted(owned & (required | preferred)),
            "matched_interests": sorted(set(safe_labels(profile.get("interests", ""))) & interests),
            "project_evidence": project_evidence(project, post, role) if project else None,
        })
    return result


def _reason_items(evidence, role):
    items = []
    if evidence["matched_skills"]:
        items.append({"type": "skill", "label": "기술",
                      "text": ", ".join(evidence["matched_skills"][:3]) + " 일치"})
    project = evidence["project_evidence"]
    if project:
        if project["role_matches_target"]:
            text = f"{role} 프로젝트 경험"
        elif project["matched_skills"]:
            text = f"{project['matched_skills'][0]} 활용 프로젝트 경험"
        else:
            text = project["relevant_task"] + " 경험"
        items.append({"type": "experience", "label": "경험", "text": text})
    if evidence["matched_interests"]:
        items.append({"type": "interest", "label": "관심 분야",
                      "text": ", ".join(evidence["matched_interests"][:2]) + " 일치"})
    return items


def generate_recommendation_reasons(post, role, final_candidates, *, profiles, experiences):
    """Return ordered structured reasons for the unchanged Final candidate list."""
    evidence = prepare_evidence(post, role, final_candidates, profiles, experiences)
    rows = []
    for item in evidence:
        reason_items = _reason_items(item, role)
        reason = ("추천 근거\n" + "\n".join(
            f"- {part['label']}: {part['text']}" for part in reason_items)
            if reason_items else "모집 조건을 충족한 후보입니다.")
        rows.append({"user_id": item["user_id"], "reason_items": reason_items,
                     "reason": reason, "source": "rule"})
    return rows

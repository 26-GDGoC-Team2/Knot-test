"""Load the active synthetic_dataset_v0_3 with pandas."""
import json
from pathlib import Path

import pandas as pd

DATA_VERSION = "synthetic_dataset_v0_3"


def tokens(value: str | list[str] | tuple[str, ...] | set[str] | frozenset[str] | None) -> set[str]:
    """Read semicolon CSV values or runtime role collections without changing scores."""
    if value is None:
        return set()
    items = [value] if isinstance(value, str) else value
    if not isinstance(items, (list, tuple, set, frozenset)):
        raise TypeError("Expected a semicolon string or a collection of strings")
    result = set()
    for item in items:
        if not isinstance(item, str):
            raise TypeError("Role/skill entries must be strings")
        result.update(part.strip() for part in item.split(";") if part.strip())
    return result


def load_data(data_dir: Path) -> dict[str, pd.DataFrame]:
    manifest = json.loads((data_dir / "dataset_manifest.json").read_text(encoding="utf-8-sig"))
    if manifest["dataset_version"] != DATA_VERSION:
        raise ValueError("Only synthetic_dataset_v0_3 is active")
    label_columns = ["post_id", "role", "user_id", "split", "eligible_by_hard_filter", "relevance"]
    tables = {
        name: pd.read_csv(data_dir / f"{name}.csv", dtype=str, keep_default_na=False,
                          usecols=label_columns if name == "relevance_labels" else None)
        for name in ("profiles", "recruitment_posts", "relevance_labels", "policy_test_cases")
    }
    profiles, posts, labels = (tables[n] for n in
                              ("profiles", "recruitment_posts", "relevance_labels"))
    if len(profiles) != 50 or posts["split"].value_counts().to_dict() != {"dev": 12, "test": 8}:
        raise ValueError("Expected v0.3: 50 profiles, 12 dev posts, 8 test posts")
    if profiles.user_id.duplicated().any() or posts.post_id.duplicated().any():
        raise ValueError("Duplicate profile/post IDs")
    if labels.duplicated(["post_id", "role", "user_id"]).any():
        raise ValueError("Duplicate relevance labels")
    queries = {(p.post_id, role) for p in posts.itertuples() for role in tokens(p.desired_roles)}
    if len(queries) != 22:
        raise ValueError("Expected 22 role queries")
    expected = {(p, role, u) for p, role in queries for u in profiles.user_id}
    if set(zip(labels.post_id, labels.role, labels.user_id)) != expected:
        raise ValueError("Missing or unexpected relevance label pairs")
    cases = tables["policy_test_cases"]
    if cases.duplicated(["post_id", "role"]).any() or set(zip(cases.post_id, cases.role)) != queries:
        raise ValueError("Policy cases must cover each role query exactly once")
    labels["relevance"] = pd.to_numeric(labels["relevance"], errors="raise")
    if not labels.relevance.isin([0, 1, 2, 3]).all():
        raise ValueError("Relevance must be an integer from 0 to 3")
    if not profiles.is_new_member.isin(["Y", "N"]).all():
        raise ValueError("Unknown new member flag")
    if not labels["split"].eq(labels.post_id.map(posts.set_index("post_id")["split"])).all():
        raise ValueError("Label/post split mismatch")
    profiles["available_from"] = pd.to_datetime(profiles.available_from, format="%Y-%m-%d", errors="raise")
    posts["start_date"] = pd.to_datetime(posts.start_date, format="%Y-%m-%d", errors="raise")
    return tables

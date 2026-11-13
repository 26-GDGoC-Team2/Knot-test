"""Strict schema plus semantic validation of IDs/order and grounded sentences."""
import re


def response_schema(evidence):
    return {
        "type": "object", "additionalProperties": False,
        "required": ["recommendations"],
        "properties": {"recommendations": {
            "type": "array", "minItems": len(evidence), "maxItems": len(evidence),
            "items": {
                "type": "object", "additionalProperties": False,
                "required": ["user_id", "reason"],
                "properties": {
                    "user_id": {"type": "string",
                                "enum": [e["user_id"] for e in evidence]},
                    "reason": {"type": "string", "enum": sorted({
                        reason for e in evidence for reason in e["allowed_reasons"]})}
                }
            }
        }}
    }


def validate_response(payload, evidence):
    if not isinstance(payload, dict) or set(payload) != {"recommendations"}:
        raise ValueError("Expected recommendations object")
    rows = payload["recommendations"]
    if not isinstance(rows, list) or len(rows) != len(evidence):
        raise ValueError("Candidate count mismatch")
    for row, candidate in zip(rows, evidence):
        if not isinstance(row, dict) or set(row) != {"user_id", "reason"}:
            raise ValueError("Unexpected result fields")
        if row["user_id"] != candidate["user_id"]:
            raise ValueError("Candidate ID/order mismatch")
        reason = row["reason"]
        if not isinstance(reason, str) or reason not in candidate["allowed_reasons"]:
            raise ValueError("Reason is not grounded in approved evidence")
        if len(reason) > 240 or not re.search("[가-힣]", reason):
            raise ValueError("Expected a short Korean reason")
    return rows

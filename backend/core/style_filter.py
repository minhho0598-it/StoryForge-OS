import json
from pathlib import Path


FORBIDDEN_PHRASES_PATH = (
    Path(__file__).resolve().parent.parent
    / "prompts"
    / "forbidden_phrases.json"
)


def load_forbidden_phrases(path: Path | None = None) -> list[str]:
    path = path or FORBIDDEN_PHRASES_PATH
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    phrases = data.get("forbidden_phrases") if isinstance(data, dict) else None
    if not isinstance(phrases, list) or not phrases or any(
        not isinstance(phrase, str) or not phrase.strip() for phrase in phrases
    ):
        raise ValueError(
            f"Danh sách forbidden_phrases không hợp lệ trong file: {path}"
        )

    normalized_phrases = [phrase.strip() for phrase in phrases]
    if len({phrase.casefold() for phrase in normalized_phrases}) != len(
        normalized_phrases
    ):
        raise ValueError(f"Danh sách forbidden_phrases bị trùng trong file: {path}")

    return normalized_phrases

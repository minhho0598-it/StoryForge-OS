from typing import Any

from core.prompt_manager import prompt_manager


STORY_STYLES = {
    "literary_book": "Sách văn chương",
    "audio_story": "Truyện audio",
}

CREATIVE_PROMPT_CATALOG = [
    {
        "id": "ideation",
        "stage": "Lên ý tưởng",
        "title": "Sinh ý tưởng story",
        "system": "ideation_system.md",
        "user": "ideation_user.md",
        "audio_system": "style_variants/audio_story/ideation_system.md",
        "literary_system": "style_variants/literary_book/ideation_system.md",
    },
    {
        "id": "story-bible",
        "stage": "Story Bible",
        "title": "Tạo Story Bible",
        "system": "story_bible_system.md",
        "user": "story_bible_user.md",
        "audio_system": "style_variants/audio_story/story_bible_system.md",
        "literary_system": "style_variants/literary_book/story_bible_system.md",
    },
    {
        "id": "character",
        "stage": "Story Bible",
        "title": "Tạo nhân vật",
        "system": "add_character_system.md",
        "user": "add_character_user.md",
        "audio_system": "style_variants/audio_story/add_character_system.md",
        "literary_system": "style_variants/literary_book/add_character_system.md",
    },
    {
        "id": "point-of-view",
        "stage": "Story Bible",
        "title": "Gợi ý ngôi kể",
        "system": "regenerate_pov_system.md",
        "user": "regenerate_pov_user.md",
        "audio_system": "style_variants/audio_story/regenerate_pov_system.md",
        "literary_system": "style_variants/literary_book/regenerate_pov_system.md",
    },
    {
        "id": "relationship",
        "stage": "Story Bible",
        "title": "Tạo mối quan hệ",
        "system": "add_relationship_system.md",
        "user": "add_relationship_user.md",
        "audio_system": "style_variants/audio_story/add_relationship_system.md",
        "literary_system": "style_variants/literary_book/add_relationship_system.md",
    },
    {
        "id": "pacing",
        "stage": "Pacing và chapter",
        "title": "Tạo nhịp truyện và danh sách chapter",
        "system": "pacing_system.md",
        "user": "pacing_user.md",
        "audio_system": "style_variants/audio_story/pacing_system.md",
        "literary_system": "style_variants/literary_book/pacing_system.md",
    },
    {
        "id": "evaluate-pacing",
        "stage": "Pacing và chapter",
        "title": "Đánh giá nhịp truyện",
        "system": "evaluate_pacing_system.md",
        "user": "evaluate_pacing_user.md",
        "audio_system": "style_variants/audio_story/evaluate_pacing_system.md",
        "literary_system": "style_variants/literary_book/evaluate_pacing_system.md",
    },
    {
        "id": "chapter-idea",
        "stage": "Pacing và chapter",
        "title": "Phân tích ý tưởng chỉnh sửa chapter",
        "system": "analyze_chapter_idea_system.md",
        "user": "analyze_chapter_idea_user.md",
        "audio_system": "style_variants/audio_story/analyze_chapter_idea_system.md",
        "literary_system": "style_variants/literary_book/analyze_chapter_idea_system.md",
    },
    {
        "id": "dynamic-chapters",
        "stage": "Pacing và chapter",
        "title": "Tạo hoặc chỉnh sửa chapter",
        "system": "single_chapter_system.md",
        "user": "single_chapter_user.md",
        "audio_system": "style_variants/audio_story/single_chapter_system.md",
        "literary_system": "style_variants/literary_book/single_chapter_system.md",
    },
    {
        "id": "story-outline",
        "stage": "Dàn ý story",
        "title": "Tạo dàn ý tổng thể",
        "system": "story_outline_system.md",
        "user": "story_outline_user.md",
        "audio_system": "style_variants/audio_story/story_outline_system.md",
        "literary_system": "style_variants/literary_book/story_outline_system.md",
    },
    {
        "id": "beat-breakdown",
        "stage": "Beat",
        "title": "Chia chapter thành beats",
        "system": "beat_system.md",
        "user": "beat_user.md",
        "audio_system": "style_variants/audio_story/beat_system.md",
        "literary_system": "style_variants/literary_book/beat_system.md",
    },
    {
        "id": "evaluate-beats",
        "stage": "Beat",
        "title": "Đánh giá cấu trúc beats",
        "system": "evaluate_beats_system.md",
        "user": "evaluate_beats_user.md",
        "audio_system": "style_variants/audio_story/evaluate_beats_system.md",
        "literary_system": "style_variants/literary_book/evaluate_beats_system.md",
    },
    {
        "id": "draft",
        "stage": "Viết bản nháp",
        "title": "Viết beat",
        "system": "draft_system.md",
        "user": "draft_user.md",
        "audio_system": "style_variants/audio_story/draft_system.md",
        "literary_system": "style_variants/literary_book/draft_system.md",
    },
    {
        "id": "memory",
        "stage": "Viết bản nháp",
        "title": "Cập nhật trí nhớ story",
        "system": "memory_system.md",
        "user": "memory_user.md",
        "audio_system": "style_variants/audio_story/memory_system.md",
        "literary_system": "style_variants/literary_book/memory_system.md",
    },
    {
        "id": "analyze-beat-text",
        "stage": "Chỉnh sửa beat",
        "title": "Phân tích đề xuất chỉnh sửa beat",
        "system": "analyze_beat_text_system.md",
        "user": "analyze_beat_text_user.md",
        "audio_system": "style_variants/audio_story/analyze_beat_text_system.md",
        "literary_system": "style_variants/literary_book/analyze_beat_text_system.md",
    },
    {
        "id": "edit-beat-text",
        "stage": "Chỉnh sửa beat",
        "title": "Chỉnh sửa văn bản beat",
        "system": "edit_beat_text_system.md",
        "user": "edit_beat_text_user.md",
        "audio_system": "style_variants/audio_story/edit_beat_text_system.md",
        "literary_system": "style_variants/literary_book/edit_beat_text_system.md",
    },
    {
        "id": "refine",
        "stage": "Hoàn thiện chapter",
        "title": "Biên tập chapter",
        "system": "refine_system.md",
        "user": "refine_user.md",
        "audio_system": "style_variants/audio_story/refine_system.md",
        "literary_system": "style_variants/literary_book/refine_system.md",
    },
]


def normalize_story_style(style: Any) -> str:
    if isinstance(style, str) and style in STORY_STYLES:
        return style
    return "literary_book"


def _system_prompt_filename(entry: dict[str, Any], style: str) -> str:
    if style == "audio_story":
        return entry.get("audio_system", entry["system"])
    return entry["system"]


def load_story_system_prompt(filename: str, literary_style: Any = "literary_book", **kwargs: Any) -> str:
    style = normalize_story_style(literary_style)
    entry = next(
        (item for item in CREATIVE_PROMPT_CATALOG if item["system"] == filename),
        None,
    )
    selected_filename = _system_prompt_filename(entry, style) if entry else filename
    return prompt_manager.load_prompt(selected_filename, **kwargs)


def get_creative_prompt_catalog() -> list[dict[str, Any]]:
    return [
        {
            **entry,
            "versions": {
                style: {
                    "label": label,
                    "system": _system_prompt_filename(entry, style),
                    "system_content": prompt_manager.load_prompt(
                        _system_prompt_filename(entry, style)
                    ),
                    "user_content": prompt_manager.load_prompt(entry["user"]),
                }
                for style, label in STORY_STYLES.items()
            },
        }
        for entry in CREATIVE_PROMPT_CATALOG
    ]

import copy
import hashlib
import json
import re

from core.database import supabase
from core.render_config import normalize_render_config


def _sanitize_story_text(text: str) -> str:
    story_start = re.search(r"<story_text\b[^>]*>", text, re.IGNORECASE)
    if story_start:
        text = text[story_start.end():]
        story_end = re.search(r"</story_text\s*>", text, re.IGNORECASE)
        if story_end:
            text = text[:story_end.start()]

    text = re.sub(r"<!--.*?-->|<\?.*?\?>", "", text, flags=re.DOTALL)
    text = re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", text, flags=re.DOTALL)
    text = re.sub(
        r"</?[A-Za-z_][\w:.-]*(?:\s+[^<>]*?)?\s*/?>",
        "",
        text,
    )
    return text.strip()

def _project_literary_style(project: dict | None) -> str:
    project_data = project or {}
    nested_project = project_data.get("projects")
    if isinstance(nested_project, dict):
        project_data = nested_project
    render_config = project_data.get("render_config")
    return normalize_render_config(render_config).get("literary_style", "literary_book")

def _sanitize_beat_drafts(beats: list[dict]) -> list[dict]:
    return [
        {
            **beat,
            "ai_draft_text": _sanitize_story_text(beat["ai_draft_text"]),
        }
        if isinstance(beat.get("ai_draft_text"), str)
        else beat
        for beat in beats
    ]

def _chapter_signature(chapters: list[dict]) -> list[dict]:
    signature_fields = (
        "id",
        "chapter_number",
        "title",
        "timeline_period",
        "pov_character",
        "main_event",
        "primary_function",
        "emotional_beat",
        "relationship_beat",
        "chapter_hook",
        "continuity_note",
    )
    return [
        {field: chapter.get(field) or "" for field in signature_fields}
        for chapter in chapters
    ]

def _story_bible_signature(story_bible: dict | None) -> str:
    canonical_bible = json.dumps(
        story_bible or {},
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical_bible.encode("utf-8")).hexdigest()

async def _load_project_chapters(project_id: str) -> list[dict]:
    result = (
        supabase.table("chapters")
        .select(
            "id, chapter_number, title, timeline_period, pov_character, main_event, "
            "primary_function, emotional_beat, relationship_beat, chapter_hook, continuity_note"
        )
        .eq("project_id", project_id)
        .order("chapter_number")
        .execute()
    )
    return result.data or []

async def _project_has_beats(project_id: str) -> bool:
    chapter_result = supabase.table("chapters").select("id").eq("project_id", project_id).execute()
    chapter_ids = [chapter["id"] for chapter in chapter_result.data or []]
    if not chapter_ids:
        return False
    for chapter_id in chapter_ids:
        beats = (
            supabase.table("beats")
            .select("id")
            .eq("chapter_id", chapter_id)
            .limit(1)
            .execute()
        )
        if beats.data:
            return True
    return False

def _format_previous_beats(chapters_with_beats: list[tuple[dict, list[dict]]]) -> str:
    sections = []
    for chapter, beats in chapters_with_beats:
        if not beats:
            continue
        beat_lines = [
            {
                "beat_id": beat.get("beat_id"),
                "location": beat.get("location"),
                "characters_present": beat.get("characters_present"),
                "action_and_dialogue": beat.get("action_and_dialogue"),
                "emotional_shift": beat.get("emotional_shift"),
            }
            for beat in beats
        ]
        sections.append(
            json.dumps(
                {
                    "chapter_number": chapter.get("chapter_number"),
                    "chapter_title": chapter.get("title"),
                    "beats": beat_lines,
                },
                ensure_ascii=False,
            )
        )
    return "\n".join(sections)

def get_pov_instruction(story_bible: dict, pov_character: str = "") -> str:
    """Return the explicit POV instruction, including compatibility for older bibles."""
    if not story_bible:
        return ""

    explicit_instruction = story_bible.get("pov_instruction")
    if explicit_instruction:
        return explicit_instruction

    recommendation = story_bible.get("narrative_rules", {}).get("pov_recommendation", {})
    fallback_instruction = recommendation.get("system_instruction_string", "")
    if fallback_instruction and "[Tên]" not in fallback_instruction:
        return fallback_instruction

    if fallback_instruction and pov_character:
        return fallback_instruction.replace("[Tên]", pov_character)

    return fallback_instruction

def get_optimized_bible(full_bible: dict, task: str, present_characters: list = None, pov_character: str = "") -> dict:
    """
    Hàm gọt dũa Story Bible tùy theo tác vụ của AI để tránh pha loãng ngữ cảnh (Context Dilution).
    """
    if not full_bible:
        return {}

    optimized = copy.deepcopy(full_bible)

    # ====================================================
    # TÁC VỤ 1: PACING & SINGLE CHAPTER (Kiến trúc vĩ mô)
    # ====================================================
    if task in ["pacing", "single_chapter"]:
        if "characters" in optimized:
            for char in optimized.get("characters", []):
                char.pop("appearance", None)
                char.pop("habits", None)
                char.pop("living_situation", None)
                char.pop("career_and_financial_status", None)

        if "world_building" in optimized:
            optimized["world_building"].pop("daily_life", None)

        if task == "single_chapter":
            optimized.pop("emotional_architecture", None)
            optimized.pop("story_continuity", None)

    # ====================================================
    # TÁC VỤ 2: BEAT BREAKDOWN (Đạo diễn chia cảnh)
    # ====================================================
    elif task == "beat_breakdown":
        if "characters" in optimized:
            for char in optimized.get("characters", []):
                char.pop("appearance", None)
                char.pop("character_arc", None)

        if "world_building" in optimized:
            optimized["world_building"].pop("cultural_context", None)
            optimized["world_building"].pop("past_setting", None)

        optimized.pop("emotional_architecture", None)
        optimized.pop("story_identity", None)

    # ====================================================
    # TÁC VỤ 3: DRAFTING (Nhà văn viết chữ) - LỌC CỰC MẠNH
    # ====================================================
    elif task == "drafting":
        if "characters" in optimized:
            search_terms = [p.lower().strip() for p in (present_characters or []) if p]
            if pov_character:
                search_terms.append(pov_character.lower().strip())

            # FIX #1: Nếu không có bất kỳ thông tin nhân vật có mặt nào được truyền vào,
            # KHÔNG được coi tất cả là "vắng mặt" (sẽ làm mất hết appearance/personality
            # của mọi nhân vật). Fallback an toàn: coi như ai cũng có thể xuất hiện.
            no_filter_info = len(search_terms) == 0

            for char in optimized["characters"]:
                char_name = char.get("name", "").lower()
                is_present = no_filter_info or any(
                    st in char_name or char_name in st for st in search_terms
                )

                if not is_present:
                    # FIX #2: Cắt tỉa triệt để hơn cho nhân vật vắng mặt, đúng với ý đồ
                    # "chỉ giữ Tên, Vai trò và Quan hệ" — bổ sung các trường còn sót lại
                    # trước đây (đặc biệt secrets_or_insecurities, có thể là spoiler
                    # chưa tới lúc tiết lộ).
                    for field in (
                        "appearance",
                        "habits",
                        "fear",
                        "emotional_need",
                        "internal_conflict",
                        "personality",
                        "character_arc",
                        "secrets_or_insecurities",
                        "external_pressure",
                        "timeline_evolution",
                        "career_and_financial_status",
                        "living_situation",
                    ):
                        char.pop(field, None)
                # Người có mặt: giữ nguyên toàn bộ để AI có tư liệu miêu tả giác quan.
                # Lưu ý: character_arc (bao gồm ending_state/truth_they_learn) vẫn được
                # giữ đầy đủ cho người có mặt — nếu đây không phải chủ đích (sợ AI viết
                # "đi trước" tiến độ arc ở beat sớm), cần lọc thêm ở bước này.

        # Giữ lại toàn bộ `relationship_dynamics` để AI biết cách xưng hô (Anh-Em, Tôi-Cô...).

        keys_to_drop = ["story_identity", "conflict_system", "story_continuity", "emotional_architecture"]
        for k in keys_to_drop:
            optimized.pop(k, None)

        if "world_building" in optimized:
            optimized["world_building"].pop("socio_economic_pressures", None)

    return optimized

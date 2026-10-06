from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field


class IdeationRequest(BaseModel):
    story_premise: str
    target_lenses: List[Literal[
        "purist",
        "false_truth",
        "contract",
        "dark_twist",
        "second_chance",
        "healing",
        "forbidden",
        "steamy",
    ]] = Field(
        default_factory=lambda: [
            "purist",
            "false_truth",
            "contract",
            "dark_twist",
            "second_chance",
            "healing",
            "forbidden",
            "steamy",
        ],
        min_length=1,
    )
    ideas_per_lens: int = Field(default=1, ge=1, le=5)
    heat_level: int = Field(default=1, ge=1, le=5)

# Schema khi user bấm "Tạo dự án" từ 1 ý tưởng
class ProjectCreateRequest(BaseModel):
    title: str
    vibe: str
    logline: str
    vietnamese_context: str
    thematic_question: str
    situational_irony: str
    micro_conflict: str
    story_premise: str
    heat_level: int = Field(default=1, ge=1, le=5)

# Schema dùng để update Story Bible hoặc Pacing do user tự sửa tay
class ProjectUpdateRequest(BaseModel):
    story_bible: Optional[Any] = None
    pacing_outline: Optional[Any] = None
    status: Optional[str] = None

class RenderRequest(BaseModel):
    chapter_id: str
    voice_id: str # Ví dụ: "Nguyệt Nga", "Bảo Hoàng"
    
    # Đường dẫn Local do User upload/chọn trên giao diện
    intro_video_path: str 
    main_video_path: str
    background_folder_path: str # Thư mục chứa các video nền
    background_audio_path: str  # Đường dẫn audio nền cho mode simple
    use_background_audio: bool = False
    
    # Tọa độ lồng ghép (Overlay)
    overlay_x: int = 165
    overlay_y: int = 10
    overlay_w: int = 601
    overlay_h: int = 1070

class BeatUpdateRequest(BaseModel):
    draft_text: str | None = None
    location: str | None = None
    characters_present: str | None = None
    action_and_dialogue: str | None = None
    emotional_shift: str | None = None


class BeatInsertRequest(BaseModel):
    insert_index: int = Field(ge=0)
    location: str | None = None
    characters_present: str | None = None
    action_and_dialogue: str | None = None
    emotional_shift: str | None = None
    draft_text: str | None = None


class BeatEvaluationRequest(BaseModel):
    scope: Literal["chapter", "story"]
    chapter_id: str | None = None

class ChapterUpdateRequest(BaseModel):
    final_content: str

class MetadataGenerateRequest(BaseModel):
    target_type: str
    tone: str = "Cân bằng"

class UpdateVideoMetadataRequest(BaseModel):
    video_metadata: dict

class UpdateBibleRequest(BaseModel):
    story_bible: dict

class UpdateChapterGoalRequest(BaseModel):
    goal: str

class BulkBeatUpdateRequest(BaseModel):
    beats: list[dict]

class LyricsExtractRequest(BaseModel):
    lyrics: str

class UpdateRenderConfigRequest(BaseModel):
    render_config: dict


class RenderConfigPayload(BaseModel):
    voice_id: str
    render_mode: Literal["full", "simple"]
    auto_split_parts: bool
    use_background_audio: bool
    story_intro_enabled: bool = False
    story_intro_position: Literal["start", "end"] = "start"
    story_intro_pause_ms: int = 1000
    intro_video_path: str
    main_video_path: str
    background_folder_path: str
    background_audio_path: str
    overlay_x: int
    overlay_y: int
    overlay_w: int
    overlay_h: int


class UpdateGlobalRenderConfigRequest(BaseModel):
    render_config: RenderConfigPayload

class GenerateCharacterRequest(BaseModel):
    user_prompt: str
    current_bible: dict

class GeneratePovRecommendationRequest(BaseModel):
    current_bible: dict
    suggested_type: str

class GenerateRelationshipRequest(BaseModel):
    mode: Literal["manual", "automatic"] = "manual"
    user_prompt: str = ""
    current_bible: dict
    character_a_index: Optional[int] = None
    character_b_index: Optional[int] = None
    character_a_description: str = ""
    character_b_description: str = ""

class ChapterItem(BaseModel):
    id: str | None = None # ID có thể null nếu là chapter mới tạo trên UI
    chapter_number: int
    title: str
    timeline_period: str
    pov_character: str
    main_event: str
    primary_function: str
    emotional_beat: str | None = ""
    relationship_beat: str | None = ""
    chapter_hook: str | None = ""
    continuity_note: str | None = ""

class BulkUpdateChaptersRequest(BaseModel):
    chapters: list[ChapterItem]

class StoryOutlineUpdateRequest(BaseModel):
    story_outline: str
    confirmed: bool = False
    chapter_signature: list[dict]
    story_bible_signature: str

class GenerateAllBeatsRequest(BaseModel):
    reset_existing: bool = False

class GenerateSingleChapterRequest(BaseModel):
    action_type: str  # "insert" hoặc "edit"
    target_index: int
    user_prompt: str
    current_chapters: list

class AnalyzeChapterIdeaRequest(BaseModel):
    action_type: str
    target_index: int
    user_prompt: str
    current_chapters: list

class AnalyzeBeatTextRequest(BaseModel):
    user_prompt: str
    current_text: str

class EditBeatTextRequest(BaseModel):
    user_prompt: str
    current_text: str
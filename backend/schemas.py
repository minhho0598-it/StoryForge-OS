from typing import Any, List, Optional

from pydantic import BaseModel


class IdeationRequest(BaseModel):
    story_premise: str

# Schema khi user bấm "Tạo dự án" từ 1 ý tưởng
class ProjectCreateRequest(BaseModel):
    title: str
    vibe: str
    logline: str
    vietnamese_context: str
    situational_irony: str
    micro_conflict: str
    story_premise: str

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
    silence_audio_path: str     # Đường dẫn tới file audio trống (ngắt nghỉ)
    
    # Tọa độ lồng ghép (Overlay)
    overlay_x: int = 165
    overlay_y: int = 10
    overlay_w: int = 601
    overlay_h: int = 1070

class BeatUpdateRequest(BaseModel):
    draft_text: str

class ChapterUpdateRequest(BaseModel):
    final_content: str

class MetadataGenerateRequest(BaseModel):
    target_type: str

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
    video_metadata: dict

class GenerateCharacterRequest(BaseModel):
    user_prompt: str
    current_bible: dict

class GenerateRelationshipRequest(BaseModel):
    user_prompt: str
    current_bible: dict
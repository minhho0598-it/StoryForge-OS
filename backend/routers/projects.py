import json
from fastapi import APIRouter, HTTPException

from core.database import supabase
from core.prompt_manager import prompt_manager
from core.render_config import get_global_render_config
from core.story_prompts import load_story_system_prompt
from schemas import (
    AnalyzeChapterIdeaRequest,
    GenerateCharacterRequest,
    GeneratePovRecommendationRequest,
    GenerateRelationshipRequest,
    GenerateSingleChapterRequest,
    IdeationRequest,
    ProjectCreateRequest,
    StoryBibleFieldEditRequest,
    StoryBibleFieldEditProposal,
    UpdateBibleRequest,
)
from services.llm_service import generate_json

from .common import (
    _chapter_signature,
    _load_project_chapters,
    _project_literary_style,
    _story_bible_signature,
    get_optimized_bible,
)

router = APIRouter()

_MISSING_FIELD = object()


def _get_bible_field_value(
    story_bible: dict,
    field_path: list[str | int],
    *,
    allow_missing_leaf: bool = False,
):
    value = story_bible
    for index, part in enumerate(field_path):
        if isinstance(part, str) and isinstance(value, dict):
            if part not in value:
                missing_suffix = field_path[index:]
                if allow_missing_leaf and all(
                    isinstance(segment, str) for segment in missing_suffix
                ):
                    return _MISSING_FIELD
                raise ValueError("Đường dẫn field không tồn tại trong Story Bible.")
            value = value[part]
        elif isinstance(part, int) and not isinstance(part, bool) and isinstance(value, list):
            if part < 0 or part >= len(value):
                raise ValueError("Chỉ số field không hợp lệ trong Story Bible.")
            value = value[part]
        else:
            raise ValueError("Đường dẫn field không hợp lệ trong Story Bible.")

    if isinstance(value, dict):
        raise ValueError("Chỉ có thể sửa field dữ liệu, không thể thay thế nhóm field.")
    if isinstance(value, list) and not all(
        item is None or isinstance(item, (str, int, float, bool))
        for item in value
    ):
        raise ValueError("Chỉ hỗ trợ field dạng danh sách giá trị đơn.")
    return value


def _is_compatible_bible_value(value, expected_type: str) -> bool:
    if expected_type == "string":
        return isinstance(value, str)
    if expected_type == "boolean":
        return isinstance(value, bool)
    if expected_type == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected_type == "string_array":
        return isinstance(value, list) and all(isinstance(item, str) for item in value)
    return False


def _validate_bible_field_edit_response(result: dict, request: StoryBibleFieldEditRequest) -> dict:
    editable_fields = {
        tuple(field.path): field
        for field in request.editable_fields
    }
    selected_field = editable_fields.get(tuple(request.field_path))
    if selected_field is None or selected_field.field_type != request.field_type:
        raise ValueError("Field được chọn không nằm trong danh sách field có thể chỉnh sửa.")
    if not isinstance(result, dict) or "field_value" not in result:
        raise ValueError("AI không trả về giá trị field chính hợp lệ.")
    if not _is_compatible_bible_value(result["field_value"], request.field_type):
        raise ValueError("AI trả về giá trị field chính không đúng kiểu dữ liệu.")

    related_changes = result.get("related_changes")
    if not isinstance(related_changes, list) or len(related_changes) > 20:
        raise ValueError("AI không trả về danh sách field liên quan hợp lệ.")

    validated_changes = []
    selected_path = request.field_path
    seen_paths = {tuple(selected_path)}
    for change in related_changes:
        if not isinstance(change, dict):
            raise ValueError("AI trả về field liên quan không hợp lệ.")
        path = change.get("path")
        reason = change.get("reason")
        if (
            not isinstance(path, list)
            or not path
            or len(path) > 10
            or not all(
                isinstance(part, str)
                or (isinstance(part, int) and not isinstance(part, bool))
                for part in path
            )
            or not isinstance(reason, str)
            or not reason.strip()
        ):
            raise ValueError("AI trả về đường dẫn hoặc lý do field liên quan không hợp lệ.")

        path_key = tuple(path)
        if path_key in seen_paths:
            raise ValueError("AI trả về field liên quan bị trùng hoặc trùng field đang sửa.")
        seen_paths.add(path_key)

        field = editable_fields.get(path_key)
        if field is None:
            raise ValueError("AI đề xuất field không nằm trong Story Bible editor.")
        current_value = _get_bible_field_value(request.current_bible, path)
        if current_value is not None and not _is_compatible_bible_value(
            current_value,
            field.field_type,
        ):
            raise ValueError("Kiểu dữ liệu field liên quan không khớp với Story Bible hiện tại.")
        if not _is_compatible_bible_value(change.get("value"), field.field_type):
            raise ValueError("AI trả về field liên quan không đúng kiểu dữ liệu hiện tại.")
        validated_changes.append({
            "path": path,
            "label": field.label,
            "value": change["value"],
            "reason": reason.strip(),
        })

    return {
        "field_value": result["field_value"],
        "related_changes": validated_changes,
    }


@router.post("/api/ideation")
async def generate_ideas(request: IdeationRequest):
    """
    Nhận premise và tùy chọn lăng kính -> Trả về ý tưởng theo số lượng yêu cầu
    """
    try:
        literary_style = get_global_render_config(supabase).get("literary_style", "literary_book")
        system_prompt = load_story_system_prompt("ideation_system.md", literary_style)
        user_prompt = prompt_manager.load_prompt(
            "ideation_user.md", 
            story_premise=request.story_premise,
            heat_level=request.heat_level,
            target_lenses=json.dumps(request.target_lenses, ensure_ascii=False),
            ideas_per_lens=request.ideas_per_lens,
        )
        
        result = await generate_json(system_prompt, user_prompt)
        
        if "ideas" not in result:
            raise ValueError("AI không trả về key 'ideas' như yêu cầu.")
            
        return {
            "success": True, 
            "analyzed_vibe": result.get("analyzed_vibe", "Không xác định"),
            "data": result["ideas"]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/projects")
async def create_project(request: ProjectCreateRequest):
    """
    Tạo một Project mới trong Supabase khi user chọn 1 ý tưởng.
    """
    try:
        # Chuẩn bị data để insert
        project_data = {
            "title": request.title,
            "vibe": request.vibe,
            "logline": request.logline,
            "thematic_question": request.thematic_question,
            "vietnamese_context": request.vietnamese_context,
            "story_premise": request.story_premise,
            "situational_irony": request.situational_irony,
            "micro_conflict": request.micro_conflict,
            "heat_level": request.heat_level,
            "render_config": get_global_render_config(supabase),
            "status": "Idea Selected"
        }
        
        # Insert vào Supabase
        response = supabase.table("projects").insert(project_data).execute()
        
        if not response.data:
            raise Exception("Lỗi khi lưu vào cơ sở dữ liệu.")
            
        # Trả về Project ID vừa tạo
        return {"success": True, "project_id": response.data[0]["id"], "data": response.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/projects/{project_id}/generate-bible")
async def generate_story_bible(project_id: str):
    """
    Đọc Idea từ DB -> Gọi LLM tạo Story Bible -> Lưu vào DB.
    """
    try:
        # 1. Lấy thông tin Idea từ Database
        db_res = (
            supabase.table("projects")
            .select(
                "id",
                "title",
                "vibe",
                "logline",
                "vietnamese_context",
                "micro_conflict",
                "situational_irony",
                "heat_level, render_config",
            )
            .eq("id", project_id)
            .execute()
        )
        if not db_res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án.")
        
        project = db_res.data[0]
        
        # Đóng gói Idea thành JSON string để nhét vào prompt
        story_seed_json = json.dumps({
            "title": project["title"],
            "vibe": project["vibe"],
            "logline": project["logline"],
            "vietnamese_context": project["vietnamese_context"],
            "micro_conflict": project["micro_conflict"],
            "situational_irony": project["situational_irony"]
        }, ensure_ascii=False)

        # 2. Load Prompts
        system_prompt = load_story_system_prompt(
            "story_bible_system.md",
            _project_literary_style(project),
        )
        heat_level = project.get("heat_level")
        if not isinstance(heat_level, int) or not 1 <= heat_level <= 5:
            heat_level = 1

        user_prompt = prompt_manager.load_prompt(
            "story_bible_user.md",
            story_seed=story_seed_json,
            heat_level=heat_level,
        )
        
        # 3. Gọi Local Gemini
        bible_result = await generate_json(system_prompt, user_prompt)
        
        # 4. Cập nhật Story Bible vào Database
        update_res = supabase.table("projects").update({
            "story_bible": bible_result,
            "status": "Bible Ready"
        }).eq("id", project_id).execute()

        print(update_res)

        return {"success": True, "message": "Tạo Story Bible thành công", "data": bible_result}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/api/projects/{project_id}/update-bible")
async def update_story_bible(project_id: str, request: UpdateBibleRequest):
    try:
        supabase.table("projects").update({"story_bible": request.story_bible}).eq("id", project_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/projects/{project_id}/edit-bible-field")
async def edit_story_bible_field(project_id: str, request: StoryBibleFieldEditRequest):
    try:
        current_value = _get_bible_field_value(
            request.current_bible,
            request.field_path,
            allow_missing_leaf=True,
        )
        editable_fields = {
            tuple(field.path): field
            for field in request.editable_fields
        }
        selected_field = editable_fields.get(tuple(request.field_path))
        if (
            selected_field is None
            or selected_field.field_type != request.field_type
            or selected_field.label != request.field_label
        ):
            raise ValueError("Field được chọn không nằm trong danh sách field có thể chỉnh sửa.")
        if current_value is not _MISSING_FIELD and current_value is not None:
            if request.field_type == "string_array":
                compatible = isinstance(current_value, list) and all(
                    isinstance(item, str) for item in current_value
                )
            else:
                compatible = _is_compatible_bible_value(current_value, request.field_type)
            if not compatible:
                raise ValueError("Kiểu dữ liệu field không khớp với Story Bible hiện tại.")
        system_prompt = prompt_manager.load_prompt("story_bible_field_edit_system.md")
        user_prompt = prompt_manager.load_prompt(
            "story_bible_field_edit_user.md",
            current_bible=json.dumps(request.current_bible, ensure_ascii=False),
            field_path=json.dumps(request.field_path, ensure_ascii=False),
            field_label=request.field_label.strip(),
            field_type=request.field_type,
            editable_fields=json.dumps(
                [field.model_dump() for field in request.editable_fields],
                ensure_ascii=False,
            ),
            current_value=(
                "null"
                if current_value is _MISSING_FIELD
                else json.dumps(current_value, ensure_ascii=False)
            ),
            user_prompt=request.user_prompt.strip(),
        )
        result = await generate_json(system_prompt, user_prompt)
        validated_result = StoryBibleFieldEditProposal.model_validate(
            _validate_bible_field_edit_response(result, request)
        )
        return {"success": True, "data": validated_result.model_dump()}
    except ValueError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/projects/{project_id}/generate-character")
async def generate_character(project_id: str, request: GenerateCharacterRequest):
    try:
        project_res = supabase.table("projects").select("heat_level, render_config").eq("id", project_id).single().execute()
        heat_level = project_res.data.get("heat_level", 1)
        system_prompt = load_story_system_prompt(
            "add_character_system.md",
            _project_literary_style(project_res.data),
        )
        user_prompt = prompt_manager.load_prompt(
            "add_character_user.md",
            current_bible=json.dumps(request.current_bible, ensure_ascii=False),
            user_prompt=request.user_prompt,
            heat_level=heat_level
        )
        
        result = await generate_json(system_prompt, user_prompt)
        new_char = result.get("new_character")
        
        if not new_char:
            raise ValueError("AI không tạo được nhân vật theo đúng chuẩn.")
            
        return {"success": True, "data": new_char}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/projects/{project_id}/regenerate-pov-recommendation")
async def regenerate_pov_recommendation(
    project_id: str, request: GeneratePovRecommendationRequest
):
    suggested_type = request.suggested_type.strip()
    if not suggested_type:
        raise HTTPException(status_code=400, detail="Vui lòng nhập loại ngôi kể.")

    try:
        project_res = (
            supabase.table("projects")
            .select("render_config")
            .eq("id", project_id)
            .single()
            .execute()
        )
        system_prompt = load_story_system_prompt(
            "regenerate_pov_system.md",
            _project_literary_style(project_res.data),
        )
        user_prompt = prompt_manager.load_prompt(
            "regenerate_pov_user.md",
            current_bible=json.dumps(request.current_bible, ensure_ascii=False),
            suggested_type=suggested_type,
        )
        result = await generate_json(system_prompt, user_prompt)

        reasoning = result.get("reasoning")
        system_instruction_string = result.get("system_instruction_string")
        if not isinstance(reasoning, str) or not reasoning.strip():
            raise ValueError("AI không trả về giải thích POV hợp lệ.")
        if not isinstance(system_instruction_string, str) or not system_instruction_string.strip():
            raise ValueError("AI không trả về chỉ thị ngôi kể hợp lệ.")

        return {
            "success": True,
            "data": {
                "reasoning": reasoning.strip(),
                "system_instruction_string": system_instruction_string.strip(),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/projects/{project_id}/generate-relationship")
async def generate_relationship(project_id: str, request: GenerateRelationshipRequest):
    current_bible = request.current_bible
    selected_characters = []

    project_res = supabase.table("projects").select("heat_level, render_config").eq("id", project_id).single().execute()
    heat_level = project_res.data.get("heat_level", 1)

    if request.mode == "manual":
        if not request.user_prompt.strip():
            raise HTTPException(status_code=400, detail="Vui lòng nhập mô tả mối quan hệ.")
        generation_request = request.user_prompt.strip()
    else:
        character_a_index = request.character_a_index
        character_b_index = request.character_b_index
        characters = current_bible.get("characters", [])
        if (
            character_a_index is None
            or character_b_index is None
            or character_a_index == character_b_index
            or not isinstance(characters, list)
            or min(character_a_index, character_b_index) < 0
            or max(character_a_index, character_b_index) >= len(characters)
        ):
            raise HTTPException(status_code=400, detail="Vui lòng chọn hai nhân vật khác nhau trong Story Bible.")

        selected_characters = [characters[character_a_index], characters[character_b_index]]
        generation_request = ""

    try:
        system_prompt = load_story_system_prompt(
            "add_relationship_system.md",
            _project_literary_style(project_res.data),
        )
        user_prompt = prompt_manager.load_prompt(
            "add_relationship_user.md",
            current_bible=json.dumps(current_bible, ensure_ascii=False),
            generation_mode=request.mode,
            user_prompt=generation_request,
            selected_characters=json.dumps(selected_characters, ensure_ascii=False),
            character_a_description=request.character_a_description.strip(),
            character_b_description=request.character_b_description.strip(),
            heat_level=heat_level
        )
        
        result = await generate_json(system_prompt, user_prompt)
        new_rel = result.get("new_relationship")
        
        if not new_rel:
            raise ValueError("AI không tạo được mối quan hệ theo đúng chuẩn.")
            
        return {"success": True, "data": new_rel}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/projects/{project_id}/generate-pacing")
async def generate_pacing(project_id: str):
    """
    Đọc Bible từ DB -> LLM tạo Pacing -> Update Project -> Tự động sinh danh sách Chapters vào DB.
    """
    try:
        # 1. Fetch data từ Supabase
        db_res = (
            supabase.table("projects")
            .select("id, title, vibe, logline, story_bible, render_config")
            .eq("id", project_id)
            .execute()
        )
        if not db_res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án.")
        
        project = db_res.data[0]
        
        # Nếu chưa có Story Bible thì báo lỗi
        if not project.get("story_bible"):
            raise HTTPException(status_code=400, detail="Dự án chưa có Story Bible. Hãy tạo Bible trước.")

        # Đóng gói Seed
        story_seed_json = json.dumps({
            "title": project["title"],
            "vibe": project["vibe"],
            "logline": project["logline"]
        }, ensure_ascii=False)

        # 2. Load Prompts
        optimized_bible = get_optimized_bible(project["story_bible"], task="pacing")
        system_prompt = load_story_system_prompt(
            "pacing_system.md",
            _project_literary_style(project),
        )
        user_prompt = prompt_manager.load_prompt(
            "pacing_user.md", 
            story_seed=story_seed_json,
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
        )
        
        # 3. Gọi LLM
        pacing_result = await generate_json(system_prompt, user_prompt)
        
        # 4. Lưu tổng thể Pacing Outline vào bảng Projects
        supabase.table("projects").update({
            "pacing_outline": pacing_result,
            "status": "Pacing Ready"
        }).eq("id", project_id).execute()

        # ==========================================
        # 5. CHẺ DỮ LIỆU VÀ BULK INSERT VÀO BẢNG CHAPTERS
        # ==========================================
        
        supabase.table("chapters").delete().eq("project_id", project_id).execute()
        
        chapter_map = pacing_result.get("chapter_map", [])
        chapters_to_insert = []
        
        for chapter in chapter_map:
            pov_characters = chapter.get("pov_character", "Unknown")
            if isinstance(pov_characters, list):
                pov_characters = ", ".join(map(str, pov_characters))
            chapters_to_insert.append({
                "project_id": project_id,
                "chapter_number": chapter.get("chapter_number"),
                "title": chapter.get("title", f"Chương {chapter.get('chapter_number')}"),
                "timeline_period": chapter.get("timeline_period", "Hiện tại"),
                "pov_character": pov_characters,
                "main_event": chapter.get("main_event", ""),
                "primary_function": chapter.get("primary_function", ""),
                "emotional_beat": chapter.get("emotional_beat", ""),
                "relationship_beat": chapter.get("relationship_beat", ""),
                "chapter_hook": chapter.get("chapter_hook", ""),
                "continuity_note": chapter.get("continuity_note", ""),
                "status": "Drafting Pending"
            })
            
        if chapters_to_insert:
            supabase.table("chapters").insert(chapters_to_insert).execute()

        return {
            "success": True, 
            "message": f"Tạo cấu trúc thành công. Đã sinh ra {len(chapters_to_insert)} chương.",
            "total_chapters": len(chapters_to_insert)
        }
        
    except Exception as e:
        print(f"[Error] Lỗi khi tạo Pacing: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/projects/{project_id}/evaluate-pacing")
async def evaluate_pacing(project_id: str):
    try:
        # Lấy Bible và Chapters
        proj_res = supabase.table("projects").select("story_bible").eq("id", project_id).execute()
        chap_res = (
            supabase.table("chapters")
            .select(
                "chapter_number, title, primary_function, main_event, emotional_beat, relationship_beat, timeline_period, chapter_hook, continuity_note"
            )
            .eq("project_id", project_id)
            .order("chapter_number")
            .execute()
        )

        if not proj_res.data or not chap_res.data:
            raise HTTPException(status_code=400, detail="Thiếu dữ liệu để đánh giá.")
            
        optimized_bible = get_optimized_bible(proj_res.data[0].get("story_bible"), task="pacing")
        
        system_prompt = load_story_system_prompt(
            "evaluate_pacing_system.md",
            _project_literary_style(proj_res.data[0]),
        )
        user_prompt = prompt_manager.load_prompt(
            "evaluate_pacing_user.md",
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
            chapters=json.dumps(chap_res.data, ensure_ascii=False)
        )
        
        result_json = await generate_json(system_prompt, user_prompt)
        return {"success": True, "data": result_json}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/projects/{project_id}/analyze-chapter-idea")
async def analyze_chapter_idea(project_id: str, request: AnalyzeChapterIdeaRequest):
    """Bước 1: Trả về lời phản biện (Critique) cho ý tưởng của User."""
    try:
        proj_res = supabase.table("projects").select("story_bible, heat_level, render_config").eq("id", project_id).execute()
        optimized_bible = get_optimized_bible(proj_res.data[0].get("story_bible"), task="single_chapter")
        heat_level = proj_res.data[0].get("heat_level", 1)

        system_prompt = load_story_system_prompt(
            "analyze_chapter_idea_system.md",
            _project_literary_style(proj_res.data[0]),
        )
        user_prompt = prompt_manager.load_prompt(
            "analyze_chapter_idea_user.md",
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
            heat_level=heat_level,
            current_chapters=json.dumps(request.current_chapters, ensure_ascii=False),
            action_type=request.action_type,
            target_index=request.target_index,
            user_prompt=request.user_prompt
        )
        
        result = await generate_json(system_prompt, user_prompt)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/projects/{project_id}/generate-dynamic-chapters")
async def generate_dynamic_chapters(project_id: str, request: GenerateSingleChapterRequest):
    """Bước 2: Nhận Prompt (Gốc hoặc Đã sửa) và sinh ra 1 đến N chương."""
    try:
        proj_res = supabase.table("projects").select("story_bible, render_config").eq("id", project_id).execute()
        optimized_bible = get_optimized_bible(proj_res.data[0].get("story_bible"), task="single_chapter")

        system_prompt = load_story_system_prompt(
            "single_chapter_system.md",
            _project_literary_style(proj_res.data[0]),
        )
        user_prompt = prompt_manager.load_prompt(
            "single_chapter_user.md",
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
            current_chapters=json.dumps(request.current_chapters, ensure_ascii=False),
            action_type=request.action_type,
            target_index=request.target_index,
            user_prompt=request.user_prompt  # Đây có thể là Prompt do AI gợi ý ở Bước 1
        )
        
        result_json = await generate_json(system_prompt, user_prompt)
        
        if "chapters" not in result_json:
            raise ValueError("AI không trả về mảng 'chapters'.")
            
        return {"success": True, "data": result_json["chapters"]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/projects")
async def get_all_projects():
    """
    Lấy danh sách tất cả dự án, sắp xếp mới nhất lên đầu.
    """
    try:
        res = supabase.table("projects").select(
            "id, title, vibe, logline, heat_level, status, created_at"
        ).order("created_at", desc=True).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/projects/{project_id}")
async def get_single_project(project_id: str):
    try:
        res = supabase.table("projects").select("*").eq("id", project_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án.")
        project = res.data[0]
        chapters = await _load_project_chapters(project_id)
        outline = project.get("story_outline") or {}
        project["story_outline_current"] = bool(
            outline.get("confirmed")
            and outline.get("chapter_signature") == _chapter_signature(chapters)
            and outline.get("story_bible_signature") == _story_bible_signature(project.get("story_bible"))
        )
        return {"success": True, "data": project}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/projects/{project_id}/video-metadata")
async def get_project_video_metadata(project_id: str):
    try:
        res = supabase.table("projects").select("video_metadata").eq("id", project_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án.")
        return {"success": True, "data": res.data[0].get("video_metadata", {})}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/projects/{project_id}/status-only")
async def get_project_status_only(project_id: str):
    try:
        # Lấy thêm render_progress và render_task_msg
        proj_res = supabase.table("projects").select("status, render_progress, render_task_msg").eq("id", project_id).execute()
        chap_res = supabase.table("chapters").select("id, chapter_number, status").eq("project_id", project_id).execute()
        
        proj_data = proj_res.data[0] if proj_res.data else {}
        
        return {
            "success": True, 
            "project_status": proj_data.get("status", "Unknown"),
            "project_progress": proj_data.get("render_progress", 0),  # Tên key trả về Frontend phải khớp!
            "task_msg": proj_data.get("render_task_msg", ""),         # Tên key trả về Frontend phải khớp!
            "chapters": chap_res.data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

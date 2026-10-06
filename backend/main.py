import hashlib
import json
import os
import re
import subprocess
import tempfile

import httpx

from core.database import supabase  # Import DB
from core.prompt_manager import prompt_manager
from core.render_config import get_global_render_config, normalize_render_config, save_global_render_config
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from schemas import (
    AnalyzeBeatTextRequest,
    AnalyzeChapterIdeaRequest,
    BeatEvaluationRequest,
    BeatInsertRequest,
    BeatUpdateRequest,
    BulkBeatUpdateRequest,
    BulkUpdateChaptersRequest,
    ChapterUpdateRequest,
    EditBeatTextRequest,
    GenerateCharacterRequest,
    GenerateAllBeatsRequest,
    GeneratePovRecommendationRequest,
    GenerateRelationshipRequest,
    GenerateSingleChapterRequest,
    IdeationRequest,
    MetadataGenerateRequest,
    ProjectCreateRequest,
    StoryOutlineUpdateRequest,
    UpdateGlobalRenderConfigRequest,
    UpdateBibleRequest,
    UpdateRenderConfigRequest,
    UpdateVideoMetadataRequest,
)
from services.llm_service import generate_json, generate_text_xml
from services.tts_service import fetch_tts_voices, generate_audio_file
from services.video_service import process_full_project_video

app = FastAPI(title="Story Maker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


# ==========================================
# 1.1 GENERATE IDEA
# ==========================================
@app.post("/api/ideation")
async def generate_ideas(request: IdeationRequest):
    """
    Nhận premise và tùy chọn lăng kính -> Trả về ý tưởng theo số lượng yêu cầu
    """
    try:
        system_prompt = prompt_manager.load_prompt("ideation_system.md")
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


# ==========================================
# 1.2 SAVE IDEA
# ==========================================
@app.post("/api/projects")
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


# ==========================================
# 2. GENERATE STORY BIBLE
# ==========================================
@app.post("/api/projects/{project_id}/generate-bible")
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
                "heat_level",
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
        system_prompt = prompt_manager.load_prompt("story_bible_system.md")
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


@app.put("/api/projects/{project_id}/update-bible")
async def update_story_bible(project_id: str, request: UpdateBibleRequest):
    try:
        supabase.table("projects").update({"story_bible": request.story_bible}).eq("id", project_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/projects/{project_id}/generate-character")
async def generate_character(project_id: str, request: GenerateCharacterRequest):
    try:
        project_res = supabase.table("projects").select("heat_level").eq("id", project_id).single().execute()
        heat_level = project_res.data.get("heat_level", 1)
        system_prompt = prompt_manager.load_prompt("add_character_system.md")
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


@app.post("/api/projects/{project_id}/regenerate-pov-recommendation")
async def regenerate_pov_recommendation(
    project_id: str, request: GeneratePovRecommendationRequest
):
    suggested_type = request.suggested_type.strip()
    if not suggested_type:
        raise HTTPException(status_code=400, detail="Vui lòng nhập loại ngôi kể.")

    try:
        system_prompt = prompt_manager.load_prompt("regenerate_pov_system.md")
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


@app.post("/api/projects/{project_id}/generate-relationship")
async def generate_relationship(project_id: str, request: GenerateRelationshipRequest):
    current_bible = request.current_bible
    selected_characters = []

    project_res = supabase.table("projects").select("heat_level").eq("id", project_id).single().execute()
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
        system_prompt = prompt_manager.load_prompt("add_relationship_system.md")
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


# ==========================================
# 3. GENERATE PACING (CHIA OUTLINE PACING - CHAPTER)
# ==========================================
@app.post("/api/projects/{project_id}/generate-pacing")
async def generate_pacing(project_id: str):
    """
    Đọc Bible từ DB -> LLM tạo Pacing -> Update Project -> Tự động sinh danh sách Chapters vào DB.
    """
    try:
        # 1. Fetch data từ Supabase
        db_res = (
            supabase.table("projects")
            .select("id, title, vibe, logline, story_bible")
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
        system_prompt = prompt_manager.load_prompt("pacing_system.md")
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


@app.post("/api/projects/{project_id}/evaluate-pacing")
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
        
        system_prompt = prompt_manager.load_prompt("evaluate_pacing_system.md")
        user_prompt = prompt_manager.load_prompt(
            "evaluate_pacing_user.md",
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
            chapters=json.dumps(chap_res.data, ensure_ascii=False)
        )
        
        result_json = await generate_json(system_prompt, user_prompt)
        return {"success": True, "data": result_json}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/projects/{project_id}/evaluate-beats")
async def evaluate_beats(project_id: str, request: BeatEvaluationRequest):
    try:
        project_result = (
            supabase.table("projects")
            .select("id, story_bible, story_outline")
            .eq("id", project_id)
            .execute()
        )
        if not project_result.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án.")

        chapter_query = (
            supabase.table("chapters")
            .select(
                "id, chapter_number, title, primary_function, main_event, emotional_beat, relationship_beat, chapter_hook, continuity_note"
            )
            .eq("project_id", project_id)
        )
        if request.scope == "chapter":
            if not request.chapter_id:
                raise HTTPException(status_code=400, detail="Cần chapter_id để đánh giá trong phạm vi chapter.")
            chapter_query = chapter_query.eq("id", request.chapter_id)
        chapters = chapter_query.order("chapter_number").execute().data or []
        if not chapters:
            raise HTTPException(status_code=400, detail="Không có chapter để đánh giá.")
        if request.scope == "chapter" and chapters[0]["id"] != request.chapter_id:
            raise HTTPException(status_code=404, detail="Chapter không thuộc dự án này.")

        evaluated_chapters = []
        for chapter in chapters:
            beat_result = (
                supabase.table("beats")
                .select("beat_id, beat_order, location, characters_present, action_and_dialogue, emotional_shift")
                .eq("chapter_id", chapter["id"])
                .order("beat_order")
                .execute()
            )
            evaluated_chapters.append({
                **{key: value for key, value in chapter.items() if key != "id"},
                "beats": beat_result.data or [],
            })
        if not any(chapter["beats"] for chapter in evaluated_chapters):
            raise HTTPException(status_code=400, detail="Chưa có beat để đánh giá.")

        project = project_result.data[0]
        optimized_bible = get_optimized_bible(project.get("story_bible"), task="pacing")
        system_prompt = prompt_manager.load_prompt("evaluate_beats_system.md")
        user_prompt = prompt_manager.load_prompt(
            "evaluate_beats_user.md",
            scope="toàn story" if request.scope == "story" else "chapter",
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
            story_outline=(project.get("story_outline") or {}).get("content", ""),
            chapters=json.dumps(evaluated_chapters, ensure_ascii=False),
        )
        result_json = await generate_json(system_prompt, user_prompt)
        return {"success": True, "data": result_json}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/projects/{project_id}/analyze-chapter-idea")
async def analyze_chapter_idea(project_id: str, request: AnalyzeChapterIdeaRequest):
    """Bước 1: Trả về lời phản biện (Critique) cho ý tưởng của User."""
    try:
        proj_res = supabase.table("projects").select("story_bible, heat_level").eq("id", project_id).execute()
        optimized_bible = get_optimized_bible(proj_res.data[0].get("story_bible"), task="single_chapter")
        heat_level = proj_res.data[0].get("heat_level", 1)

        system_prompt = prompt_manager.load_prompt("analyze_chapter_idea_system.md")
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


@app.post("/api/projects/{project_id}/generate-dynamic-chapters")
async def generate_dynamic_chapters(project_id: str, request: GenerateSingleChapterRequest):
    """Bước 2: Nhận Prompt (Gốc hoặc Đã sửa) và sinh ra 1 đến N chương."""
    try:
        proj_res = supabase.table("projects").select("story_bible").eq("id", project_id).execute()
        optimized_bible = get_optimized_bible(proj_res.data[0].get("story_bible"), task="single_chapter")

        system_prompt = prompt_manager.load_prompt("single_chapter_system.md")
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


# ==========================================
# 4. GENERATE BEATS (CHIA NHỊP TRUYỆN CỦA 1 CHƯƠNG)
# ==========================================
@app.post("/api/chapters/{chapter_id}/generate-beats")
async def generate_beats(chapter_id: str):
    try:
        # Lấy thông tin chapter (bao gồm 4 trường mới) và project liên quan
        chap_res = supabase.table("chapters").select(
            "id, project_id, chapter_number, title, timeline_period, pov_character, primary_function, main_event, emotional_beat, relationship_beat, chapter_hook, continuity_note, projects(story_bible, current_memory, heat_level)"
        ).eq("id", chapter_id).execute()
        
        if not chap_res.data: 
            raise HTTPException(status_code=404, detail="Chapter not found")
            
        chapter = chap_res.data[0]
        project = chapter["projects"]

        # Lấy thông tin chapter trước
        previous_chapter_ending = "Đây là chương đầu tiên, chưa có đoạn kết chương trước."
        previous_chapter_res = (
            supabase.table("chapters")
            .select("final_content")
            .eq("project_id", chapter["project_id"])
            .lt("chapter_number", chapter["chapter_number"])
            .order("chapter_number", desc=True)
            .limit(1)
            .execute()
        )
        if previous_chapter_res.data:
            previous_chapter_ending = (
                previous_chapter_res.data[0].get("final_content")[-1500:]
                or "Chương trước chưa có đoạn kết hoàn chỉnh."
            )
        
        # Đóng gói thông tin Chapter để mớm cho AI
        chapter_info = {
            "title": chapter["title"],
            "timeline_period": chapter.get("timeline_period"),
            "pov_character": chapter.get("pov_character"),
            "primary_function": chapter.get("primary_function"),
            "main_event": chapter.get("main_event"),
            "emotional_beat": chapter.get("emotional_beat"),
            "relationship_beat": chapter.get("relationship_beat"),
            "chapter_hook": chapter.get("chapter_hook"),
            "continuity_note": chapter.get("continuity_note")
        }
        
        # Lọc Story Bible (Tác vụ: beat_breakdown)
        optimized_bible = get_optimized_bible(project.get("story_bible"), task="beat_breakdown")
        
        # Load Prompts
        system_prompt = prompt_manager.load_prompt("beat_system.md")
        user_prompt = prompt_manager.load_prompt(
            "beat_user.md",
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
            chapter_info=json.dumps(chapter_info, ensure_ascii=False),
            current_memory=json.dumps(project.get("current_memory", {}), ensure_ascii=False) if project.get("current_memory") else "Đây là chương đầu tiên.",
            previous_chapter_ending=previous_chapter_ending,
            heat_level=project.get("heat_level", 1),
            story_outline="",
            previous_beats_context=""
        )
        
        # Gọi LLM sinh JSON Beats
        beats_json = await generate_json(system_prompt, user_prompt)
        
        # Xóa beats cũ nếu có (trường hợp user ấn generate lại)
        supabase.table("beats").delete().eq("chapter_id", chapter_id).execute()
        
        # Bắt lỗi an toàn nếu AI không sinh được beats
        if "beats" not in beats_json or not isinstance(beats_json["beats"], list):
            raise Exception("AI không trả về định dạng mảng beats hợp lệ.")
            
        # Insert vào DB
        beats_to_insert = []
        for index, beat in enumerate(beats_json.get("beats", [])):
            beat_order = index + 1
            clean_beat_id = f"C{chapter['chapter_number']}_B{beat_order}"
            
            beats_to_insert.append({
                "chapter_id": chapter_id,
                "beat_id": clean_beat_id,
                "beat_order": beat_order,
                "location": beat.get("location_and_atmosphere", "Chưa xác định"),
                "characters_present": ", ".join(beat.get("characters_present", [])),
                "action_and_dialogue": f"Action: {beat.get('main_action')}. Props: {beat.get('sensory_focus')}\nDialogue: {beat.get('dialogue')}. Subtext: {beat.get('subtext')}",
                "emotional_shift": beat.get("emotional_shift")
            })
            
        if beats_to_insert:
            supabase.table("beats").insert(beats_to_insert).execute()
        
        # Cập nhật status chapter
        supabase.table("chapters").update({"status": "Beats Generated"}).eq("id", chapter_id).execute()
        
        return {"success": True, "message": f"Tạo thành công {len(beats_to_insert)} beats."}
    except Exception as e:
        print(f"[Error Generate Beats] {e}")
        raise HTTPException(status_code=500, detail=str(e))


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


@app.post("/api/projects/{project_id}/generate-story-outline")
async def generate_story_outline(project_id: str):
    try:
        project_result = (
            supabase.table("projects")
            .select("id, title, vibe, logline, story_bible, story_outline, beat_generation")
            .eq("id", project_id)
            .execute()
        )
        if not project_result.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án.")
        project = project_result.data[0]
        chapters = await _load_project_chapters(project_id)
        if not chapters:
            raise HTTPException(status_code=400, detail="Hãy tạo và lưu danh sách chapter trước.")
        if not project.get("story_bible"):
            raise HTTPException(status_code=400, detail="Dự án chưa có Story Bible.")
        if (project.get("beat_generation") or {}).get("status") == "running":
            raise HTTPException(status_code=409, detail="Không thể thay đổi dàn ý trong khi đang sinh beats.")

        optimized_bible = get_optimized_bible(project["story_bible"], task="pacing")
        system_prompt = prompt_manager.load_prompt("story_outline_system.md")
        user_prompt = prompt_manager.load_prompt(
            "story_outline_user.md",
            story_seed=json.dumps(
                {key: project.get(key) for key in ("title", "vibe", "logline")},
                ensure_ascii=False,
            ),
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
            chapters=json.dumps(chapters, ensure_ascii=False),
        )
        result = await generate_json(system_prompt, user_prompt)
        outline_text = result.get("story_outline")
        if not isinstance(outline_text, str) or not outline_text.strip():
            raise ValueError("AI không trả về nội dung 'story_outline' hợp lệ.")

        outline = {
            "content": outline_text.strip(),
            "confirmed": False,
            "chapter_signature": _chapter_signature(chapters),
            "story_bible_signature": _story_bible_signature(project["story_bible"]),
        }
        supabase.table("projects").update({"story_outline": outline}).eq("id", project_id).execute()
        previous_generation = project.get("beat_generation") or {}
        has_existing_beats = await _project_has_beats(project_id)
        if has_existing_beats and (
            (project.get("story_outline") or {}).get("confirmed")
            or previous_generation.get("status") in {"completed", "stale"}
        ):
            supabase.table("projects").update(
                {"beat_generation": {"status": "stale", "completed": 0, "total": len(chapters)}}
            ).eq("id", project_id).execute()
        return {"success": True, "data": outline}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/projects/{project_id}/story-outline")
async def update_story_outline(project_id: str, request: StoryOutlineUpdateRequest):
    try:
        project_result = (
            supabase.table("projects")
            .select("story_bible, beat_generation")
            .eq("id", project_id)
            .execute()
        )
        if not project_result.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án.")
        project = project_result.data[0]
        if (project.get("beat_generation") or {}).get("status") == "running":
            raise HTTPException(status_code=409, detail="Không thể thay đổi dàn ý trong khi đang sinh beats.")
        chapters = await _load_project_chapters(project_id)
        if not chapters:
            raise HTTPException(status_code=400, detail="Hãy tạo và lưu danh sách chapter trước.")

        current_signature = _chapter_signature(chapters)
        if request.chapter_signature != current_signature:
            raise HTTPException(
                status_code=409,
                detail="Danh sách chapter đã thay đổi. Hãy tải lại và tạo hoặc chốt lại dàn ý.",
            )
        if request.story_bible_signature != _story_bible_signature(project.get("story_bible")):
            raise HTTPException(
                status_code=409,
                detail="Story Bible đã thay đổi. Hãy tạo lại dàn ý trước khi chốt.",
            )
        if not request.story_outline.strip():
            raise HTTPException(status_code=400, detail="Dàn ý story không được để trống.")

        outline = {
            "content": request.story_outline.strip(),
            "confirmed": request.confirmed,
            "chapter_signature": current_signature,
            "story_bible_signature": request.story_bible_signature,
        }
        previous_outline_result = (
            supabase.table("projects")
            .select("story_outline")
            .eq("id", project_id)
            .execute()
        )
        previous_outline = (previous_outline_result.data or [{}])[0].get("story_outline") or {}
        if previous_outline.get("content") != outline["content"] and await _project_has_beats(project_id):
            supabase.table("projects").update(
                {"beat_generation": {"status": "stale", "completed": 0, "total": len(chapters)}}
            ).eq("id", project_id).execute()
        supabase.table("projects").update({"story_outline": outline}).eq("id", project_id).execute()
        return {"success": True, "data": outline}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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


async def _generate_project_beats(project_id: str):
    try:
        project_result = (
            supabase.table("projects")
            .select("id, story_bible, story_outline, current_memory, heat_level")
            .eq("id", project_id)
            .execute()
        )
        if not project_result.data:
            raise ValueError("Không tìm thấy dự án.")
        project = project_result.data[0]
        chapters = await _load_project_chapters(project_id)
        outline = project.get("story_outline") or {}
        if (
            not outline.get("confirmed")
            or outline.get("chapter_signature") != _chapter_signature(chapters)
            or outline.get("story_bible_signature") != _story_bible_signature(project.get("story_bible"))
        ):
            raise ValueError("Dàn ý chưa được chốt hoặc không còn khớp với danh sách chapter.")

        completed = 0
        prior_chapters: list[tuple[dict, list[dict]]] = []
        for chapter in chapters:
            existing_result = (
                supabase.table("beats")
                .select("*")
                .eq("chapter_id", chapter["id"])
                .order("beat_order")
                .execute()
            )
            existing_beats = existing_result.data or []
            if existing_beats:
                prior_chapters.append((chapter, existing_beats))
                completed += 1
                supabase.table("projects").update(
                    {
                        "beat_generation": {
                            "status": "running",
                            "completed": completed,
                            "total": len(chapters),
                            "current_chapter": chapter["chapter_number"],
                        }
                    }
                ).eq("id", project_id).execute()
                continue

            context = _format_previous_beats(prior_chapters)
            if prior_chapters:
                previous_chapter, previous_beats = prior_chapters[-1]
                previous_chapter_ending = json.dumps(
                    {
                        "chapter": previous_chapter.get("title"),
                        "last_beat": previous_beats[-1] if previous_beats else {},
                    },
                    ensure_ascii=False,
                )[-1500:]
            else:
                previous_chapter_ending = "Đây là chương đầu tiên, chưa có beats trước đó."
            chapter_info = {
                "title": chapter["title"],
                "timeline_period": chapter.get("timeline_period"),
                "pov_character": chapter.get("pov_character"),
                "primary_function": chapter.get("primary_function"),
                "main_event": chapter.get("main_event"),
                "emotional_beat": chapter.get("emotional_beat"),
                "relationship_beat": chapter.get("relationship_beat"),
                "chapter_hook": chapter.get("chapter_hook"),
                "continuity_note": chapter.get("continuity_note"),
            }
            optimized_bible = get_optimized_bible(project.get("story_bible"), task="beat_breakdown")
            user_prompt = prompt_manager.load_prompt(
                "beat_user.md",
                story_bible=json.dumps(optimized_bible, ensure_ascii=False),
                chapter_info=json.dumps(chapter_info, ensure_ascii=False),
                current_memory=json.dumps(project.get("current_memory") or {}, ensure_ascii=False),
                previous_chapter_ending=previous_chapter_ending,
                heat_level=project.get("heat_level", 1),
                story_outline=outline["content"],
                previous_beats_context=context or "Chưa có beats của chapter trước.",
            )
            beats_json = await generate_json(
                prompt_manager.load_prompt("beat_system.md"),
                user_prompt,
            )
            generated_beats = beats_json.get("beats")
            if not isinstance(generated_beats, list) or not generated_beats:
                raise ValueError(f"AI không tạo được beats hợp lệ cho chương {chapter['chapter_number']}.")

            rows = []
            for index, beat in enumerate(generated_beats, start=1):
                characters = beat.get("characters_present", [])
                rows.append(
                    {
                        "chapter_id": chapter["id"],
                        "beat_id": f"C{chapter['chapter_number']}_B{index}",
                        "beat_order": index,
                        "location": beat.get("location_and_atmosphere", "Chưa xác định"),
                        "characters_present": ", ".join(characters) if isinstance(characters, list) else str(characters),
                        "action_and_dialogue": (
                            f"Action: {beat.get('main_action')}. Props: {beat.get('sensory_focus')}\n"
                            f"Dialogue: {beat.get('dialogue')}. Subtext: {beat.get('subtext')}"
                        ),
                        "emotional_shift": beat.get("emotional_shift", ""),
                    }
                )
            supabase.table("beats").insert(rows).execute()
            supabase.table("chapters").update({"status": "Beats Generated"}).eq("id", chapter["id"]).execute()
            prior_chapters.append((chapter, rows))
            completed += 1
            supabase.table("projects").update(
                {
                    "beat_generation": {
                        "status": "running",
                        "completed": completed,
                        "total": len(chapters),
                        "current_chapter": chapter["chapter_number"],
                    }
                }
            ).eq("id", project_id).execute()

        supabase.table("projects").update(
            {
                "beat_generation": {
                    "status": "completed",
                    "completed": len(chapters),
                    "total": len(chapters),
                    "current_chapter": None,
                }
            }
        ).eq("id", project_id).execute()
    except Exception as e:
        print(f"[Error Generate Project Beats] {e}")
        supabase.table("projects").update(
            {
                "beat_generation": {
                    "status": "failed",
                    "completed": locals().get("completed", 0),
                    "total": len(locals().get("chapters", [])),
                    "error": str(e),
                }
            }
        ).eq("id", project_id).execute()


@app.post("/api/projects/{project_id}/generate-all-beats")
async def generate_all_project_beats(
    project_id: str,
    request: GenerateAllBeatsRequest,
    background_tasks: BackgroundTasks,
):
    try:
        project_result = (
            supabase.table("projects")
            .select("id, story_bible, story_outline, beat_generation")
            .eq("id", project_id)
            .execute()
        )
        if not project_result.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án.")
        project = project_result.data[0]
        chapters = await _load_project_chapters(project_id)
        outline = project.get("story_outline") or {}
        if not chapters:
            raise HTTPException(status_code=400, detail="Chưa có chapter nào.")
        if (
            not outline.get("confirmed")
            or outline.get("chapter_signature") != _chapter_signature(chapters)
            or outline.get("story_bible_signature") != _story_bible_signature(project.get("story_bible"))
        ):
            raise HTTPException(
                status_code=409,
                detail="Hãy tạo và chốt lại dàn ý theo Story Bible và danh sách chapter hiện tại.",
            )
        if (project.get("beat_generation") or {}).get("status") == "running":
            raise HTTPException(status_code=409, detail="Đang có một tiến trình sinh beats chạy.")
        if (project.get("beat_generation") or {}).get("status") == "stale":
            if not request.reset_existing:
                raise HTTPException(
                    status_code=409,
                    detail="Dàn ý hoặc chapter đã thay đổi. Xác nhận xóa beats cũ trước khi sinh lại.",
                )
            for chapter in chapters:
                supabase.table("beats").delete().eq("chapter_id", chapter["id"]).execute()
                supabase.table("chapters").update(
                    {"final_content": None, "status": "Drafting Pending"}
                ).eq("id", chapter["id"]).execute()

        initial_status = {
            "status": "running",
            "completed": 0,
            "total": len(chapters),
            "current_chapter": chapters[0]["chapter_number"],
        }
        supabase.table("projects").update({"beat_generation": initial_status}).eq("id", project_id).execute()
        background_tasks.add_task(_generate_project_beats, project_id)
        return {"success": True, "data": initial_status}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/projects/{project_id}/beat-generation")
async def get_project_beat_generation(project_id: str):
    try:
        result = (
            supabase.table("projects")
            .select("beat_generation")
            .eq("id", project_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án.")
        return {"success": True, "data": result.data[0].get("beat_generation")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/projects/{project_id}/bulk-update-chapters")
async def bulk_update_chapters(project_id: str, request: BulkUpdateChaptersRequest):
    try:
        project_result = (
            supabase.table("projects")
            .select("beat_generation")
            .eq("id", project_id)
            .execute()
        )
        if not project_result.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án.")
        if (project_result.data[0].get("beat_generation") or {}).get("status") == "running":
            raise HTTPException(status_code=409, detail="Không thể sửa chapter trong khi đang sinh beats.")
        current_chaps_res = (
            supabase.table("chapters")
            .select(
                "id, chapter_number, title, timeline_period, pov_character, main_event, "
                "primary_function, emotional_beat, relationship_beat, chapter_hook, continuity_note"
            )
            .eq("project_id", project_id)
            .order("chapter_number")
            .execute()
        )
        current_chapters = current_chaps_res.data or []
        current_ids = [str(c["id"]) for c in current_chapters]
        incoming_chapters = [
            {
                "id": str(chapter.id) if chapter.id else "",
                "chapter_number": chapter.chapter_number,
                "title": chapter.title,
                "timeline_period": chapter.timeline_period,
                "pov_character": chapter.pov_character,
                "main_event": chapter.main_event,
                "primary_function": chapter.primary_function,
                "emotional_beat": chapter.emotional_beat or "",
                "relationship_beat": chapter.relationship_beat or "",
                "chapter_hook": chapter.chapter_hook or "",
                "continuity_note": chapter.continuity_note or "",
            }
            for chapter in request.chapters
        ]
        chapters_changed = _chapter_signature(current_chapters) != _chapter_signature(incoming_chapters)
        
        incoming_ids = [str(c.id) for c in request.chapters if c.id]
        
        # ==========================================
        # 1. BƯỚC XÓA (Chỉ gọi DB nếu thực sự có chương bị xóa)
        # ==========================================
        ids_to_delete = list(set(current_ids) - set(incoming_ids))
        
        if ids_to_delete:
            for chap_id in ids_to_delete:
                supabase.table("beats").delete().eq("chapter_id", chap_id).execute()
                supabase.table("chapters").delete().eq("id", chap_id).execute()
                
        # 2. BƯỚC TÁCH MẢNG UPDATE VÀ INSERT
        # ==========================================
        chapters_to_update = []
        chapters_to_insert = []
        
        for chap in request.chapters:
            chap_data = {
                "project_id": project_id,
                "chapter_number": chap.chapter_number,
                "title": chap.title,
                "timeline_period": chap.timeline_period,
                "pov_character": chap.pov_character,
                "main_event": chap.main_event,
                "primary_function": chap.primary_function,
                "emotional_beat": chap.emotional_beat,
                "relationship_beat": chap.relationship_beat,
                "chapter_hook": chap.chapter_hook,
                "continuity_note": chap.continuity_note
            }
            
            # Nếu là chương cũ (có ID thật trên DB) -> Đưa vào mảng Update
            if chap.id and (str(chap.id) in current_ids):
                chap_data["id"] = str(chap.id)
                chapters_to_update.append(chap_data)
            else:
                # Nếu là chương mới -> Đưa vào mảng Insert (tuyệt đối không truyền key 'id')
                chap_data["status"] = "Drafting Pending"
                chapters_to_insert.append(chap_data)

        # Thực thi theo lô (Batching)
        if chapters_to_update:
            supabase.table("chapters").upsert(chapters_to_update).execute()
            
        if chapters_to_insert:
            supabase.table("chapters").insert(chapters_to_insert).execute()

        if chapters_changed and await _project_has_beats(project_id):
            supabase.table("projects").update(
                {
                    "beat_generation": {
                        "status": "stale",
                        "completed": 0,
                        "total": len(request.chapters),
                    }
                }
            ).eq("id", project_id).execute()

        return {"success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Error Bulk Update] LỖI: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    

@app.post("/api/chapters/{chapter_id}/batch-draft")
async def batch_draft_chapter(chapter_id: str, background_tasks: BackgroundTasks):
    try:
        # 1. Lấy tất cả các beats của chương, sắp xếp đúng thứ tự
        chapter_res = supabase.table("chapters").select("pov_character, projects(id, story_bible, heat_level)").eq("id", chapter_id).execute()
        beats_res = supabase.table("beats").select("*").eq("chapter_id", chapter_id).order("beat_order").execute()
        beats = beats_res.data
        project = chapter_res.data[0]["projects"]
        project_id = project["id"]
        
        if not beats:
            raise HTTPException(status_code=400, detail="Chương này chưa có nhịp truyện (Beats) nào.")

        supabase.table("chapters").update({
            "status": "Drafting",
            "final_content": None,
        }).eq("id", chapter_id).execute()

        # 2. CHẠY TUẦN TỰ QUA TỪNG BEAT
        previous_text = ""
        for beat in beats:
            # Lấy Memory mới nhất trực tiếp từ DB cho TỪNG vòng lặp (vì Memory có thể thay đổi sau mỗi Beat)
            curr_proj = supabase.table("projects").select("current_memory").eq("id", project_id).execute()
            current_memory_data = curr_proj.data[0].get("current_memory", {})

            # Gọi AI Viết Văn
            chars_str = beat.get("characters_present", "")
            present_chars_list = [c.strip() for c in chars_str.split(",") if c.strip()]

            # Gọi hàm lọc
            optimized_bible = get_optimized_bible(
                project.get("story_bible", {}), 
                task="drafting", 
                present_characters=present_chars_list,
                pov_character=chapter_res.data[0].get("pov_character", "")
            )
            system_prompt = prompt_manager.load_prompt("draft_system.md")
            user_prompt = prompt_manager.load_prompt(
                "draft_user.md",
                story_bible=json.dumps(optimized_bible, ensure_ascii=False),
                heat_level=project.get("heat_level", 1),
                current_memory=json.dumps(current_memory_data, ensure_ascii=False),
                previous_beat_text=previous_text[-1500:],
                beat_data=json.dumps(beat, ensure_ascii=False),
                pov_instruction=get_pov_instruction(project.get("story_bible", {}), chapter_res.data[0].get("pov_character", ""))
            )
            
            draft_text = _sanitize_story_text(
                await generate_text_xml(system_prompt, user_prompt, target_tag="story_text")
            )
            
            # Lưu bản nháp vào DB
            supabase.table("beats").update({"ai_draft_text": draft_text}).eq("id", beat["id"]).execute()
            
            # Lấy 1500 ký tự cuối để làm mồi cho Beat tiếp theo
            previous_text = draft_text

            # CẬP NHẬT TRÍ NHỚ ĐỒNG BỘ (Bắt buộc phải await ở đây thay vì background task
            # để đảm bảo Beat sau CÓ trí nhớ của Beat trước)
            print(f"[Batch Draft] Đang cập nhật bộ nhớ sau Beat {beat['beat_id']}...")
            try:
                mem_sys = prompt_manager.load_prompt("memory_system.md")
                mem_usr = prompt_manager.load_prompt(
                    "memory_user.md",
                    current_memory=json.dumps(current_memory_data, ensure_ascii=False) if current_memory_data else "Chưa có",
                    new_draft_text=draft_text
                )
                memory_result = await generate_json(mem_sys, mem_usr)
                supabase.table("projects").update({"current_memory": memory_result}).eq("id", project_id).execute()
            except Exception as mem_err:
                print(f"[Cảnh báo Memory] Lỗi cập nhật trí nhớ, vẫn tiếp tục draft: {mem_err}")

        # A new draft invalidates any previously refined chapter text.
        supabase.table("chapters").update({
            "status": "Draft Completed",
            "final_content": None,
        }).eq("id", chapter_id).execute()

        return {"success": True, "message": "Đã tự động viết xong toàn bộ các cảnh trong chương."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# 5. DRAFT A BEAT (VIẾT NHÁP CHO 1 BEAT CỤ THỂ)
# ==========================================
@app.post("/api/beats/{beat_id}/draft")
async def draft_single_beat(beat_id: str, background_tasks: BackgroundTasks, previous_text: str = ""):
    try:
        # 1. Lấy Data
        beat_res = supabase.table("beats").select("*, chapters(id, pov_character, projects(current_memory, story_bible, heat_level))").eq("id", beat_id).execute()
        beat = beat_res.data[0]
        chapter = beat["chapter"]
        project = chapter["projects"]
        project_id = project["id"]
        heat_level = project.get("heat_level", 1)
        
        current_memory_data = project.get("current_memory", {})
        
        # 2. Gọi AI Viết Văn
        chars_str = beat.get("characters_present", "")
        present_chars_list = [c.strip() for c in chars_str.split(",") if c.strip()]

        # Gọi hàm lọc
        optimized_bible = get_optimized_bible(
            project.get("story_bible", {}), 
            task="drafting", 
            present_characters=present_chars_list,
            pov_character=chapter.get("pov_character", "")
        )
        system_prompt = prompt_manager.load_prompt("draft_system.md")
        user_prompt = prompt_manager.load_prompt(
            "draft_user.md",
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
            heat_level=heat_level,
            current_memory=json.dumps(current_memory_data, ensure_ascii=False),
            previous_beat_text=previous_text[-1500:],
            beat_data=json.dumps(beat, ensure_ascii=False),
            pov_instruction=get_pov_instruction(project.get("story_bible", {}), chapter.get("pov_character", ""))
        )
        
        draft_text = _sanitize_story_text(
            await generate_text_xml(system_prompt, user_prompt, target_tag="story_text")
        )
        
        # 3. Lưu bản nháp vào DB
        supabase.table("beats").update({"ai_draft_text": draft_text}).eq("id", beat_id).execute()
        supabase.table("chapters").update({
            "status": "Draft Completed",
            "final_content": None,
        }).eq("id", chapter["id"]).execute()
        
        # 4. KÍCH HOẠT BACKGROUND TASK ĐỂ CẬP NHẬT TRÍ NHỚ
        # Giao diện Frontend sẽ nhận được draft_text ngay lập tức mà không phải chờ bước này!
        background_tasks.add_task(
            background_update_memory, 
            project_id=project_id, 
            old_memory=current_memory_data, 
            new_text=draft_text
        )
        
        return {"success": True, "text": draft_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/beats/bulk-update")
async def bulk_update_beats(request: BulkBeatUpdateRequest):
    try:
        # Update từng beat (Hoặc dùng thư viện batch của Supabase nếu có)
        for beat in request.beats:
            draft_text = beat["draft_text"]
            supabase.table("beats").update({
                "ai_draft_text": (
                    _sanitize_story_text(draft_text) if draft_text is not None else None
                ),
            }).eq("id", beat["id"]).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/beats/{beat_id}/analyze-text-idea")
async def analyze_beat_text_idea(beat_id: str, request: AnalyzeBeatTextRequest):
    try:
        if not request.current_text:
            raise HTTPException(status_code=400, detail="Chưa có văn bản nháp. Hãy bấm 'AI Viết Nháp' trước khi sửa.")

        beat_res = supabase.table("beats").select("*, chapters(id, chapter_number, title, pov_character, primary_function, main_event, emotional_beat, relationship_beat, chapter_hook, continuity_note, projects(story_bible, heat_level))").eq("id", beat_id).execute()
        beat = beat_res.data[0]
        chapter = beat["chapters"]
        project = chapter["projects"]
        
        # Đóng gói danh sách character của beat
        chars_str = beat.get("characters_present", "")
        present_chars_list = [c.strip() for c in chars_str.split(",") if c.strip()]

        # Đóng gói thông tin Chapter để mớm cho AI
        chapter_info = {
            "title": chapter["title"],
            "primary_function": chapter.get("primary_function"),
            "main_event": chapter.get("main_event"),
            "emotional_beat": chapter.get("emotional_beat"),
            "relationship_beat": chapter.get("relationship_beat"),
            "chapter_hook": chapter.get("chapter_hook"),
            "continuity_note": chapter.get("continuity_note")
        }
        
        # Gọi hàm lọc
        optimized_bible = get_optimized_bible(
            project.get("story_bible", {}), 
            task="drafting", 
            present_characters=present_chars_list
        )
            
        system_prompt = prompt_manager.load_prompt("analyze_beat_text_system.md")
        user_prompt = prompt_manager.load_prompt(
            "analyze_beat_text_user.md",
            current_text=request.current_text,
            heat_level=project.get("heat_level", 1),
            user_prompt=request.user_prompt,
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
            chapter_info=json.dumps(chapter_info, ensure_ascii=False),
            beat_data=json.dumps(beat, ensure_ascii=False)
        )
        result = await generate_json(system_prompt, user_prompt)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/beats/{beat_id}/edit-text")
async def edit_beat_text(beat_id: str, request: EditBeatTextRequest):
    try:
        beat_res = supabase.table("beats").select("id, chapters(id, chapter_number, title, pov_character, primary_function, main_event, emotional_beat, relationship_beat, chapter_hook, continuity_note, projects(story_bible, heat_level))").eq("id", beat_id).execute()
        beat = beat_res.data[0]
        chapter = beat["chapters"]
        project = chapter["projects"]
        
        # Đóng gói danh sách character của beat
        chars_str = beat.get("characters_present", "")
        present_chars_list = [c.strip() for c in chars_str.split(",") if c.strip()]

        # Đóng gói thông tin Chapter để mớm cho AI
        chapter_info = {
            "title": chapter["title"],
            "primary_function": chapter.get("primary_function"),
            "main_event": chapter.get("main_event"),
            "emotional_beat": chapter.get("emotional_beat"),
            "relationship_beat": chapter.get("relationship_beat"),
            "chapter_hook": chapter.get("chapter_hook"),
            "continuity_note": chapter.get("continuity_note")
        }
        
        # Gọi hàm lọc
        optimized_bible = get_optimized_bible(
            project.get("story_bible", {}), 
            task="drafting", 
            present_characters=present_chars_list
        )
        
        system_prompt = prompt_manager.load_prompt("edit_beat_text_system.md")
        user_prompt = prompt_manager.load_prompt(
            "edit_beat_text_user.md",
            current_text=request.current_text,
            user_prompt=request.user_prompt,
            heat_level=project.get("heat_level", 1),
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
            chapter_info=json.dumps(chapter_info, ensure_ascii=False),
            pov_instruction=get_pov_instruction(project.get("story_bible", {}), chapter.get("pov_character", ""))
        )
        
        # Gọi hàm trả về Text (XML tag) giống hệt lúc Draft
        new_text = _sanitize_story_text(
            await generate_text_xml(system_prompt, user_prompt, target_tag="story_text")
        )
        
        # Cập nhật trực tiếp văn bản vào DB
        supabase.table("beats").update({"ai_draft_text": new_text}).eq("id", beat_id).execute()
        
        return {"success": True, "text": new_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# 6. REFINE CHAPTER (BIÊN TẬP TOÀN BỘ CHƯƠNG)
# ==========================================
@app.post("/api/chapters/{chapter_id}/refine")
async def refine_chapter(chapter_id: str):
    try:
        # Lấy tất cả các beats của chương này
        beats_res = supabase.table("beats").select("ai_draft_text, characters_present").eq("chapter_id", chapter_id).order("beat_order").execute()
        project_res = supabase.table("chapters").select("chapter_number, project_id, projects(story_bible, heat_level)").eq("id", chapter_id).single().execute()
        
        # Nối tất cả các bản nháp lại thành 1 chương hoàn chỉnh
        full_draft_text = "\n\n".join([b["ai_draft_text"] for b in beats_res.data if b.get("ai_draft_text")])

        # Lấy ra đối tượng story_bile thô
        story_bible = project_res.data.get("story_bible", {})
        
        if not full_draft_text:
            raise HTTPException(status_code=400, detail="Chưa có bản nháp nào được viết trong chương này.")

        # Nối tất cả danh sách nhân vật có trong tất cả các beat
        present_chars_list = list(dict.fromkeys(
            character.strip()
            for beat in beats_res.data
            for character in (beat.get("characters_present") or "").split(",")
            if character.strip()
        ))
        # In ra danh sách nhân vật
        print(f"Danh sách nhân vật của chapter {project_res.data.get('chapter_number')} là {present_chars_list}")
        
        # Gọi hàm lọc
        optimized_bible = get_optimized_bible(
            story_bible, 
            task="drafting", 
            present_characters=present_chars_list
        )

        system_prompt = prompt_manager.load_prompt("refine_system.md")
        user_prompt = prompt_manager.load_prompt(
            "refine_user.md",
            heat_level=project_res.data.get("heat_level", 1),
            chapter_draft_text=full_draft_text,
            story_bible=optimized_bible
        )
        
        final_text = await generate_text_xml(system_prompt, user_prompt, target_tag="final_polished_chapter")
        
        # Lưu nội dung chốt vào bảng chapters
        supabase.table("chapters").update({
            "final_content": final_text,
            "status": "Refined & Ready for Audio"
        }).eq("id", chapter_id).execute()
        
        return {"success": True, "final_content": final_text,"message": "Biên tập thành công!"}
    except Exception as e:
        print(f"{e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/projects")
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


@app.get("/api/projects/{project_id}")
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


@app.get("/api/projects/{project_id}/chapters")
async def get_chapters(project_id: str):
    try:
        columns = "id, chapter_number, title, pov_character, status, final_content, timeline_period, main_event, primary_function, emotional_beat, relationship_beat, chapter_hook, continuity_note"
        res = supabase.table("chapters").select(columns).eq("project_id", project_id).order("chapter_number").execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chapters/{chapter_id}/beats")
async def get_beats(chapter_id: str):
    try:
        # Lấy danh sách beats của 1 chương, sắp xếp theo thời gian tạo
        res = supabase.table("beats").select("*").eq("chapter_id", chapter_id).order("beat_order").execute()
        return {"success": True, "data": _sanitize_beat_drafts(res.data or [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/projects/{project_id}/beats")
async def get_project_beats(project_id: str):
    try:
        chapters_res = (
            supabase.table("chapters")
            .select("id")
            .eq("project_id", project_id)
            .execute()
        )
        chapter_ids = [chapter["id"] for chapter in chapters_res.data or []]
        if not chapter_ids:
            return {"success": True, "data": []}

        beats_res = (
            supabase.table("beats")
            .select("*")
            .in_("chapter_id", chapter_ids)
            .order("beat_order")
            .execute()
        )
        return {"success": True, "data": _sanitize_beat_drafts(beats_res.data or [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chapters/{chapter_id}/beats")
async def insert_beat(chapter_id: str, request: BeatInsertRequest):
    try:
        chapter_result = (
            supabase.table("chapters")
            .select("id, chapter_number")
            .eq("id", chapter_id)
            .execute()
        )
        if not chapter_result.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy chapter.")
        chapter_number = chapter_result.data[0]["chapter_number"]
        existing = (
            supabase.table("beats")
            .select("id, beat_order")
            .eq("chapter_id", chapter_id)
            .order("beat_order")
            .execute()
        ).data or []
        insert_index = min(request.insert_index, len(existing))
        for index in range(len(existing) - 1, insert_index - 1, -1):
            beat = existing[index]
            new_order = index + 2
            supabase.table("beats").update({
                "beat_order": new_order,
                "beat_id": f"C{chapter_number}_B{new_order}",
            }).eq("id", beat["id"]).execute()

        new_order = insert_index + 1
        inserted_result = supabase.table("beats").insert({
            "chapter_id": chapter_id,
            "beat_id": f"C{chapter_number}_B{new_order}",
            "beat_order": new_order,
            "location": request.location if request.location is not None else "Chưa xác định",
            "characters_present": request.characters_present if request.characters_present is not None else "",
            "action_and_dialogue": request.action_and_dialogue if request.action_and_dialogue is not None else "Action: \nDialogue: ",
            "emotional_shift": request.emotional_shift if request.emotional_shift is not None else "",
            "ai_draft_text": _sanitize_story_text(request.draft_text) if request.draft_text is not None else "",
        }).execute().data
        if not inserted_result:
            raise HTTPException(status_code=500, detail="Không nhận được beat vừa tạo từ database.")
        supabase.table("chapters").update({
            "status": "Beats Generated",
            "final_content": None,
        }).eq("id", chapter_id).execute()
        return {
            "success": True,
            "data": _sanitize_beat_drafts(inserted_result)[0],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/beats/{beat_id}")
async def delete_beat(beat_id: str):
    try:
        beat_result = (
            supabase.table("beats")
            .select("id, chapter_id")
            .eq("id", beat_id)
            .execute()
        )
        if not beat_result.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy beat.")
        chapter_id = beat_result.data[0]["chapter_id"]
        chapter_result = (
            supabase.table("chapters")
            .select("chapter_number")
            .eq("id", chapter_id)
            .execute()
        )
        if not chapter_result.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy chapter của beat.")
        chapter_number = chapter_result.data[0]["chapter_number"]
        supabase.table("beats").delete().eq("id", beat_id).execute()
        remaining = (
            supabase.table("beats")
            .select("id")
            .eq("chapter_id", chapter_id)
            .order("beat_order")
            .execute()
        ).data or []
        for index, beat in enumerate(remaining, start=1):
            supabase.table("beats").update({
                "beat_order": index,
                "beat_id": f"C{chapter_number}_B{index}",
            }).eq("id", beat["id"]).execute()
        supabase.table("chapters").update({
            "status": "Beats Generated",
            "final_content": None,
        }).eq("id", chapter_id).execute()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/beats/{beat_id}")
async def update_beat_text(beat_id: str, request: BeatUpdateRequest):
    try:
        updates = request.model_dump(exclude_unset=True)
        if "draft_text" in updates:
            draft_text = updates.pop("draft_text")
            updates["ai_draft_text"] = (
                _sanitize_story_text(draft_text) if draft_text is not None else None
            )
        if not updates:
            raise HTTPException(status_code=400, detail="Không có dữ liệu để cập nhật.")
        beat_result = supabase.table("beats").select("chapter_id").eq("id", beat_id).execute()
        if not beat_result.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy beat.")
        supabase.table("beats").update(updates).eq("id", beat_id).execute()
        supabase.table("chapters").update({
            "status": "Beats Generated",
            "final_content": None,
        }).eq("id", beat_result.data[0]["chapter_id"]).execute()
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/chapters/{chapter_id}")
async def update_chapter_final_content(chapter_id: str, request: ChapterUpdateRequest):
    try:
        supabase.table("chapters").update({"final_content": request.final_content}).eq("id", chapter_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/chapters/{chapter_id}")
async def get_single_chapter(chapter_id: str):
    try:
        # Lấy đầy đủ vì lúc này user đang view chi tiết
        res = supabase.table("chapters").select("id, title, status, final_content").eq("id", chapter_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy.")
        return {"success": True, "data": res.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/projects/{project_id}/video-metadata")
async def get_project_video_metadata(project_id: str):
    try:
        res = supabase.table("projects").select("video_metadata").eq("id", project_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án.")
        return {"success": True, "data": res.data[0].get("video_metadata", {})}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/projects/{project_id}/status-only")
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


# Proxy TTS voice options
@app.get("/api/voices")
async def get_tts_voices():
    try:
        voices = await fetch_tts_voices()
        return {"success": True, "data": voices}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=502,
            detail=f"TTS server trả lỗi khi tải danh sách giọng (HTTP {e.response.status_code}).",
        ) from e
    except (httpx.RequestError, ValueError) as e:
        raise HTTPException(status_code=502, detail=f"Không tải được danh sách giọng TTS: {e}") from e

# Default render settings
@app.get("/api/settings/render-config")
async def get_default_render_config():
    try:
        return {"success": True, "render_config": get_global_render_config(supabase)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/settings/render-config")
async def update_default_render_config(request: UpdateGlobalRenderConfigRequest):
    try:
        config = save_global_render_config(supabase, request.render_config.model_dump())
        return {"success": True, "render_config": config}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/projects/{project_id}/batch-render")
async def start_batch_render(project_id: str, request: dict, background_tasks: BackgroundTasks):
    # Lấy danh sách ID mà user tick chọn
    target_ids = request.get("target_chapter_ids", [])
    config = request.get("config", {})
    
    # Bắn task
    background_tasks.add_task(background_batch_render, project_id=project_id, config=config, target_chapter_ids=target_ids)
    return {"success": True}


@app.put("/api/projects/{project_id}/update-render-config")
async def update_render_config(project_id: str, request: UpdateRenderConfigRequest):
    try:
        supabase.table("projects").update({"render_config": request.render_config}).eq(
            "id", project_id
        ).execute()
        return {"success": True, "message": "Cập nhật cấu hình render thành công."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/projects/{project_id}/generate-metadata")
async def generate_video_metadata(project_id: str, request: MetadataGenerateRequest):
    try:
        res = supabase.table("projects").select("id, title, vibe, logline, situational_irony, micro_conflict, story_bible, video_metadata").eq("id", project_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
        project = res.data[0]
        
        story_bible = project.get("story_bible") or {}
        story_identity = story_bible.get("story_identity") or {}
        world_building = story_bible.get("world_building") or {}
        story_context = {
            "title": project.get("title", ""),
            "vibe": project.get("vibe", ""),
            "logline": project.get("logline", ""),
            "micro_conflict": project.get("micro_conflict") or story_identity.get("core_premise", ""),
        }

        if request.target_type == "thumbnail_prompt":
            art_director_system_prompt = prompt_manager.load_prompt("art_director_system.md")
            art_director_user_prompt = prompt_manager.load_prompt(
                "art_director_user.md",
                title=story_context["title"],
                genre=story_context["vibe"],
                story_summary=story_identity.get("core_premise") or story_context["logline"],
                characters=json.dumps(story_bible.get("characters", []), ensure_ascii=False),
                setting=json.dumps(world_building, ensure_ascii=False),
                mood=story_identity.get("emotional_promise") or story_context["vibe"],
                additional_info=json.dumps({
                    "micro_conflict": story_context["micro_conflict"],
                    "situational_irony": project.get("situational_irony", ""),
                    "central_theme": story_identity.get("central_theme", ""),
                    "thematic_question": story_identity.get("thematic_question", ""),
                }, ensure_ascii=False),
            )
            art_direction = await generate_json(
                art_director_system_prompt,
                art_director_user_prompt,
            )
            visual_brief = art_direction.get("image_generation_prompt", "")
            negative_space = art_direction.get("composition", {}).get(
                "negative_space",
                "left third of the frame",
            )
            generated_list = [prompt_manager.load_prompt(
                "thumbnail_prompt.md",
                visualBrief=visual_brief,
                negativeSpace=negative_space,
            )]
        else:
            system_prompt = prompt_manager.load_prompt("metadata_system.md")
            user_prompt = prompt_manager.load_prompt(
                "metadata_user.md",
                **story_context,
                target_type=request.target_type,
                tone=request.tone,
            )
        
            result_json = await generate_json(system_prompt, user_prompt)
            generated_list = result_json.get("results", [])
        
        # Không tự động lưu vào DB nữa, trả thẳng list về cho UI để UI cho user chọn
        return {"success": True, "data": generated_list}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/projects/{project_id}/update-video-metadata")
async def update_video_metadata(project_id: str, request: UpdateVideoMetadataRequest):
    try:
        supabase.table("projects").update({"video_metadata": request.video_metadata}).eq(
            "id", project_id
        ).execute()
        return {"success": True, "message": "Cập nhật video metadata thành công."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def background_batch_render(project_id: str, config: dict, target_chapter_ids: list):
    print(f"[Batch Render] Bắt đầu xử lý cho Project: {project_id}")
    config = normalize_render_config(config)
    
    # 1. Khởi tạo trạng thái chi tiết ban đầu
    supabase.table("projects").update({
        "status": "Rendering",
        "render_progress": 0,
        "render_task_msg": "Đang chuẩn bị dữ liệu..."
    }).eq("id", project_id).execute()
    
    tts_temp_dir = tempfile.mkdtemp(prefix=f"tts_proj_{project_id}_")
    
    try:
        if not target_chapter_ids:
             raise Exception("Không có chương nào được chọn.")
             
        chap_res = supabase.table("chapters").select("*").in_("id", target_chapter_ids).order("chapter_number").execute()
        valid_chapters = chap_res.data
        if not valid_chapters:
            raise Exception("Không tìm thấy chương hợp lệ để render.")
        total_chaps = len(valid_chapters)

        project_res = supabase.table("projects").select("video_metadata").eq("id", project_id).execute()
        project_metadata = (project_res.data or [{}])[0].get("video_metadata") or {}
        story_intro_text = str(project_metadata.get("story_intro") or "").strip()
        use_story_intro = config["story_intro_enabled"] and bool(story_intro_text)
        story_intro_position = config["story_intro_position"]
        story_intro_pause_ms = config["story_intro_pause_ms"] if use_story_intro else 0
        story_intro_pause_seconds = story_intro_pause_ms / 1000.0
        
        audio_files_to_concat = [] 
        
        # === CÁC BIẾN THEO DÕI CHO PHỤ ĐỀ VÀ CẮT VIDEO ===
        global_time_cursor = 1.0 # Bắt đầu ở 1s vì có file silence ở đầu
        all_ass_events = []      # Chứa tất cả text phụ đề
        chapter_segments = []    # Chứa thời lượng từng chương để cắt Video Part

        # ====================================================
        # 1. HÀM PHỤ TRỢ: TẠO SILENCE CHUẨN MỰC
        # ====================================================
        standard_silence_path = os.path.join(tts_temp_dir, "silence_1s.wav")
        audio_files_to_concat.append(standard_silence_path) # Bỏ 1s im lặng lên đầu tiên

        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
            "-t", "1.0",
            "-c:a", "pcm_s16le",
            standard_silence_path
        ], check=True)

        from services.tts_service import split_text_for_subtitle

        def append_subtitle_events(events: list, time_offset: float) -> None:
            for event in events:
                start_time = event["start"] + time_offset
                end_time = event["end"] + time_offset
                duration = end_time - start_time
                full_text = event["text"].strip()
                sub_chunks = split_text_for_subtitle(full_text, max_words_per_line=6)

                if len(sub_chunks) <= 1:
                    all_ass_events.append({"start": start_time, "end": end_time, "text": full_text})
                    continue

                time_per_chunk = duration / len(sub_chunks)
                for index, subtitle_text in enumerate(sub_chunks):
                    sub_start = start_time + index * time_per_chunk
                    all_ass_events.append({
                        "start": sub_start,
                        "end": sub_start + time_per_chunk,
                        "text": subtitle_text,
                    })

        story_intro_duration = 0.0
        story_intro_ass_events = []
        story_intro_audio_path = ""
        story_intro_pause_path = ""
        if use_story_intro:
            supabase.table("projects").update({
                "render_task_msg": "Đang tạo giọng đọc lời giới thiệu..."
            }).eq("id", project_id).execute()
            story_intro_result = await generate_audio_file(
                story_intro_text,
                config["voice_id"],
                tts_temp_dir,
                "story_intro",
            )
            story_intro_duration = story_intro_result["duration"]
            story_intro_ass_events = story_intro_result["ass_events"]
            story_intro_audio_path = os.path.join(tts_temp_dir, "norm_story_intro.wav")
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-i", story_intro_result["audio_path"],
                "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le",
                story_intro_audio_path,
            ], check=True, capture_output=True, text=True)

            if story_intro_pause_ms > 0:
                story_intro_pause_path = os.path.join(tts_temp_dir, f"story_intro_pause_{story_intro_pause_ms}ms.wav")
                subprocess.run([
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono",
                    "-t", f"{story_intro_pause_seconds:.3f}",
                    "-c:a", "pcm_s16le", story_intro_pause_path,
                ], check=True, capture_output=True, text=True)

            if story_intro_position == "start":
                audio_files_to_concat.append(story_intro_audio_path)
                if story_intro_pause_path:
                    audio_files_to_concat.append(story_intro_pause_path)
                append_subtitle_events(story_intro_ass_events, global_time_cursor)
                global_time_cursor += story_intro_duration + story_intro_pause_seconds

        # ====================================================
        # BƯỚC 1: XỬ LÝ TEXT VÀ TTS
        # ====================================================
        for index, chapter in enumerate(valid_chapters):
            chapter_id = chapter["id"]
            chap_num = chapter['chapter_number']
            
            progress = int((index / total_chaps) * 50)
            
            supabase.table("projects").update({
                "status": "Rendering",
                "render_progress": progress,
                "render_task_msg": f"Đang tạo giọng đọc... [Chương {chap_num}]"
            }).eq("id", project_id).execute()

            try:
                # BƯỚC 1.1: Chuẩn hóa Kịch bản
                supabase.table("chapters").update({"status": "Preparing Text"}).eq("id", chapter_id).execute()
                print(f"[Batch Render] Chuẩn hóa Text Chương {chap_num}...")
                        
                system_prompt = prompt_manager.load_prompt("visual_script_system.md")
                user_prompt = prompt_manager.load_prompt("visual_script_user.md", final_content=chapter.get("final_content", ""))
                script_result = await generate_json(system_prompt, user_prompt)
                clean_script = script_result.get("edited_text", chapter.get("final_content", "")).replace("*", "").replace("_", "")

                # BƯỚC 1.2: Gọi API Giọng Đọc (Hàm mới trả về Object)
                supabase.table("chapters").update({"status": "Generating Audio"}).eq("id", chapter_id).execute()
                print(f"[Batch Render] Đang gọi TTS Chương {chap_num}...")
                
                # Gọi hàm TTS mới (Trả về Dict chứa audio, events và duration)
                tts_result = await generate_audio_file(clean_script, config["voice_id"], tts_temp_dir, str(chapter_id))
                
                raw_audio_path = tts_result["audio_path"]
                chap_duration = tts_result["duration"]
                chap_events = tts_result["ass_events"]
                        
                # BƯỚC 1.3: ĐỒNG BỘ THỜI GIAN PHỤ ĐỀ & LƯU MỐC CẮT VIDEO
                append_subtitle_events(chap_events, global_time_cursor)
                
                # Mốc cắt video: Thời lượng Audio của chương này + (1s im lặng nếu chưa phải chương cuối)
                segment_dur = chap_duration + (1.0 if index < len(valid_chapters) - 1 else 0.0)
                chapter_segments.append(segment_dur)
                
                global_time_cursor += segment_dur

                # ÉP CHUẨN FILE TTS
                norm_audio_path = os.path.join(tts_temp_dir, f"norm_chap_{chapter_id}.wav")
                try:
                    subprocess.run([
                        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                        "-i", raw_audio_path,
                        "-ar", "44100",        
                        "-ac", "1",            
                        "-c:a", "pcm_s16le",   
                        norm_audio_path
                    ], check=True, capture_output=True, text=True)
                except subprocess.CalledProcessError as e:
                    print(f"[CẢNH BÁO] Lỗi ép chuẩn TTS C{chap_num}: {e.stderr}")
                    norm_audio_path = raw_audio_path 
                        
                audio_files_to_concat.append(norm_audio_path)
                        
                if index < len(valid_chapters) - 1:
                    audio_files_to_concat.append(standard_silence_path)
                        
                supabase.table("chapters").update({"status": "Audio Generated"}).eq("id", chapter_id).execute()
                            
            except Exception as e:
                print(f"[Lỗi Audio Chương {chap_num}] {e}")
                supabase.table("chapters").update({"status": "Error"}).eq("id", chapter_id).execute()
                raise e

        if use_story_intro and story_intro_position == "end":
            if story_intro_pause_path:
                audio_files_to_concat.append(story_intro_pause_path)
            audio_files_to_concat.append(story_intro_audio_path)
            append_subtitle_events(
                story_intro_ass_events,
                global_time_cursor + story_intro_pause_seconds,
            )

        if chapter_segments and use_story_intro:
            if story_intro_position == "start":
                chapter_segments[0] += story_intro_duration + story_intro_pause_seconds
            else:
                chapter_segments[-1] += story_intro_pause_seconds + story_intro_duration

        print("[Batch Render] Tạm nghỉ 1s để đồng bộ UI...")
        import asyncio
        await asyncio.sleep(1.0)

        # ====================================================
        # BƯỚC 1.5: TẠO FILE PHỤ ĐỀ (.ASS) TỪ EVENT ARRAY
        # ====================================================
        supabase.table("projects").update({
            "render_progress": 52,
            "render_task_msg": "Đang đồng bộ phụ đề..."
        }).eq("id", project_id).execute()

        from services.tts_service import format_ass_time
        ass_file_path = os.path.join(tts_temp_dir, "project_subtitles.ass")
        
        ass_content = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Be Vietnam Pro,72,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,3,18,0,2,35,35,480,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
        with open(ass_file_path, "w", encoding="utf-8") as f:
            f.write(ass_content)
            for ev in all_ass_events:
                start_str = format_ass_time(ev["start"])
                end_str = format_ass_time(ev["end"])
                clean_text = ev["text"].replace("\n", " ")
                f.write(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{clean_text}\n")


        # ====================================================
        # BƯỚC 2. NỐI AUDIO (M4A)
        # ====================================================
        print(f"[Batch Render] Đang nối {len(audio_files_to_concat)} đoạn Audio...")
        supabase.table("projects").update({
            "render_progress": 55,
            "render_task_msg": "Đang nối Audio tổng..."
        }).eq("id", project_id).execute()

        final_audio_path = os.path.join(tts_temp_dir, "Full_Project_Audio.m4a")
        list_file_path = os.path.join(tts_temp_dir, "audio_concat_list.txt")
        with open(list_file_path, "w", encoding="utf-8") as f:
            for filepath in audio_files_to_concat:
                safe_path = os.path.abspath(filepath).replace("\\", "/") 
                f.write(f"file '{safe_path}'\n")

        try:
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "concat", "-safe", "0",
                "-i", list_file_path,
                "-filter:a", "volume=3dB",
                "-c:a", "aac",        
                "-b:a", "192k",       
                "-ar", "44100",       
                final_audio_path
            ], check=True, capture_output=True, text=True)
        except subprocess.CalledProcessError as e:
            print(f"\n==== LỖI NỐI AUDIO ====\n{e.stderr}\n=======================\n")
            raise Exception("Lỗi ghép nối file Audio tổng.")

        from services.video_service import get_media_duration
        actual_duration = get_media_duration(final_audio_path)
        print(f"[Batch Render] Thời lượng Audio sau khi nối: {actual_duration:.2f} giây")

        # ====================================================
        # BƯỚC 3: RENDER VIDEO (FFMPEG SINGLE-PASS)
        # ====================================================
        for chapter in valid_chapters:
            supabase.table("chapters").update({"status": "Audio Compiled"}).eq("id", chapter["id"]).execute()
            
        supabase.table("projects").update({
            "render_progress": 70,
            "render_task_msg": "Đang chạy FFmpeg Video (Tiến trình này mất nhiều thời gian)...",
        }).eq("id", project_id).execute()

        # Truyền thêm file ASS và mảng cắt video vào Video Engine
        await process_full_project_video(
            project_id=project_id, 
            final_audio_path=final_audio_path, 
            audio_duration=actual_duration, 
            config=config,
            ass_sub_path=ass_file_path,
            chapter_segments=chapter_segments
        )

        # ====================================================
        # BƯỚC 4: HOÀN THÀNH
        # ====================================================
        for chapter in valid_chapters:
            supabase.table("chapters").update({"status": "Completed"}).eq("id", chapter["id"]).execute()
            
        supabase.table("projects").update({
            "status": "Completed",
            "render_progress": 100,
            "render_task_msg": "Hoàn thành!"
        }).eq("id", project_id).execute()
        
        print(f"[Batch Render] HOÀN THÀNH TOÀN BỘ DỰ ÁN!")

    except Exception as e:
        supabase.table("projects").update({
            "status": "Error",
            "render_task_msg": f"LỖI HỆ THỐNG: {str(e)[:100]}..."
        }).eq("id", project_id).execute()

        supabase.table("chapters").update({"status": "Error"}).eq("project_id", project_id).eq("status", "Rendering").execute()
    finally:
        import shutil
        if os.path.exists(tts_temp_dir):
            shutil.rmtree(tts_temp_dir)
            

async def background_update_memory(project_id: str, old_memory: dict, new_text: str):
    """
    Hàm này chạy ngầm sau khi trả kết quả Draft cho người dùng.
    Nó gọi AI tóm tắt văn bản mới và gộp vào bộ nhớ cũ, sau đó lưu DB.
    """
    try:
        print(f"[Memory Keeper] Đang cập nhật bộ nhớ cho project {project_id}...")
        
        system_prompt = prompt_manager.load_prompt("memory_system.md")
        user_prompt = prompt_manager.load_prompt(
            "memory_user.md",
            current_memory=json.dumps(old_memory, ensure_ascii=False) if old_memory else "Chưa có",
            new_draft_text=new_text
        )
        
        # Gọi AI tóm tắt (Trả về JSON)
        memory_result = await generate_json(system_prompt, user_prompt)
        
        # Lưu vào Database
        supabase.table("projects").update({
            "current_memory": memory_result
        }).eq("id", project_id).execute()
        
        print("[Memory Keeper] Đã cập nhật thành công!")
    except Exception as e:
        print(f"[Memory Keeper Error] Lỗi cập nhật bộ nhớ: {e}")


import copy


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
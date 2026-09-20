import json
import os
import subprocess
import tempfile

from core.database import supabase  # Import DB
from core.prompt_manager import prompt_manager
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from schemas import (
    AnalyzeBeatTextRequest,
    AnalyzeChapterIdeaRequest,
    BeatUpdateRequest,
    BulkBeatUpdateRequest,
    BulkUpdateChaptersRequest,
    ChapterUpdateRequest,
    EditBeatTextRequest,
    GenerateCharacterRequest,
    GenerateRelationshipRequest,
    GenerateSingleChapterRequest,
    IdeationRequest,
    MetadataGenerateRequest,
    ProjectCreateRequest,
    UpdateBibleRequest,
    UpdateRenderConfigRequest,
)
from services.llm_service import generate_json, generate_text_xml
from services.tts_service import generate_audio_file
from services.video_service import process_full_project_video

app = FastAPI(title="Story Maker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==========================================
# 1.1 GENERATE IDEA
# ==========================================
@app.post("/api/ideation")
async def generate_ideas(request: IdeationRequest):
    """
    Nhận Mạch truyện sơ bộ -> Trả về 10 ý tưởng đa góc nhìn
    """
    try:
        system_prompt = prompt_manager.load_prompt("ideation_system.md")
        user_prompt = prompt_manager.load_prompt(
            "ideation_user.md", 
            story_premise=request.story_premise
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
            "vietnamese_context": request.vietnamese_context,
            "story_premise": request.story_premise,
            "situational_irony": request.situational_irony,
            "micro_conflict": request.micro_conflict,
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
        user_prompt = prompt_manager.load_prompt("story_bible_user.md", story_seed=story_seed_json)
        
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
        system_prompt = prompt_manager.load_prompt("add_character_system.md")
        user_prompt = prompt_manager.load_prompt(
            "add_character_user.md",
            current_bible=json.dumps(request.current_bible, ensure_ascii=False),
            user_prompt=request.user_prompt
        )
        
        result = await generate_json(system_prompt, user_prompt)
        new_char = result.get("new_character")
        
        if not new_char:
            raise ValueError("AI không tạo được nhân vật theo đúng chuẩn.")
            
        return {"success": True, "data": new_char}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/projects/{project_id}/generate-relationship")
async def generate_relationship(project_id: str, request: GenerateRelationshipRequest):
    try:
        system_prompt = prompt_manager.load_prompt("add_relationship_system.md")
        user_prompt = prompt_manager.load_prompt(
            "add_relationship_user.md",
            current_bible=json.dumps(request.current_bible, ensure_ascii=False),
            user_prompt=request.user_prompt
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
            chapters_to_insert.append({
                "project_id": project_id,
                "chapter_number": chapter.get("chapter_number"),
                "title": chapter.get("title", f"Chương {chapter.get('chapter_number')}"),
                "timeline_period": chapter.get("timeline_period", "Hiện tại"),
                "pov_character": chapter.get("character_focus", "Unknown"),
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


@app.post("/api/projects/{project_id}/analyze-chapter-idea")
async def analyze_chapter_idea(project_id: str, request: AnalyzeChapterIdeaRequest):
    """Bước 1: Trả về lời phản biện (Critique) cho ý tưởng của User."""
    try:
        proj_res = supabase.table("projects").select("story_bible").eq("id", project_id).execute()
        optimized_bible = get_optimized_bible(proj_res.data[0].get("story_bible"), task="single_chapter")
        
        system_prompt = prompt_manager.load_prompt("analyze_chapter_idea_system.md")
        user_prompt = prompt_manager.load_prompt(
            "analyze_chapter_idea_user.md",
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
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
            "id, chapter_number, title, pov_character, primary_function, main_event, emotional_beat, relationship_beat, chapter_hook, continuity_note, projects(story_bible, current_memory)"
        ).eq("id", chapter_id).execute()
        
        if not chap_res.data: 
            raise HTTPException(status_code=404, detail="Chapter not found")
            
        chapter = chap_res.data[0]
        project = chapter["projects"]
        
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
        
        # Lọc Story Bible (Tác vụ: beat_breakdown)
        optimized_bible = get_optimized_bible(project.get("story_bible"), task="beat_breakdown")
        
        # Load Prompts
        system_prompt = prompt_manager.load_prompt("beat_system.md")
        user_prompt = prompt_manager.load_prompt(
            "beat_user.md",
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
            chapter_info=json.dumps(chapter_info, ensure_ascii=False),
            current_memory=json.dumps(project.get("current_memory", {}), ensure_ascii=False) if project.get("current_memory") else "Đây là chương đầu tiên."
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
                "action_and_dialogue": f"Action: {beat.get('action_and_sensory_focus')}\nDialogue: {beat.get('dialogue_and_subtext')}",
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


@app.put("/api/projects/{project_id}/bulk-update-chapters")
async def bulk_update_chapters(project_id: str, request: BulkUpdateChaptersRequest):
    try:
        current_chaps_res = supabase.table("chapters").select("id").eq("project_id", project_id).execute()
        current_ids = [str(c["id"]) for c in current_chaps_res.data]
        
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

        return {"success": True}
        
    except Exception as e:
        print(f"[Error Bulk Update] LỖI: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    

@app.post("/api/chapters/{chapter_id}/batch-draft")
async def batch_draft_chapter(chapter_id: str, background_tasks: BackgroundTasks):
    try:
        # 1. Lấy tất cả các beats của chương, sắp xếp đúng thứ tự
        chapter_res = supabase.table("chapters").select("main_event, primary_function, pov_character, timeline_period").eq("id", chapter_id).execute()
        beats_res = supabase.table("beats").select("*").eq("chapter_id", chapter_id).order("beat_order").execute()
        beats = beats_res.data
        chapter_info = chapter_res.data[0] if chapter_res.data else {}
        
        if not beats:
            raise HTTPException(status_code=400, detail="Chương này chưa có nhịp truyện (Beats) nào.")

        # Lấy thông tin Project để lấy Memory
        chapter_res = supabase.table("chapters").select("projects(id, story_bible)").eq("id", chapter_id).execute()
        project = chapter_res.data[0]["projects"]
        project_id = project["id"]

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
                present_characters=present_chars_list
            )
            system_prompt = prompt_manager.load_prompt("draft_system.md")
            user_prompt = prompt_manager.load_prompt(
                "draft_user.md",
                story_bible=json.dumps(optimized_bible, ensure_ascii=False),
                current_memory=json.dumps(current_memory_data, ensure_ascii=False),
                previous_beat_text=previous_text[-1500:],
                beat_data=json.dumps(beat, ensure_ascii=False)
            )
            
            draft_text = await generate_text_xml(system_prompt, user_prompt, target_tag="story_text")
            
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

        # Cập nhật status của chương thành "Drafted" để UI biết
        supabase.table("chapters").update({"status": "Draft Completed"}).eq("id", chapter_id).execute()

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
        beat_res = supabase.table("beats").select("*, chapters(*, projects(*))").eq("id", beat_id).execute()
        beat = beat_res.data[0]
        project = beat["chapters"]["projects"]
        project_id = project["id"]
        
        current_memory_data = project.get("current_memory", {})
        
        # 2. Gọi AI Viết Văn
        chars_str = beat.get("characters_present", "")
        present_chars_list = [c.strip() for c in chars_str.split(",") if c.strip()]

        # Gọi hàm lọc
        optimized_bible = get_optimized_bible(
            project.get("story_bible", {}), 
            task="drafting", 
            present_characters=present_chars_list
        )
        system_prompt = prompt_manager.load_prompt("draft_system.md")
        user_prompt = prompt_manager.load_prompt(
            "draft_user.md",
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
            current_memory=json.dumps(current_memory_data, ensure_ascii=False),
            previous_beat_text=previous_text[-1500:],
            beat_data=json.dumps(beat, ensure_ascii=False)
        )
        
        draft_text = await generate_text_xml(system_prompt, user_prompt, target_tag="story_text")
        
        # 3. Lưu bản nháp vào DB
        supabase.table("beats").update({"ai_draft_text": draft_text}).eq("id", beat_id).execute()
        
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
            supabase.table("beats").update({"ai_draft_text": beat["draft_text"]}).eq("id", beat["id"]).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/beats/{beat_id}/analyze-text-idea")
async def analyze_beat_text_idea(beat_id: str, request: AnalyzeBeatTextRequest):
    try:
        if not request.current_text:
            raise HTTPException(status_code=400, detail="Chưa có văn bản nháp. Hãy bấm 'AI Viết Nháp' trước khi sửa.")

        beat_res = supabase.table("beats").select("*, chapters(id, chapter_number, title, pov_character, primary_function, main_event, emotional_beat, relationship_beat, chapter_hook, continuity_note, projects(story_bible), projects(*))").eq("id", beat_id).execute()
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
        beat_res = supabase.table("beats").select("id, chapters(id, chapter_number, title, pov_character, primary_function, main_event, emotional_beat, relationship_beat, chapter_hook, continuity_note, projects(story_bible), projects(*))").eq("id", beat_id).execute()
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
            story_bible=json.dumps(optimized_bible, ensure_ascii=False),
            chapter_info=json.dumps(chapter_info, ensure_ascii=False)
        )
        
        # Gọi hàm trả về Text (XML tag) giống hệt lúc Draft
        new_text = await generate_text_xml(system_prompt, user_prompt, target_tag="story_text")
        
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
        project_res = supabase.table("chapters").select("chapter_number, project_id, projects(story_bible)").eq("id", chapter_id).single().execute()
        
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
        res = supabase.table("projects").select("id, title, vibe, logline, status, created_at").order("created_at", desc=True).execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/projects/{project_id}")
async def get_single_project(project_id: str):
    try:
        res = supabase.table("projects").select("*").eq("id", project_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án.")
        return {"success": True, "data": res.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/projects/{project_id}/chapters")
async def get_chapters(project_id: str):
    try:
        columns = "id, chapter_number, title, pov_character, status, timeline_period, main_event, primary_function, emotional_beat, relationship_beat, chapter_hook, continuity_note"
        res = supabase.table("chapters").select(columns).eq("project_id", project_id).order("chapter_number").execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chapters/{chapter_id}/beats")
async def get_beats(chapter_id: str):
    try:
        # Lấy danh sách beats của 1 chương, sắp xếp theo thời gian tạo
        res = supabase.table("beats").select("*").eq("chapter_id", chapter_id).order("beat_order").execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/beats/{beat_id}")
async def update_beat_text(beat_id: str, request: BeatUpdateRequest):
    try:
        supabase.table("beats").update({"ai_draft_text": request.draft_text}).eq("id", beat_id).execute()
        return {"success": True}
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


# API Endpoint kích hoạt Batch Render
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
        res = supabase.table("projects").select("id, title, vibe, logline, story_bible, video_metadata").eq("id", project_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dự án")
        project = res.data[0]
        
        system_prompt = prompt_manager.load_prompt("metadata_system.md")
        user_prompt = prompt_manager.load_prompt(
            "metadata_user.md",
            title=project.get("title", ""),
            vibe=project.get("vibe", ""),
            logline=project.get("logline", ""),
            micro_conflict=project.get("story_bible", {}).get("story_identity", {}).get("core_premise", ""),
            target_type=request.target_type,
            tone=request.tone # Nhận tone từ UI
        )
        
        result_json = await generate_json(system_prompt, user_prompt)
        
        # Hứng mảng results thay vì result đơn lẻ
        generated_list = result_json.get("results", [])
        
        # Không tự động lưu vào DB nữa, trả thẳng list về cho UI để UI cho user chọn
        return {"success": True, "data": generated_list}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def background_batch_render(project_id: str, config: dict, target_chapter_ids: list):
    print(f"[Batch Render] Bắt đầu xử lý cho Project: {project_id}")
    
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
        total_chaps = len(valid_chapters)
        
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
                from services.tts_service import split_text_for_subtitle # Nhớ import hàm vừa tạo

                for event in chap_events:
                    start_time = event["start"] + global_time_cursor
                    end_time = event["end"] + global_time_cursor
                    duration = end_time - start_time
                    full_text = event["text"].strip()
                    
                    # Cắt câu dài thành các dòng phụ đề ngắn (Max 6 chữ/dòng)
                    sub_chunks = split_text_for_subtitle(full_text, max_words_per_line=6)
                    num_chunks = len(sub_chunks)
                    
                    # Nếu câu ngắn (chỉ có 1 chunk), giữ nguyên thời gian
                    if num_chunks <= 1:
                        all_ass_events.append({
                            "start": start_time,
                            "end": end_time,
                            "text": full_text
                        })
                    else:
                        # Nếu câu dài, chia đều thời lượng hiển thị cho từng chunk
                        # (Cách này tính toán tuyến tính, không chuẩn xác 100% bằng Whisper word-timestamp 
                        # nhưng đủ tốt và dễ đọc cho video)
                        time_per_chunk = duration / num_chunks
                        current_sub_start = start_time
                        
                        for sub in sub_chunks:
                            all_ass_events.append({
                                "start": current_sub_start,
                                "end": current_sub_start + time_per_chunk,
                                "text": sub
                            })
                            current_sub_start += time_per_chunk
                
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

def get_optimized_bible(full_bible: dict, task: str, present_characters: list = None) -> dict:
    """
    Hàm gọt dũa Story Bible tùy theo tác vụ của AI để tránh pha loãng ngữ cảnh (Context Dilution).
    """
    if not full_bible:
        return {}
        
    optimized = copy.deepcopy(full_bible)
    
    # ====================================================
    # TÁC VỤ 1: PACING & SINGLE CHAPTER (Kiến trúc vĩ mô)
    # Cần: Động cơ, Mâu thuẫn, Arc tổng thể.
    # Bỏ: Ngoại hình, thói quen lặt vặt, chi tiết sinh hoạt.
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
            
        # Riêng single_chapter (sửa 1 chương) thì bỏ luôn cấu trúc cảm xúc tổng thể cho nhẹ
        if task == "single_chapter":
            optimized.pop("emotional_architecture", None)
            optimized.pop("story_continuity", None)


    # ====================================================
    # TÁC VỤ 2: BEAT BREAKDOWN (Đạo diễn chia cảnh)
    # Cần: Tính cách, Nỗi sợ, Bí mật, Quy tắc hội thoại.
    # Bỏ: Cấu trúc Arc dài hạn, Diện mạo, Định dạng Vibe tổng.
    # ====================================================
    elif task == "beat_breakdown":
        if "characters" in optimized:
            for char in optimized.get("characters", []):
                char.pop("appearance", None) # Không cần tả quần áo lúc lên kịch bản hành động
                char.pop("character_arc", None) # Quá dài cho 1 chương ngắn
                
        if "world_building" in optimized:
            optimized["world_building"].pop("cultural_context", None)
            optimized["world_building"].pop("past_setting", None)
            
        optimized.pop("emotional_architecture", None)
        # Bỏ Story Identity (vì Prompt đã có sẵn chapter goal và memory)
        optimized.pop("story_identity", None) 


    # ====================================================
    # TÁC VỤ 3: DRAFTING (Nhà văn viết chữ) - LỌC CỰC MẠNH
    # Cần: Ngoại hình, Thói quen, Đạo cụ, Quan hệ của ĐÚNG người có mặt.
    # Bỏ: Toàn bộ Theme, Premise, Conflict tổng thể để tránh văn mẫu.
    # ====================================================
    elif task == "drafting":
        # 1. LỌC NHÂN VẬT: Chỉ giữ lại những người có tên trong mảng present_characters
        if "characters" in optimized and present_characters:
            filtered_chars = [
                c for c in optimized["characters"]
                if any(p.lower() in c.get("name", "").lower() for p in present_characters)
            ]
            optimized["characters"] = filtered_chars or optimized["characters"] # Fallback an toàn
            
        # 2. LỌC QUAN HỆ: Chỉ giữ quan hệ liên quan đến người đang có mặt
        if "relationship_dynamics" in optimized and present_characters:
            filtered_rels = [
                r for r in optimized["relationship_dynamics"]
                if any(b.lower() in [p.lower() for p in present_characters] for b in r.get("between", []))
            ]
            optimized["relationship_dynamics"] = filtered_rels
            
        # 3. LỌC SIÊU METADATA: Ép AI chỉ tập trung vào cảnh trước mắt (Show, don't tell)
        keys_to_drop = [
            "story_identity",          # Tránh viết lan man về thông điệp truyện
            "conflict_system",         # Tránh kể lể mâu thuẫn gia tộc/xã hội
            "story_continuity",        # Tránh nhắc lại hạt giống ý tưởng
            "emotional_architecture"   # Tránh tả cảm xúc kiểu nhảy cóc
        ]
        for k in keys_to_drop:
            optimized.pop(k, None)

    return optimized
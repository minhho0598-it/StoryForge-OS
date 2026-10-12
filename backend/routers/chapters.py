import json
from fastapi import APIRouter, BackgroundTasks, HTTPException

from core.database import supabase
from core.prompt_manager import prompt_manager
from core.style_filter import load_forbidden_phrases
from core.story_prompts import load_story_system_prompt
from schemas import (
    BulkUpdateChaptersRequest,
    ChapterUpdateRequest,
    GenerateAllBeatsRequest,
    StoryOutlineUpdateRequest,
)
from services.llm_service import generate_json, generate_text_xml

from .common import (
    _chapter_signature,
    _format_previous_beats,
    _load_project_chapters,
    _project_has_beats,
    _project_literary_style,
    _sanitize_story_text,
    _story_bible_signature,
    get_optimized_bible,
    get_pov_instruction,
)

router = APIRouter()


@router.post("/api/chapters/{chapter_id}/generate-beats")
async def generate_beats(chapter_id: str):
    try:
        # Lấy thông tin chapter (bao gồm 4 trường mới) và project liên quan
        chap_res = supabase.table("chapters").select(
            "id, project_id, chapter_number, title, timeline_period, pov_character, primary_function, main_event, emotional_beat, relationship_beat, chapter_hook, continuity_note, projects(story_bible, current_memory, heat_level, render_config)"
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
        system_prompt = load_story_system_prompt(
            "beat_system.md",
            _project_literary_style(project),
        )
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

@router.post("/api/projects/{project_id}/generate-story-outline")
async def generate_story_outline(project_id: str):
    try:
        project_result = (
            supabase.table("projects")
            .select("id, title, vibe, logline, story_bible, story_outline, beat_generation, render_config")
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
        system_prompt = load_story_system_prompt(
            "story_outline_system.md",
            _project_literary_style(project),
        )
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

@router.put("/api/projects/{project_id}/story-outline")
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

async def _generate_project_beats(project_id: str):
    try:
        project_result = (
            supabase.table("projects")
            .select("id, story_bible, story_outline, current_memory, heat_level, render_config")
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
                load_story_system_prompt(
                    "beat_system.md",
                    _project_literary_style(project),
                ),
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

@router.post("/api/projects/{project_id}/generate-all-beats")
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

@router.get("/api/projects/{project_id}/beat-generation")
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

@router.put("/api/projects/{project_id}/bulk-update-chapters")
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

@router.post("/api/chapters/{chapter_id}/batch-draft")
async def batch_draft_chapter(
    chapter_id: str,
    background_tasks: BackgroundTasks,
    previous_text: str = "",
):
    try:
        forbidden_phrases = load_forbidden_phrases()
        # 1. Lấy tất cả các beats của chương, sắp xếp đúng thứ tự
        chapter_res = supabase.table("chapters").select("pov_character, projects(id, story_bible, heat_level, render_config)").eq("id", chapter_id).execute()
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
            system_prompt = load_story_system_prompt(
                "draft_system.md",
                _project_literary_style(project),
            )
            pov_instruction = get_pov_instruction(
                project.get("story_bible", {}),
                chapter_res.data[0].get("pov_character", ""),
            )
            user_prompt = prompt_manager.load_prompt(
                "draft_user.md",
                story_bible=json.dumps(optimized_bible, ensure_ascii=False),
                heat_level=project.get("heat_level", 1),
                current_memory=json.dumps(current_memory_data, ensure_ascii=False),
                previous_beat_text=previous_text[-900:],
                beat_data=json.dumps(beat, ensure_ascii=False),
                pov_instruction=pov_instruction,
                forbidden_phrases=json.dumps(
                    forbidden_phrases, ensure_ascii=False
                ),
            )

            draft_text = _sanitize_story_text(
                await generate_text_xml(system_prompt, user_prompt, target_tag="story_text")
            )
            
            # Lưu bản nháp vào DB
            supabase.table("beats").update({"ai_draft_text": draft_text}).eq("id", beat["id"]).execute()
            
            # Lấy 900 ký tự cuối để làm mồi cho Beat tiếp theo
            previous_text = draft_text

            # CẬP NHẬT TRÍ NHỚ ĐỒNG BỘ (Bắt buộc phải await ở đây thay vì background task
            # để đảm bảo Beat sau CÓ trí nhớ của Beat trước)
            print(f"[Batch Draft] Đang cập nhật bộ nhớ sau Beat {beat['beat_id']}...")
            try:
                mem_sys = load_story_system_prompt(
                    "memory_system.md",
                    _project_literary_style(project),
                )
                mem_usr = prompt_manager.load_prompt(
                    "memory_user.md",
                    current_memory=json.dumps(current_memory_data, ensure_ascii=False) if current_memory_data else "Chưa có",
                    new_draft_text=draft_text
                )
                memory_result = await generate_json(mem_sys, mem_usr)
                supabase.table("projects").update({"current_memory": memory_result}).eq("id", project_id).execute()
                print(f"[Batch Draft] Cập nhật bộ nhớ thành công sau Beat {beat['beat_id']}.")
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

@router.post("/api/chapters/{chapter_id}/refine")
async def refine_chapter(chapter_id: str):
    try:
        # Lấy tất cả các beats của chương này
        beats_res = supabase.table("beats").select("ai_draft_text, characters_present").eq("chapter_id", chapter_id).order("beat_order").execute()
        project_res = supabase.table("chapters").select("chapter_number, project_id, projects(story_bible, heat_level, render_config)").eq("id", chapter_id).single().execute()
        
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

        system_prompt = load_story_system_prompt(
            "refine_system.md",
            _project_literary_style(project_res.data),
        )
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

@router.get("/api/projects/{project_id}/chapters")
async def get_chapters(project_id: str):
    try:
        columns = "id, chapter_number, title, pov_character, status, final_content, timeline_period, main_event, primary_function, emotional_beat, relationship_beat, chapter_hook, continuity_note"
        res = supabase.table("chapters").select(columns).eq("project_id", project_id).order("chapter_number").execute()
        return {"success": True, "data": res.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/api/chapters/{chapter_id}")
async def update_chapter_final_content(chapter_id: str, request: ChapterUpdateRequest):
    try:
        supabase.table("chapters").update({"final_content": request.final_content}).eq("id", chapter_id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/chapters/{chapter_id}")
async def get_single_chapter(chapter_id: str):
    try:
        # Lấy đầy đủ vì lúc này user đang view chi tiết
        res = supabase.table("chapters").select("id, title, status, final_content").eq("id", chapter_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy.")
        return {"success": True, "data": res.data[0]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

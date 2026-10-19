import json
from fastapi import APIRouter, BackgroundTasks, HTTPException

from core.database import supabase
from core.prompt_manager import prompt_manager
from core.style_filter import load_forbidden_phrases
from core.story_prompts import load_story_system_prompt
from schemas import (
    AnalyzeBeatTextRequest,
    BeatInsertRequest,
    BeatUpdateRequest,
    BulkBeatUpdateRequest,
    EditBeatTextRequest,
)
from services.llm_service import generate_json, generate_text_xml, generate_text_xml_tags

from .common import (
    _project_literary_style,
    _sanitize_beat_drafts,
    _sanitize_story_text,
    get_optimized_bible,
    get_pov_instruction,
)

router = APIRouter()


def _build_single_beat_draft_prompts(beat: dict, previous_text: str) -> tuple[str, str]:
    beat_data = {
        "location": beat.get("location", ""),
        "characters_present": beat.get("characters_present", ""),
        "action_and_dialogue": beat.get("action_and_dialogue", ""),
        "emotional_shift": beat.get("emotional_shift", ""),
    }
    chapter = beat["chapter"]
    project = chapter["projects"]
    current_memory_data = project.get("current_memory", {})
    chars_str = beat.get("characters_present", "")
    present_chars_list = [c.strip() for c in chars_str.split(",") if c.strip()]

    optimized_bible = get_optimized_bible(
        project.get("story_bible", {}),
        task="drafting",
        present_characters=present_chars_list,
        pov_character=chapter.get("pov_character", ""),
    )
    chapter_info = {
        "title": chapter["title"],
        "primary_function": chapter.get("primary_function"),
        "main_event": chapter.get("main_event"),
        "emotional_beat": chapter.get("emotional_beat"),
        "relationship_beat": chapter.get("relationship_beat"),
        "chapter_hook": chapter.get("chapter_hook"),
        "continuity_note": chapter.get("continuity_note"),
    }
    system_prompt = load_story_system_prompt(
        "draft_system.md",
        _project_literary_style(project),
    )
    forbidden_phrases = load_forbidden_phrases()
    user_prompt = prompt_manager.load_prompt(
        "draft_user.md",
        story_bible=json.dumps(optimized_bible, ensure_ascii=False),
        chapter_info=json.dumps(chapter_info, ensure_ascii=False),
        heat_level=project.get("heat_level", 1),
        current_memory=json.dumps(current_memory_data, ensure_ascii=False),
        previous_beat_text=previous_text[-900:],
        beat_data=json.dumps(beat_data, ensure_ascii=False),
        pov_instruction=get_pov_instruction(
            project.get("story_bible", {}),
            chapter.get("pov_character", ""),
        ),
        forbidden_phrases=json.dumps(forbidden_phrases, ensure_ascii=False),
    )
    return system_prompt, user_prompt

@router.get("/api/beats/{beat_id}/draft-prompt")
async def get_single_beat_draft_prompt(beat_id: str, previous_text: str = ""):
    try:
        beat_res = (
            supabase.table("beats")
            .select("location, characters_present, action_and_dialogue, emotional_shift, chapter:chapters(id, title, pov_character, timeline_period, primary_function, main_event, emotional_beat, relationship_beat, chapter_hook, continuity_note, memory_before_chapter, projects(id, current_memory, story_bible, heat_level, render_config))")
            .eq("id", beat_id)
            .execute()
        )

        if not beat_res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy beat.")
        system_prompt, user_prompt = _build_single_beat_draft_prompts(
            beat_res.data[0],
            previous_text,
        )
        return {
            "success": True,
            "data": {
                "system_prompt": system_prompt,
                "user_prompt": user_prompt,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/beats/{beat_id}/draft")
async def draft_single_beat(beat_id: str, background_tasks: BackgroundTasks, previous_text: str = ""):
    try:
        # 1. Lấy Data
        beat_res = supabase.table("beats").select("*, chapter:chapters(id, title, pov_character, timeline_period, primary_function, main_event, emotional_beat, relationship_beat, chapter_hook, continuity_note, memory_before_chapter, projects(id, current_memory, story_bible, heat_level, render_config))").eq("id", beat_id).execute()
        if not beat_res.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy beat.")
        beat = beat_res.data[0]
        chapter = beat["chapter"]
        project = chapter["projects"]
        project_id = project["id"]
        current_memory_data = project.get("current_memory", {})

        if chapter.get("memory_before_chapter") is None:
            chapter_beats = (
                supabase.table("beats")
                .select("ai_draft_text")
                .eq("chapter_id", chapter["id"])
                .execute()
            ).data or []
            if not any(item.get("ai_draft_text") for item in chapter_beats):
                supabase.table("chapters").update({
                    "memory_before_chapter": current_memory_data or {},
                }).eq("id", chapter["id"]).execute()

        # 2. Gọi AI Viết Văn
        system_prompt, user_prompt = _build_single_beat_draft_prompts(beat, previous_text)
        generated_tags = await generate_text_xml_tags(
            system_prompt,
            user_prompt,
            ["story_text", "pronoun_mapping"],
        )
        draft_text = _sanitize_story_text(generated_tags["story_text"])
        
        # 3. Lưu bản nháp vào DB
        supabase.table("beats").update({
            "ai_draft_text": draft_text,
            "pronoun_mapping": generated_tags["pronoun_mapping"],
        }).eq("id", beat_id).execute()
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

@router.put("/api/beats/bulk-update")
async def bulk_update_beats(request: BulkBeatUpdateRequest, background_tasks: BackgroundTasks):
    try:
        memory_updates: dict[str, dict] = {}
        for beat in request.beats:
            beat_id = beat.get("id")
            if not beat_id or "draft_text" not in beat:
                raise HTTPException(
                    status_code=400,
                    detail="Mỗi beat cần có id và draft_text.",
                )
            draft_text = beat["draft_text"]
            beat_result = (
                supabase.table("beats")
                .select("id, chapter_id, ai_draft_text, pronoun_mapping")
                .eq("id", beat_id)
                .execute()
            )
            if not beat_result.data:
                raise HTTPException(status_code=404, detail=f"Không tìm thấy beat {beat_id}.")
            saved_beat = beat_result.data[0]
            sanitized_text = (
                _sanitize_story_text(draft_text) if draft_text is not None else None
            )
            beat_updates = {"ai_draft_text": sanitized_text}
            if sanitized_text != saved_beat.get("ai_draft_text"):
                beat_updates["pronoun_mapping"] = ""
            supabase.table("beats").update(beat_updates).eq("id", beat_id).execute()

            if (
                not sanitized_text
                or sanitized_text == saved_beat.get("ai_draft_text")
            ):
                continue

            chapter_result = (
                supabase.table("chapters")
                .select("project_id")
                .eq("id", saved_beat["chapter_id"])
                .execute()
            )
            if not chapter_result.data:
                raise HTTPException(status_code=404, detail="Không tìm thấy chapter của beat.")
            project_id = chapter_result.data[0]["project_id"]
            if project_id not in memory_updates:
                project_result = (
                    supabase.table("projects")
                    .select("current_memory")
                    .eq("id", project_id)
                    .execute()
                )
                if not project_result.data:
                    raise HTTPException(status_code=404, detail="Không tìm thấy project của beat.")
                memory_updates[project_id] = {
                    "old_memory": project_result.data[0].get("current_memory") or {},
                    "drafts": [],
                }
            memory_updates[project_id]["drafts"].append(sanitized_text)

        for project_id, update in memory_updates.items():
            background_tasks.add_task(
                background_update_memory,
                project_id=project_id,
                old_memory=update["old_memory"],
                new_text="\n\n".join(update["drafts"]),
            )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/beats/{beat_id}/analyze-text-idea")
async def analyze_beat_text_idea(beat_id: str, request: AnalyzeBeatTextRequest):
    try:
        if not request.current_text:
            raise HTTPException(status_code=400, detail="Chưa có văn bản nháp. Hãy bấm 'AI Viết Nháp' trước khi sửa.")

        beat_res = supabase.table("beats").select("*, chapters(id, chapter_number, title, pov_character, primary_function, main_event, emotional_beat, relationship_beat, chapter_hook, continuity_note, projects(story_bible, heat_level, render_config))").eq("id", beat_id).execute()
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
            
        system_prompt = load_story_system_prompt(
            "analyze_beat_text_system.md",
            _project_literary_style(project),
        )
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

@router.post("/api/beats/{beat_id}/edit-text")
async def edit_beat_text(beat_id: str, request: EditBeatTextRequest):
    try:
        beat_res = supabase.table("beats").select("id, chapters(id, chapter_number, title, pov_character, primary_function, main_event, emotional_beat, relationship_beat, chapter_hook, continuity_note, projects(story_bible, heat_level, render_config))").eq("id", beat_id).execute()
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
        
        system_prompt = load_story_system_prompt(
            "edit_beat_text_system.md",
            _project_literary_style(project),
        )
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
        supabase.table("beats").update({
            "ai_draft_text": new_text,
            "pronoun_mapping": "",
        }).eq("id", beat_id).execute()
        
        return {"success": True, "text": new_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/chapters/{chapter_id}/beats")
async def get_beats(chapter_id: str):
    try:
        # Lấy danh sách beats của 1 chương, sắp xếp theo thời gian tạo
        res = supabase.table("beats").select("*").eq("chapter_id", chapter_id).order("beat_order").execute()
        return {"success": True, "data": _sanitize_beat_drafts(res.data or [])}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/projects/{project_id}/beats")
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

@router.post("/api/chapters/{chapter_id}/beats")
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
            "pronoun_mapping": "",
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

@router.delete("/api/beats/{beat_id}")
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

@router.put("/api/beats/{beat_id}")
async def update_beat_text(
    beat_id: str,
    request: BeatUpdateRequest,
    background_tasks: BackgroundTasks,
):
    try:
        updates = request.model_dump(exclude_unset=True)
        draft_text_changed = False
        if "draft_text" in updates:
            draft_text = updates.pop("draft_text")
            sanitized_text = (
                _sanitize_story_text(draft_text) if draft_text is not None else None
            )
            updates["ai_draft_text"] = sanitized_text
            draft_text_changed = bool(sanitized_text)
        if not updates:
            raise HTTPException(status_code=400, detail="Không có dữ liệu để cập nhật.")
        beat_result = (
            supabase.table("beats")
            .select("chapter_id, ai_draft_text")
            .eq("id", beat_id)
            .execute()
        )
        if not beat_result.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy beat.")
        saved_beat = beat_result.data[0]
        chapter_result = (
            supabase.table("chapters")
            .select("project_id, status")
            .eq("id", saved_beat["chapter_id"])
            .execute()
        )
        if not chapter_result.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy chapter của beat.")
        saved_chapter = chapter_result.data[0]
        draft_text_changed = (
            draft_text_changed
            and updates.get("ai_draft_text") != saved_beat.get("ai_draft_text")
        )
        if draft_text_changed:
            updates["pronoun_mapping"] = ""
        supabase.table("beats").update(updates).eq("id", beat_id).execute()
        chapter_id = saved_beat["chapter_id"]
        supabase.table("chapters").update({
            "status": (
                "Draft Completed"
                if saved_chapter.get("status") == "Draft Completed"
                else "Beats Generated"
            ),
            "final_content": None,
        }).eq("id", chapter_id).execute()
        if draft_text_changed:
            project_id = saved_chapter["project_id"]
            project_result = (
                supabase.table("projects")
                .select("current_memory")
                .eq("id", project_id)
                .execute()
            )
            if not project_result.data:
                raise HTTPException(status_code=404, detail="Không tìm thấy project của beat.")
            background_tasks.add_task(
                background_update_memory,
                project_id=project_id,
                old_memory=project_result.data[0].get("current_memory") or {},
                new_text=updates["ai_draft_text"],
            )
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def background_update_memory(project_id: str, old_memory: dict, new_text: str):
    """
    Hàm này chạy ngầm sau khi trả kết quả Draft cho người dùng.
    Nó gọi AI tóm tắt văn bản mới và gộp vào bộ nhớ cũ, sau đó lưu DB.
    """
    try:
        print(f"[Memory Keeper] Đang cập nhật bộ nhớ cho project {project_id}...")
        
        project_result = (
            supabase.table("projects")
            .select("render_config")
            .eq("id", project_id)
            .single()
            .execute()
        )
        system_prompt = load_story_system_prompt(
            "memory_system.md",
            _project_literary_style(project_result.data),
        )
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

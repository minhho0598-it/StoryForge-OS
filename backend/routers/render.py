import json
import os
import subprocess
import tempfile

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException

from core.database import supabase
from core.prompt_manager import prompt_manager
from core.render_config import normalize_render_config
from schemas import (
    MetadataGenerateRequest,
    UpdateRenderConfigRequest,
    UpdateVideoMetadataRequest,
)
from services.llm_service import generate_json
from services.tts_service import fetch_tts_voices, generate_audio_file
from services.video_service import process_full_project_video

router = APIRouter()


@router.get("/api/voices")
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

@router.post("/api/projects/{project_id}/batch-render")
async def start_batch_render(project_id: str, request: dict, background_tasks: BackgroundTasks):
    # Lấy danh sách ID mà user tick chọn
    target_ids = request.get("target_chapter_ids", [])
    config = request.get("config", {})
    
    # Bắn task
    background_tasks.add_task(background_batch_render, project_id=project_id, config=config, target_chapter_ids=target_ids)
    return {"success": True}

@router.put("/api/projects/{project_id}/update-render-config")
async def update_render_config(project_id: str, request: UpdateRenderConfigRequest):
    try:
        supabase.table("projects").update({"render_config": request.render_config}).eq(
            "id", project_id
        ).execute()
        return {"success": True, "message": "Cập nhật cấu hình render thành công."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/projects/{project_id}/generate-metadata")
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

@router.put("/api/projects/{project_id}/update-video-metadata")
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

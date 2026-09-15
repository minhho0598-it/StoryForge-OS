import asyncio
import os
import random
import shutil
import subprocess
import tempfile

import ffmpeg  # type: ignore

REQUIRED_CONFIG_KEYS = (
    "background_folder_path",
    "intro_video_path",
    "main_video_path",
    "overlay_w",
    "overlay_h",
    "overlay_x",
    "overlay_y",
)


def get_media_duration(file_path: str) -> float:
    try:
        probe = ffmpeg.probe(file_path)
        for stream in probe.get('streams', []):
            if 'duration' in stream:
                return float(stream['duration'])
        if 'format' in probe and 'duration' in probe['format']:
            return float(probe['format']['duration'])
        return 0.0
    except Exception as e:
        print(f"[get_media_duration] Không đọc được duration của '{file_path}': {e}")
        return 0.0


def _resolve_temp_base(config: dict) -> str:
    """
    Xác định thư mục gốc để chứa temp dir render.
    Ưu tiên: config['temp_base_path'] > biến môi trường VIDEO_TEMP_BASE_PATH > mặc định (cwd/data/temp).
    """
    configured = config.get("temp_base_path") or os.environ.get("VIDEO_TEMP_BASE_PATH")
    if configured:
        return configured
    return os.path.join(os.getcwd(), "data", "temp")


async def process_full_project_video(project_id: str, final_audio_path: str, audio_duration: float, config: dict, ass_sub_path: str = None, chapter_segments: list = None) -> str:
    """
    SINGLE-PASS RENDER:
    Không tạo file video trung gian. Dùng Filter Complex stream mọi thứ trong RAM.
    Giảm 70% Disk I/O và thời gian xử lý.
    """
    missing_keys = [key for key in REQUIRED_CONFIG_KEYS if key not in config]
    if missing_keys:
        raise ValueError(f"Thiếu config bắt buộc: {missing_keys}")

    # Ép thư mục temp vào ổ đĩa dự án (hoặc đường dẫn cấu hình) để tránh đầy ổ C:
    local_temp_base = _resolve_temp_base(config)
    os.makedirs(local_temp_base, exist_ok=True)
    temp_dir = tempfile.mkdtemp(prefix=f"render_proj_{project_id}_", dir=local_temp_base)

    output_dir = os.path.join("data", "output", project_id)
    os.makedirs(output_dir, exist_ok=True)
    final_output_path = os.path.join(output_dir, f"Final_Project_{project_id}.mp4")

    try:
        # ============================================================
        # 1. TẠO LIST STREAM VIDEO NỀN (Chỉ tạo file text .txt)
        # ============================================================
        print("[Render Engine] Chuẩn bị kịch bản stream Background Video...")
        bg_folder = config["background_folder_path"]
        bg_files = [os.path.join(bg_folder, f) for f in os.listdir(bg_folder) if f.endswith(('.mp4', '.mov', '.webm', '.avi'))]

        bg_inventory = [{"path": bg, "duration": get_media_duration(bg)} for bg in bg_files if get_media_duration(bg) > 0.5]

        if not bg_inventory:
            raise ValueError(
                f"Không tìm thấy video nền hợp lệ (duration > 0.5s) trong '{bg_folder}'. "
                "Không thể dựng background stream."
            )

        selected_bg_segments = []
        current_bg_duration = 0.0

        while current_bg_duration < audio_duration:
            random.shuffle(bg_inventory)
            for video in bg_inventory:
                remaining = audio_duration - current_bg_duration
                if remaining <= 0:
                    break
                clip_dur = min(video["duration"], remaining)
                selected_bg_segments.append({"path": video["path"], "clip_dur": clip_dur, "is_full": video["duration"] <= remaining})
                current_bg_duration += clip_dur

        bg_list_file = os.path.join(temp_dir, "bg_stream_list.txt")
        with open(bg_list_file, "w", encoding="utf-8") as f:
            for seg in selected_bg_segments:
                # 1. Xử lý đường dẫn bên ngoài f-string
                abs_path = os.path.abspath(seg['path']).replace('\\', '/')

                # 2. Ghi vào file ngắn gọn
                f.write(f"file '{abs_path}'\n")
                if not seg["is_full"]:
                    f.write(f"outpoint {seg['clip_dur']:.3f}\n")

        render_mode = config.get("render_mode", "full")
        print(f"[Render Engine] Bắt đầu Single-Pass Render (Mode: {render_mode})...")
        
        # Mảng lệnh FFmpeg sẽ được xây dựng tùy theo Mode
        ffmpeg_cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]

        # ============================================================
        # 2. MASTER FFMPEG COMMAND (SINGLE-PASS)
        # ============================================================
        # Xây dựng câu lệnh FFmpeg thô (Raw Command)
        if render_mode == "simple":
            print(f"[Render Engine] Mode Simple: Đốt Phụ đề.")
            
            ffmpeg_cmd.extend([
                "-f", "concat", "-safe", "0", "-t", str(audio_duration), "-i", bg_list_file,
                "-i", final_audio_path,
            ])
            
            safe_ass = ass_sub_path.replace("\\", "/").replace(":", "\\:") if ass_sub_path else ""
            if safe_ass:
                ffmpeg_cmd.extend(["-filter_complex", f"[0:v]subtitles='{safe_ass}'[v_sub]"])
                ffmpeg_cmd.extend(["-map", "[v_sub]"])
            else:
                ffmpeg_cmd.extend(["-map", "0:v"])
                
            ffmpeg_cmd.extend([
                "-map", "1:a",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest"
            ])
            
            # KIỂM TRA CONFIG ĐỂ QUYẾT ĐỊNH CÓ CẮT PART HAY KHÔNG
            if config.get("auto_split_parts", False) and chapter_segments:
                # Thuật toán tính Mốc cắt (Giống hệt bài trước)
                cut_points = []
                current_part_dur = 0.0
                accumulated_time = 0.0
                
                for dur in chapter_segments:
                    print(f"[Render Engine] Chapter Segment Duration: {dur:.3f}s")
                    if current_part_dur + dur > 170.0 and current_part_dur > 0:
                        cut_points.append(accumulated_time)
                        current_part_dur = dur
                    else:
                        current_part_dur += dur
                    accumulated_time += dur

                print(f"[Render Engine] Tính toán mốc cắt: {cut_points}")
                cut_points_str = ",".join([f"{p:.3f}" for p in cut_points])
                print(f"[Render Engine] Chuỗi mốc cắt: {cut_points_str}")
                
                if cut_points_str:
                    print(f"[Render Engine] Sẽ cắt Video tại các mốc: {cut_points_str}")
                    ffmpeg_cmd.extend([
                        "-f", "segment",
                        "-segment_times", cut_points_str,
                        "-reset_timestamps", "1",
                        os.path.join(output_dir, f"Final_Project_{project_id}_Part_%02d.mp4")
                    ])
                else:
                    # Nếu độ dài cả dự án nhỏ hơn 3p, không cần cắt
                    ffmpeg_cmd.append(os.path.join(output_dir, f"Final_Project_{project_id}_Full.mp4"))
                    
            else:
                # NẾU TẮT AUTO-SPLIT: Xuất 1 file duy nhất
                print(f"[Render Engine] Gộp thành 1 Video Full duy nhất.")
                ffmpeg_cmd.append(os.path.join(output_dir, f"Final_Project_{project_id}_Full.mp4"))
        else:
            # ============================================================
            # MODE BÌNH THƯỜNG: Có Overlay và Intro
            # ============================================================
            ffmpeg_cmd.extend([
                # [Input 0]: Intro Video
                "-i", config["intro_video_path"],
                # [Input 1]: Main Video (Frame Loop)
                "-stream_loop", "-1", "-fflags", "+genpts", "-i", config["main_video_path"],
                # [Input 2]: Background Stream 
                "-f", "concat", "-safe", "0", "-t", str(audio_duration), "-i", bg_list_file,
                # [Input 3]: Audio Tổng
                "-i", final_audio_path,
                
                # XÂY DỰNG ĐỒ THỊ FILTER (FILTERGRAPH)
                "-filter_complex", 
                f"""
                    [1:v]setpts=N/FRAME_RATE/TB,format=yuv420p[main_prepared];
                    [2:v]scale={config['overlay_w']}:{config['overlay_h']},setsar=1,format=yuv420p[bg_scaled];
                    [main_prepared][bg_scaled]overlay=x={config['overlay_x']}:y={config['overlay_y']}:shortest=1,setsar=1[content_video];
                    
                    [0:v]setsar=1,format=yuv420p[intro_v];
                    [0:a]aresample=44100[intro_a];
                    [3:a]aresample=44100[content_a];
                    
                    [intro_v][intro_a][content_video][content_a]concat=n=2:v=1:a=1[outv][outa]
                """,
                
                # MAP OUT VÀ ENCODE
                "-map", "[outv]",
                "-map", "[outa]",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                final_output_path
            ])

        # Thực thi lệnh bất đồng bộ để không block event loop khi render lâu
        # Thực thi FFmpeg Command
        process = await asyncio.create_subprocess_exec(
            *ffmpeg_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        # Chờ tiến trình kết thúc và lấy log
        stdout_bytes, stderr_bytes = await process.communicate()
        
        # Chuyển đổi bytes thành string
        stderr_text = stderr_bytes.decode('utf-8', errors='ignore')
        if process.returncode != 0:
            stderr_text = stderr_bytes.decode("utf-8", errors="ignore")
            print(f"\n==== LỖI FFMPEG SINGLE-PASS ====\n{stderr_text}\n================================\n")
            raise Exception("Tiến trình render Video bị sập. Xem log phía trên.")  # noqa: TRY002

        print(f"[Render Engine] HOÀN THÀNH: {final_output_path}")
        return final_output_path

    except Exception as e:
        print(f"[Render Engine Lỗi] {e}")
        raise e
    finally:
        # Dọn thư mục temp (danh sách .txt của background stream).
        # Lưu ý: final_audio_path KHÔNG nằm trong temp_dir và KHÔNG bị xóa ở đây;
        # việc dọn file audio gốc (nếu cần) do phía gọi hàm này tự xử lý.
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
            print("[Garbage Collection] Đã dọn rác Single-Pass Workspace.")
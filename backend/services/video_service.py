import asyncio
import bisect
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


def compute_cut_points(chapter_segments: list, min_dur: float, max_dur: float) -> list:
    """
    Tính các mốc cắt (giây) sao cho mỗi phần nằm trong khoảng [min_dur, max_dur].
    Ưu tiên cắt tại ranh giới chapter (không phá vỡ nội dung). Nếu ranh giới gần nhất
    vượt quá max_dur (chapter hiện tại quá dài, hoặc gộp ranh giới tiếp theo sẽ vượt
    ngưỡng và không còn ranh giới nào khác trong tầm max_dur), cắt cứng tại
    pos + max_dur, chấp nhận cắt giữa một chapter (Hướng A).

    Phần có độ dài < min_dur CHỈ có thể xảy ra ở phần cuối cùng, trong 2 trường hợp:
      1) Chỉ có một chapter và phần thừa ra (sau các lần cắt cứng) nhỏ hơn min_dur.
      2) Có nhiều chapter và phần cuối cùng sau khi cắt nhỏ hơn min_dur.
    """
    boundaries = [0.0]
    acc = 0.0
    for dur in chapter_segments:
        acc += dur
        boundaries.append(acc)
    total_duration = boundaries[-1]

    cut_points = []
    pos = 0.0

    while pos < total_duration:
        limit = pos + max_dur

        # Ranh giới chapter lớn nhất thỏa (pos, limit]
        idx = bisect.bisect_right(boundaries, limit) - 1
        boundary = boundaries[idx]
        if boundary <= pos:
            boundary = None

        if boundary is not None and boundary >= total_duration:
            # Ranh giới xa nhất trong tầm chính là điểm kết thúc toàn bộ -> phần cuối, dừng.
            break

        if boundary is not None and (boundary - pos) >= min_dur:
            # Cắt tại ranh giới chapter, giữ nguyên nội dung chapter
            cut_points.append(boundary)
            pos = boundary
        else:
            # Không có ranh giới hợp lệ trong tầm max_dur, hoặc ranh giới gần nhất
            # cho phần quá ngắn -> cắt cứng, mượn nội dung chapter kế tiếp (hoặc
            # cắt giữa chapter quá khổ).
            cut_at = min(limit, total_duration)
            if cut_at >= total_duration:
                break
            cut_points.append(cut_at)
            pos = cut_at

    return cut_points


async def process_full_project_video(project_id: str, final_audio_path: str, audio_duration: float, config: dict, ass_sub_path: str = None, chapter_segments: list = None) -> str:
    """
    SINGLE-PASS RENDER:
    Không tạo file video trung gian. Dùng Filter Complex stream mọi thứ trong RAM.
    Giảm 70% Disk I/O và thời gian xử lý.
    """
    MIN_PART_DURATION = 60.0
    MAX_PART_DURATION = 170.0

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
                abs_path = os.path.abspath(seg['path']).replace('\\', '/')
                f.write(f"file '{abs_path}'\n")
                if not seg["is_full"]:
                    f.write(f"outpoint {seg['clip_dur']:.3f}\n")

        render_mode = config.get("render_mode", "full")
        print(f"[Render Engine] Bắt đầu Single-Pass Render (Mode: {render_mode})...")

        ffmpeg_cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]

        # ============================================================
        # 2. MASTER FFMPEG COMMAND (SINGLE-PASS)
        # ============================================================
        if render_mode == "simple":
            print(f"[Render Engine] Mode Simple: Đốt Phụ đề.")
            background_audio_path = config.get("background_audio_path", "").strip()
            use_background_audio = bool(config.get("use_background_audio", False))
            if use_background_audio and not background_audio_path:
                raise ValueError("Đã bật chèn nhạc nền nhưng chưa cấu hình file background audio")
            if use_background_audio and not os.path.isfile(background_audio_path):
                raise ValueError(f"Không tìm thấy file background audio: '{background_audio_path}'")

            ffmpeg_cmd.extend([
                "-f", "concat", "-safe", "0", "-t", str(audio_duration), "-i", bg_list_file,
                "-i", final_audio_path,
            ])
            if use_background_audio:
                ffmpeg_cmd.extend(["-stream_loop", "-1", "-i", background_audio_path])

            safe_ass = ass_sub_path.replace("\\", "/").replace(":", "\\:") if ass_sub_path else ""
            filter_parts = []
            video_label = "0:v"
            if safe_ass:
                filter_parts.append(f"[0:v]subtitles='{safe_ass}'[v_sub]")
                video_label = "[v_sub]"

            audio_label = "1:a"
            if use_background_audio:
                filter_parts.append(
                    "[1:a]aresample=44100[narration];"
                    "[2:a]aresample=44100,volume=0.45[background];"
                    "[narration][background]amix=inputs=2:duration=first:dropout_transition=2[mixed_audio]"
                )
                audio_label = "[mixed_audio]"

            if filter_parts:
                ffmpeg_cmd.extend(["-filter_complex", ";".join(filter_parts)])
            ffmpeg_cmd.extend(["-map", video_label])

            ffmpeg_cmd.extend([
                "-map", audio_label,
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest"
            ])

            # KIỂM TRA CONFIG ĐỂ QUYẾT ĐỊNH CÓ CẮT PART HAY KHÔNG
            if config.get("auto_split_parts", False) and chapter_segments:
                cut_points = compute_cut_points(chapter_segments, MIN_PART_DURATION, MAX_PART_DURATION)

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
                    ffmpeg_cmd.append(os.path.join(output_dir, f"Final_Project_{project_id}_Full.mp4"))
            else:
                print(f"[Render Engine] Gộp thành 1 Video Full duy nhất.")
                ffmpeg_cmd.append(os.path.join(output_dir, f"Final_Project_{project_id}_Full.mp4"))
        else:
            # ============================================================
            # MODE BÌNH THƯỜNG: Có Overlay và Intro
            # ============================================================
            ffmpeg_cmd.extend([
                "-i", config["intro_video_path"],
                "-stream_loop", "-1", "-fflags", "+genpts", "-i", config["main_video_path"],
                "-f", "concat", "-safe", "0", "-t", str(audio_duration), "-i", bg_list_file,
                "-i", final_audio_path,

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

                "-map", "[outv]",
                "-map", "[outa]",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                final_output_path
            ])

        process = await asyncio.create_subprocess_exec(
            *ffmpeg_cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout_bytes, stderr_bytes = await process.communicate()

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
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
            print("[Garbage Collection] Đã dọn rác Single-Pass Workspace.")
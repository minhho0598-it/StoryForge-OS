import os
import re
import subprocess
import uuid

import httpx
from core.config import settings


# Helper: Convert số giây (vd 65.5) sang chuẩn ASS timecode (0:01:05.50)
def format_ass_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int((seconds % 1) * 100) # ASS dùng centiseconds (2 chữ số)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

# Hàm đo độ dài Audio (Bê từ video_service sang)
def get_audio_duration(file_path: str) -> float:
    try:
        import ffmpeg # type: ignore
        probe = ffmpeg.probe(file_path)
        for stream in probe.get('streams', []):
            if 'duration' in stream: return float(stream['duration'])
        if 'format' in probe and 'duration' in probe['format']: return float(probe['format']['duration'])
        return 0.0
    except: return 0.0  # noqa: E722

# ==========================================
# CẤU HÌNH NHỊP THỞ (TỰ DO ĐIỀU CHỈNH)
# ==========================================
# Số mili-giây im lặng độn thêm vào sau MỖI CÂU (Dấu . ? !)
SENTENCE_PAUSE_MS = 100  
# Số mili-giây im lặng độn thêm vào sau MỖI ĐOẠN VĂN (Ký tự xuống dòng \n\n)
PARAGRAPH_PAUSE_MS = 300 
# ==========================================

def smart_split_text(text: str):
    """
    Cắt văn bản cấp độ Câu.
    Trả về list dict chứa text và cờ báo hiệu đây có phải là câu cuối của một đoạn văn hay không.
    """
    chunks = []
    
    # 1. Tách theo Đoạn văn (Để biết chỗ nào chuyển đoạn cần nghỉ lâu hơn)
    paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
    
    for p_idx, paragraph in enumerate(paragraphs):
        # 2. Tách theo các dấu kết thúc câu (. ? !)
        raw_sentences = re.split(r'(?<=[.?!])\s+', paragraph)
        sentences = [s.strip() for s in raw_sentences if s.strip()]
        
        for s_idx, sentence in enumerate(sentences):
            # Nếu là câu cuối cùng của một đoạn văn -> set cờ is_end_of_paragraph
            is_end_of_para = (s_idx == len(sentences) - 1)
            chunks.append({
                "text": sentence,
                "is_end_of_paragraph": is_end_of_para
            })
            
    return chunks


def split_text_for_subtitle(text: str, max_words_per_line: int = 6) -> list:
    """
    Cắt một câu dài thành nhiều cụm ngắn (VD: 6 chữ/cụm) để làm phụ đề.
    Trả về mảng các cụm từ.
    """
    words = text.split()
    chunks = []
    current_chunk = []
    
    for word in words:
        current_chunk.append(word)
        if len(current_chunk) >= max_words_per_line:
            chunks.append(" ".join(current_chunk))
            current_chunk = []
            
    if current_chunk:
        chunks.append(" ".join(current_chunk))
        
    return chunks


async def generate_audio_file(text: str, voice_id: str, output_folder: str, chapter_id: str) -> dict:
    """
    Trả về Dictionary chứa:
    - audio_path: Đường dẫn file wav hoàn chỉnh của chương.
    - ass_events: Danh sách các sự kiện phụ đề (Start, End, Text) để gom lại làm sub tổng sau này.
    - duration: Tổng thời lượng của chương.
    """
    if not os.path.exists(output_folder): os.makedirs(output_folder)
    
    chapter_temp_dir = os.path.join(output_folder, f"tts_chunks_{uuid.uuid4().hex[:8]}")
    os.makedirs(chapter_temp_dir, exist_ok=True)
    final_chapter_audio = os.path.join(output_folder, f"final_tts_{chapter_id}.wav")
    
    sentence_chunks = smart_split_text(text)
    processed_files = []
    
    # Mảng lưu sự kiện phụ đề của chương này (Tạm thời mốc thời gian bắt đầu từ 0)
    ass_events = []
    current_time_cursor = 0.0 
    
    timeout = httpx.Timeout(60.0, connect=30.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        for idx, chunk in enumerate(sentence_chunks):
            chunk_text = chunk["text"]
            is_eop = chunk.get("is_end_of_paragraph", False)
            
            raw_chunk_path = os.path.join(chapter_temp_dir, f"raw_{idx:03d}.wav")
            padded_chunk_path = os.path.join(chapter_temp_dir, f"pad_{idx:03d}.wav")
            
            payload = {"text": chunk_text, "voice": voice_id}
            
            try:
                # 1. Gọi API TTS
                response = await client.post(settings.TTS_API_URL, json=payload)
                response.raise_for_status()
                with open(raw_chunk_path, 'wb') as f:
                    f.write(response.content)
                
                # 2. Đo thời lượng file
                raw_duration = get_audio_duration(raw_chunk_path)
                
                # 3. Ép chuẩn và chèn Silence
                pause_ms = 600 if is_eop else 250
                pad_sec = pause_ms / 1000.0
                
                subprocess.run([
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                    "-i", raw_chunk_path,
                    "-af", f"apad=pad_dur={pad_sec}", 
                    "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le",
                    padded_chunk_path
                ], check=True, capture_output=True, text=True) # SỬA CHỖ NÀY: Thêm capture_output=True, text=True
                
                processed_files.append(padded_chunk_path)
                
                # 4. GHI NHẬN SỰ KIỆN SUBTITLE
                start_time = current_time_cursor
                end_time = current_time_cursor + raw_duration 
                
                ass_events.append({
                    "start": start_time,
                    "end": end_time,
                    "text": chunk_text
                })
                current_time_cursor += (raw_duration + pad_sec)
                
            except subprocess.CalledProcessError as e:
                # BẮT VÀ IN LỖI FFMPEG
                err_msg = e.stderr if e.stderr else "Không rõ lỗi FFmpeg"
                print(f"[CẢNH BÁO FFMPEG Padding] Câu {idx}: {err_msg}")
                # Nếu FFmpeg padding lỗi, ta thử fallback: chỉ ép chuẩn, không padding
                try:
                    subprocess.run(["ffmpeg", "-y", "-i", raw_chunk_path, "-ar", "44100", "-ac", "1", "-c:a", "pcm_s16le", padded_chunk_path], check=True, capture_output=True, text=True)
                    processed_files.append(padded_chunk_path)
                    ass_events.append({"start": current_time_cursor, "end": current_time_cursor + raw_duration, "text": chunk_text})
                    current_time_cursor += raw_duration
                except Exception as fallback_e:
                    raise Exception(f"Fallback FFmpeg cũng lỗi: {fallback_e}")

            except httpx.HTTPStatusError as e:
                print(f"[Lỗi API TTS] Server trả về mã lỗi: {e.response.status_code}")
                raise Exception(f"Lỗi API TTS: {e.response.text}")
                
            except Exception as e:
                import shutil
                shutil.rmtree(chapter_temp_dir, ignore_errors=True)
                raise Exception(f"Lỗi TTS câu {idx}: {str(e)}")

    # 5. Nối file Audio như cũ
    list_file_path = os.path.join(chapter_temp_dir, "chunk_list.txt")
    with open(list_file_path, "w", encoding="utf-8") as f:
        for filepath in processed_files:
            safe_path = os.path.abspath(filepath).replace('\\', '/')
            f.write(f"file '{safe_path}'\n")
            

    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-f", "concat", "-safe", "0",
        "-i", list_file_path,
        "-c:a", "pcm_s16le",
        final_chapter_audio
    ], check=True)

    import shutil
    shutil.rmtree(chapter_temp_dir, ignore_errors=True)

    return {
        "audio_path": final_chapter_audio,
        "ass_events": ass_events,
        "duration": current_time_cursor
    }
import json
import re
import asyncio
from openai import AsyncOpenAI
from core.config import settings

# Khởi tạo Async Client kết nối với Local Proxy
client = AsyncOpenAI(
    base_url=settings.LLM_BASE_URL,
    api_key=settings.LLM_API_KEY,
)

def extract_json_from_text(text: str) -> str:
    """
    Dùng Regex để bóc tách khối JSON ra khỏi những đoạn hội thoại thừa của AI.
    Tìm khối bắt đầu bằng { và kết thúc bằng } hoặc [ và ].
    """
    # 1. Thử tìm khối JSON Object {} hoặc Array []
    match = re.search(r'(\{.*\}|\[.*\])', text, re.DOTALL)
    
    if match:
        json_str = match.group(1)
        # Làm sạch các ký tự rác (nếu có) do markdown
        json_str = json_str.replace('```json', '').replace('```', '')
        return json_str.strip()
        
    # 2. Nếu không có dấu ngoặc nào, trả về nguyên bản (hên xui để json.loads tự bắt lỗi)
    return text.strip()

async def generate_json(system_prompt: str, user_prompt: str, max_retries: int = 3) -> dict:
    """
    Gọi AI và bóc tách JSON. Nếu bị lỗi cấu trúc, sẽ tự động retry.
    """
    last_error = None
    
    for attempt in range(max_retries):
        try:
            print(f"[LLM Service] Gọi API lần {attempt + 1}/{max_retries}...")
            
            response = await client.chat.completions.create(
                model=settings.LLM_MODEL_NAME,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.7, 
                # temperature có thể thay đổi, nếu lỗi nhiều có thể hạ xuống 0.2
            )
            
            raw_content = response.choices[0].message.content
            cleaned_content = extract_json_from_text(raw_content)
            
            # Cố gắng Parse JSON
            parsed_data = json.loads(cleaned_content)
            
            print("[LLM Service] Parse JSON thành công!")
            return parsed_data
            
        except json.JSONDecodeError as e:
            print(f"[Cảnh báo] Lỗi cấu trúc JSON ở lần thử {attempt + 1}: {e}")
            last_error = e
            
            # Đợi 1.5 giây trước khi thử lại để tránh dồn dập
            if attempt < max_retries - 1:
                await asyncio.sleep(1.5) 
                
        except Exception as e:
            # Lỗi mạng, lỗi proxy rớt... thì cũng văng ra hoặc retry tùy bạn
            print(f"[Lỗi] Kết nối LLM thất bại: {e}")
            last_error = e
            if attempt < max_retries - 1:
                await asyncio.sleep(2)
                
    # Nếu chạy hết vòng lặp mà vẫn không được thì raise lỗi
    print(f"[LLM Service] ĐÃ BỎ CUỘC sau {max_retries} lần thử.")
    raise ValueError(f"AI không trả về JSON hợp lệ sau {max_retries} lần thử. Lỗi cuối: {last_error}")


def extract_xml_tag(text: str, tag: str) -> str:
    """
    Dùng Regex để bóc tách nội dung nằm giữa các thẻ XML.
    VD: <story_text>Nội dung</story_text>
    """
    pattern = f"<{tag}>(.*?)</{tag}>"
    match = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return text.strip() # Trả về nguyên gốc nếu không tìm thấy thẻ

async def generate_text_xml(system_prompt: str, user_prompt: str, target_tag: str, max_retries: int = 2) -> str:
    """
    Gọi AI cho các tác vụ viết văn bản (Bước 5, 6).
    Yêu cầu AI bọc kết quả trong thẻ XML (target_tag) và tiến hành bóc tách.
    """
    for attempt in range(max_retries):
        try:
            print(f"[LLM Text] Đang viết văn bản... (Tag: <{target_tag}>)")
            response = await client.chat.completions.create(
                model=settings.LLM_MODEL_NAME,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.8, # Tăng sáng tạo một chút khi viết văn
            )
            
            raw_content = response.choices[0].message.content
            extracted_text = extract_xml_tag(raw_content, target_tag)
            
            return extracted_text
            
        except Exception as e:
            print(f"[Lỗi LLM Text] Thử lại... {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2)
                
    raise ValueError("Lỗi tạo văn bản từ AI.")
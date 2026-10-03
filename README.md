# 🎬 AI Story Maker & Video Renderer Studio

Hệ thống tự động hóa hoàn chỉnh (End-to-End) dành cho việc Sáng tác truyện và Sản xuất Video Ngắn (Shorts/TikTok) dựa trên công nghệ **Local LLM**, **Local TTS**, và **FFmpeg**.

Dự án áp dụng triết lý **Human-in-the-loop** (Người và máy đồng sáng tác), cho phép người dùng can thiệp vào mọi khâu từ phân rã kịch bản, chỉnh sửa văn phong, cho đến điều khiển thông số Render Video.

## 🌟 Tính năng Cốt lõi

- **Môi trường Viết Văn Chuyên Nghiệp (The Writer's Room):** Giao diện chia nhịp truyện (Beats) thông minh. AI tự động nháp từng cảnh, người dùng tự do sửa đổi và AI Editor sẽ gọt giũa lại (Polish) thành bản thảo hoàn chỉnh.
- **Story Memory Keeper:** Hệ thống AI tự động ghi nhớ diễn biến, đồ vật, vị trí của nhân vật sau mỗi cảnh viết để đảm bảo mạch truyện không bao giờ bị logic thủng (Plot hole).
- **Trình xuất Video Đa luồng (The Render Studio):** 
  - Gọi API Local Text-to-Speech với thuật toán chèn Dấu câu (Pacing) siêu tự nhiên.
  - Render Video không lưu file rác (Single-pass FFmpeg).
  - Tự động cắt (Smart Segment) video thành nhiều tập ngắn (< 3 phút) dựa trên độ dài của Chương mà không làm đứt mạch lời thoại.
  - Tự động sinh Phụ đề (Subtitle) chính xác 100% không cần dùng Whisper.
- **Youtube SEO Metadata:** AI tự động chiết xuất Tiêu đề, Hook, Mô tả và Chữ gắn lên Thumbnail.

## 🛠 Tech Stack

- **Frontend:** Next.js (App Router), React, Tailwind CSS, Shadcn UI.
- **Backend:** Python (FastAPI), AsyncIO, FFmpeg-python.
- **Database:** Supabase (PostgreSQL).
- **AI Integration:** OpenAI-compatible API (Ollama/LMStudio), Local TTS API.

## 🚀 Hướng dẫn Cài đặt (Local Development)

### 1. Chuẩn bị Cơ sở dữ liệu (Supabase)
Tạo Project trên [Supabase](https://supabase.com), vào SQL Editor và chạy các lệnh tạo bảng `projects`, `chapters`, `beats` (Tham khảo cấu trúc trong code).
Sau đó chạy `backend/migrations/001_app_settings.sql` để tạo cấu hình render mặc định dùng chung cho các project mới.

### 2. Cấu hình Backend (Python)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # (Với Windows: venv\Scripts\activate)
pip install -r requirements.txt
```
Copy file `.env.example` thành `.env` và điền thông tin Local AI & Supabase của bạn.
Khởi chạy Server:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8765
```
### 3. Cấu hình Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
```
Trên máy chạy ứng dụng, truy cập `http://localhost:3000`. Để mở từ thiết bị khác cùng mạng Wi-Fi, lấy địa chỉ IPv4 LAN của máy chạy ứng dụng rồi truy cập `http://<IP-LAN>:3000` (ví dụ `http://192.168.1.20:3000`). Frontend sẽ tự gọi backend tại cùng hostname trên cổng `8765`.

Đảm bảo macOS Firewall cho phép kết nối đến Node.js/Python. Nếu vẫn không truy cập được dù hai server đã chạy, kiểm tra router có bật AP/client isolation hoặc thiết bị đang dùng mạng guest không.

#### ⚠️ Lưu ý Hệ thống
- Hệ thống yêu cầu cài đặt sẵn `ffmpeg` trong biến môi trường của hệ điều hành.
- Phù hợp nhất để chạy trên kiến trúc Mac (Apple Silicon) hoặc PC có cấu hình khá để gánh Local LLM.

---
*Created by minhho0598-it*
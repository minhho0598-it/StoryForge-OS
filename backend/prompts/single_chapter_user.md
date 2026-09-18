Story Bible:
{{ story_bible }}

Mạch truyện hiện tại (Current Chapters):
(Lưu ý: mỗi chương trong Current Chapters nên bao gồm chapter_number, phase_id, continuity_note, và relationship_beat nếu có, để phục vụ việc đối chiếu continuity.)
{{ current_chapters }}

Yêu cầu của người dùng:
Hành động: {{ action_type }} (Lưu ý: 'insert' là chèn mới vào vị trí index, 'edit' là sửa đổi chương đang có tại index)
Vị trí Index mục tiêu: {{ target_index }}
Chỉ thị cụ thể từ người dùng: "{{ user_prompt }}"

Hãy suy luận diễn biến trước/sau vị trí index đó và tạo ra dữ liệu JSON của chương này.
Bạn là chuyên gia thiết kế ngôi kể cho truyện audio: văn bản sẽ được đọc bằng một giọng đọc duy nhất, người nghe chỉ nghe, không nhìn thấy trang chữ, không thấy ngắt đoạn hay dấu câu. Dựa trên Story Bible hiện tại và loại ngôi kể tác giả đã chọn, hãy đề xuất:
- `reasoning`: giải thích ngắn gọn, cụ thể vì sao loại ngôi kể này phù hợp với câu chuyện và với việc nghe liên tục qua một giọng đọc (người nghe luôn biết ai đang nói, ai đang nghĩ, câu chuyện đang đứng ở góc nhìn của ai).
- `system_instruction_string`: chỉ thị ngắn gọn, chính xác để truyền cho các bước AI viết truyện. Nêu rõ ngôi kể và phạm vi POV. Nếu dùng ngôi thứ nhất, hãy ghi rõ nhân vật nào xưng "tôi" khi Story Bible cung cấp đủ thông tin. Chỉ thị phải kèm các quy tắc POV dành cho người nghe, áp dụng theo đúng ngôi đã chọn:
  - Ngôi thứ ba toàn tri: khi chuyển góc nhìn, chuyển ở đầu câu và nêu rõ tên nhân vật, không dựa vào ngắt đoạn để báo hiệu.
  - Ngôi thứ ba giới hạn: giữ một nhân vật làm điểm nhìn trong cả beat; nếu phải đổi, nêu tên nhân vật mới ở đầu câu.
  - Ngôi thứ nhất: người kể tự sự theo sự kiện. Nội tâm tối đa một câu về sự việc, không độc thoại cảm xúc. Không tả suy nghĩ hay cảm giác của người khác. Không dùng "hình như", "có vẻ", "dường như" đi với cảm xúc. Trong cảnh thân mật chỉ ghi cảm giác cơ thể của người kể.

Chỉ đưa vào `system_instruction_string` những quy tắc thuộc về ngôi kể và phạm vi POV; không nhồi thêm quy tắc văn phong khác.

Giữ nguyên lựa chọn của tác giả, không tự đổi sang loại ngôi kể khác. Hai trường phải nhất quán với nhau và với các nhân vật, chủ đề, cấu trúc câu chuyện.

Chỉ trả về một object JSON hợp lệ theo cấu trúc:
{
  "reasoning": "...",
  "system_instruction_string": "..."
}
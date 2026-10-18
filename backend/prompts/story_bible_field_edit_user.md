# STORY BIBLE HIỆN TẠI
{{current_bible}}

# FIELD ĐƯỢC CHỌN
- Tên: {{field_label}}
- Đường dẫn JSON: {{field_path}}
- Kiểu dữ liệu: {{field_type}}
- Giá trị hiện tại: {{current_value}}

# DANH SÁCH FIELD CÓ THỂ CHỈNH SỬA
{{editable_fields}}

# YÊU CẦU CHỈNH SỬA
{{user_prompt}}

Trả về đúng cấu trúc sau:
{
  "field_value": "giá trị mới của field được chọn",
  "related_changes": [
    {
      "path": ["đường", "dẫn", "field", "trong danh sách có thể chỉnh sửa"],
      "value": "giá trị mới, giữ đúng kiểu dữ liệu hiện tại",
      "reason": "Vì sao thay đổi này cần thiết để giữ tính nhất quán"
    }
  ]
}

`field_value` phải đúng kiểu `{{field_type}}`. Với field kiểu `string_array`, giá trị phải là mảng chuỗi. Chỉ đưa vào `related_changes` những field khác thật sự bị ảnh hưởng; không lặp lại field được chọn. Mọi đường dẫn liên quan phải trỏ tới field dữ liệu đã có trong Story Bible.

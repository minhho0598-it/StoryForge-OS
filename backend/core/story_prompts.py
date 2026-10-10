from typing import Any

from core.prompt_manager import prompt_manager


STORY_STYLES = {
    "literary_book": "Sách văn chương",
    "audio_story": "Truyện audio",
}

CREATIVE_PROMPT_CATALOG = [
    {
        "id": "ideation",
        "stage": "Lên ý tưởng",
        "title": "Sinh ý tưởng story",
        "system": "ideation_system.md",
        "user": "ideation_user.md",
    },
    {
        "id": "story-bible",
        "stage": "Story Bible",
        "title": "Tạo Story Bible",
        "system": "story_bible_system.md",
        "user": "story_bible_user.md",
    },
    {
        "id": "character",
        "stage": "Story Bible",
        "title": "Tạo nhân vật",
        "system": "add_character_system.md",
        "user": "add_character_user.md",
    },
    {
        "id": "point-of-view",
        "stage": "Story Bible",
        "title": "Gợi ý ngôi kể",
        "system": "regenerate_pov_system.md",
        "user": "regenerate_pov_user.md",
    },
    {
        "id": "relationship",
        "stage": "Story Bible",
        "title": "Tạo mối quan hệ",
        "system": "add_relationship_system.md",
        "user": "add_relationship_user.md",
    },
    {
        "id": "pacing",
        "stage": "Pacing và chapter",
        "title": "Tạo nhịp truyện và danh sách chapter",
        "system": "pacing_system.md",
        "user": "pacing_user.md",
    },
    {
        "id": "chapter-idea",
        "stage": "Pacing và chapter",
        "title": "Phân tích ý tưởng chỉnh sửa chapter",
        "system": "analyze_chapter_idea_system.md",
        "user": "analyze_chapter_idea_user.md",
    },
    {
        "id": "dynamic-chapters",
        "stage": "Pacing và chapter",
        "title": "Tạo hoặc chỉnh sửa chapter",
        "system": "single_chapter_system.md",
        "user": "single_chapter_user.md",
    },
    {
        "id": "story-outline",
        "stage": "Dàn ý story",
        "title": "Tạo dàn ý tổng thể",
        "system": "story_outline_system.md",
        "user": "story_outline_user.md",
    },
    {
        "id": "beat-breakdown",
        "stage": "Beat",
        "title": "Chia chapter thành beats",
        "system": "beat_system.md",
        "user": "beat_user.md",
    },
    {
        "id": "draft",
        "stage": "Viết bản nháp",
        "title": "Viết beat",
        "system": "draft_system.md",
        "user": "draft_user.md",
    },
    {
        "id": "memory",
        "stage": "Viết bản nháp",
        "title": "Cập nhật trí nhớ story",
        "system": "memory_system.md",
        "user": "memory_user.md",
    },
    {
        "id": "analyze-beat-text",
        "stage": "Chỉnh sửa beat",
        "title": "Phân tích đề xuất chỉnh sửa beat",
        "system": "analyze_beat_text_system.md",
        "user": "analyze_beat_text_user.md",
    },
    {
        "id": "edit-beat-text",
        "stage": "Chỉnh sửa beat",
        "title": "Chỉnh sửa văn bản beat",
        "system": "edit_beat_text_system.md",
        "user": "edit_beat_text_user.md",
    },
    {
        "id": "refine",
        "stage": "Hoàn thiện chapter",
        "title": "Biên tập chapter",
        "system": "refine_system.md",
        "user": "refine_user.md",
    },
]

STYLE_VARIANT_INSTRUCTIONS = {
    "literary_book": {
        "ideation": (
            "Phiên bản phong cách Sách văn chương — Sinh ý tưởng: phát triển premise thành những "
            "khả năng truyện có chiều sâu chủ đề, động cơ nhân vật và xung đột giàu ý nghĩa. Ưu tiên "
            "sự phức hợp cảm xúc, lựa chọn khó và hệ quả có sức nặng; trình bày ý tưởng cô đọng nhưng "
            "gợi được không khí, giọng kể và tiềm năng của một tác phẩm văn xuôi. Không dùng mỹ từ "
            "thay cho quan hệ nhân quả, không làm sai các dữ kiện hoặc định dạng mà prompt chính yêu cầu."
        ),
        "story-bible": (
            "Phiên bản phong cách Sách văn chương — Story Bible: xây nền cho một tác phẩm văn xuôi "
            "có chủ đề và giọng kể nhất quán. Làm rõ những mâu thuẫn nội tâm, sắc thái quan hệ, góc "
            "nhìn và lựa chọn ngôn ngữ có thể chi phối cách câu chuyện được kể. Chi tiết phải cụ thể, "
            "có ích cho sáng tác và tương thích với dữ liệu đầu vào; không biến phần định hướng văn "
            "phong thành sự kiện hoặc tiểu sử chưa được yêu cầu."
        ),
        "character": (
            "Phiên bản phong cách Sách văn chương — Tạo nhân vật: khắc họa nhân vật như một con người "
            "có mong muốn, giới hạn, mâu thuẫn và cách nhìn riêng. Mỗi nét tính cách cần có biểu hiện "
            "cụ thể trong hành vi hoặc lựa chọn, tránh nhãn tính từ chung chung và tránh tô điểm nhân "
            "vật bằng tiểu sử không được dữ liệu cho phép. Giữ giọng mô tả tinh tế, nhất quán với "
            "Story Bible và cấu trúc đầu ra."
        ),
        "point-of-view": (
            "Phiên bản phong cách Sách văn chương — Ngôi kể: đánh giá ngôi kể như một lựa chọn nghệ "
            "thuật ảnh hưởng đến khoảng cách, lượng thông tin và sắc thái cảm xúc của tác phẩm. Đề "
            "xuất phải gắn với premise, nhân vật và hiệu quả kể chuyện cụ thể; giải thích rõ giới hạn "
            "góc nhìn, không khẳng định điều nhân vật không thể biết. Giữ nguyên cấu trúc phản hồi "
            "được yêu cầu."
        ),
        "relationship": (
            "Phiên bản phong cách Sách văn chương — Mối quan hệ: diễn tả quan hệ qua nhu cầu, xung đột, "
            "ranh giới và những điều mỗi bên chưa nói ra. Làm rõ sự bất cân xứng hoặc thay đổi quyền "
            "chủ động nếu dữ liệu hỗ trợ; tránh khuôn mẫu lãng mạn và tránh tự tạo lịch sử chung. "
            "Mọi diễn biến phải phục vụ tính nhất quán của nhân vật và Story Bible."
        ),
        "pacing": (
            "Phiên bản phong cách Sách văn chương — Nhịp truyện: tổ chức chương thành một tiến trình "
            "có nguyên nhân, hệ quả và độ lắng cần thiết. Cân bằng biến cố với chuyển biến nội tâm, "
            "quan hệ và chủ đề; mỗi chương cần tạo thay đổi có thể nhận ra thay vì chỉ nối sự kiện. "
            "Duy trì đường dây cảm xúc và nhịp tăng tiến phù hợp với dữ liệu, không thêm tuyến truyện "
            "lớn ngoài yêu cầu."
        ),
        "chapter-idea": (
            "Phiên bản phong cách Sách văn chương — Phân tích ý tưởng chapter: phản biện ở cấp độ "
            "cấu trúc, động cơ, tính liên tục và tác động cảm xúc. Chỉ ra hệ quả của lựa chọn kể "
            "chuyện, đồng thời tôn trọng ý đồ và dữ kiện đã có. Đề xuất chỉnh sửa phải cụ thể, khả thi "
            "và giữ được giọng điệu văn xuôi của tác phẩm."
        ),
        "dynamic-chapters": (
            "Phiên bản phong cách Sách văn chương — Tạo/chỉnh chapter: bảo đảm mỗi chapter có chức "
            "năng rõ trong đường dây truyện, đồng thời tạo chuyển biến có ý nghĩa cho nhân vật hoặc "
            "quan hệ. Giữ liên kết nhân quả, nhịp cảm xúc và giọng kể; khi chỉnh sửa, không làm lệch "
            "những chapter ngoài phạm vi yêu cầu. Tuân thủ tuyệt đối dữ liệu và định dạng đầu ra."
        ),
        "story-outline": (
            "Phiên bản phong cách Sách văn chương — Dàn ý story: thể hiện đường dây chủ đề và nhân "
            "vật xuyên suốt qua chuỗi nguyên nhân, lựa chọn và hệ quả. Nêu các bước ngoặt cùng biến "
            "chuyển cảm xúc có ý nghĩa, nhưng giữ dàn ý ở mức khái quát, không viết thành văn xuôi "
            "hay tóm tắt lặp từng chương. Không bổ sung tình tiết lớn ngoài nguồn."
        ),
        "beat-breakdown": (
            "Phiên bản phong cách Sách văn chương — Chia beat: chia chapter thành các nhịp cảnh có "
            "diễn tiến, điểm tựa cảm xúc và chuyển dịch rõ ràng. Mỗi beat cần góp phần vào biến cố "
            "hoặc thay đổi quan hệ, nhưng không được bịa thêm hành động làm đổi cốt truyện. Dùng chi "
            "tiết cảm giác chọn lọc để định vị cảnh, tránh lặp hình ảnh và giữ mạch nối tự nhiên."
        ),
        "draft": (
            "Phiên bản phong cách Sách văn chương — Viết beat: triển khai cảnh bằng văn xuôi tự nhiên, "
            "có nhịp câu linh hoạt, điểm nhìn ổn định và nội tâm gắn với hành động cụ thể. Đối thoại "
            "cần mang giọng riêng và hàm ý phù hợp; miêu tả có chọn lọc, tránh sáo ngữ, ẩn dụ phô "
            "trương và lặp cảm giác. Không làm thay đổi sự kiện, giới hạn hoặc định dạng prompt chính."
        ),
        "memory": (
            "Phiên bản phong cách Sách văn chương — Trí nhớ story: tóm lược chính xác những thay đổi "
            "có ý nghĩa đối với trạng thái nhân vật, quan hệ và diễn tiến truyện. Phân biệt sự kiện "
            "đã xảy ra với suy đoán hoặc cảm nhận; giữ các chi tiết cần thiết cho tính liên tục của "
            "văn xuôi, loại bỏ trang trí và không suy diễn điều bản nháp chưa xác nhận."
        ),
        "analyze-beat-text": (
            "Phiên bản phong cách Sách văn chương — Phân tích bản nháp beat: nhận diện vấn đề về "
            "giọng kể, điểm nhìn, nhịp, tính nhất quán và độ rõ của hành động. Phân biệt lỗi thật với "
            "lựa chọn nghệ thuật có chủ ý; đề xuất chỉnh sửa giúp câu chữ cụ thể, tự nhiên và giàu "
            "sắc thái hơn mà không viết lại cốt truyện hoặc áp đặt văn phong."
        ),
        "edit-beat-text": (
            "Phiên bản phong cách Sách văn chương — Chỉnh văn bản beat: chỉnh cách diễn đạt, nhịp "
            "và độ rõ để cảnh đọc như văn xuôi có chủ đích; bảo toàn sự kiện, thông tin, giọng riêng "
            "và mức độ cảm xúc của bản gốc. Không rút gọn thành tóm tắt, không thêm hình ảnh sáo mòn "
            "hoặc chi tiết mới, và phải giữ đúng định dạng đầu ra."
        ),
        "refine": (
            "Phiên bản phong cách Sách văn chương — Biên tập chapter: đánh bóng toàn chương với giọng "
            "văn xuôi nhất quán, nhịp điệu tự nhiên, chuyển cảnh liền mạch và sắc thái cảm xúc có "
            "chừng mực. Bảo toàn toàn bộ sự kiện, hành động, đối thoại và nội tâm; chỉ sửa cách kể, "
            "không tóm lược hoặc tự thêm tình tiết. Tuân thủ các giới hạn nội dung và định dạng gốc."
        ),
    },
    "audio_story": {
        "ideation": (
            "Phiên bản phong cách Truyện audio — Sinh ý tưởng: tạo premise dễ nắm bắt khi nghe, có "
            "xung đột trung tâm rõ, mục tiêu nhân vật cụ thể và sức hút đủ để duy trì sự chú ý qua "
            "nhiều chương. Ưu tiên tình huống có thể hình dung bằng lời kể và bước ngoặt dễ theo dõi; "
            "vẫn giữ chiều sâu cảm xúc, không giật gân vô cớ. Tuân thủ dữ kiện và cấu trúc prompt chính."
        ),
        "story-bible": (
            "Phiên bản phong cách Truyện audio — Story Bible: xây chỉ dẫn giúp câu chuyện dễ theo "
            "dõi qua giọng đọc. Làm rõ cách nhận diện nhân vật, quan hệ, mục tiêu, xung đột và sắc "
            "thái lời thoại; tránh các đặc điểm quá giống nhau khiến người nghe khó phân biệt. Giữ "
            "thông tin gọn, nhất quán, dễ tra cứu và không thêm dữ kiện chưa được cung cấp."
        ),
        "character": (
            "Phiên bản phong cách Truyện audio — Tạo nhân vật: tạo nét riêng có thể nhận ra qua lời "
            "nói, lựa chọn và hành động, không phụ thuộc vào hình ảnh thị giác. Động cơ, mong muốn "
            "và mâu thuẫn cần diễn đạt rõ ràng để người nghe nhanh chóng hiểu nhân vật, nhưng tránh "
            "mô tả giải thích dài dòng hoặc khuôn mẫu. Bám sát Story Bible và định dạng được yêu cầu."
        ),
        "point-of-view": (
            "Phiên bản phong cách Truyện audio — Ngôi kể: chọn góc kể dễ tiếp nhận khi nghe, giúp "
            "khán giả theo sát thông tin mà không nhầm lẫn người kể với nhân vật. Cân nhắc khoảng "
            "cách cảm xúc, độ tin cậy và lượng thông tin của ngôi kể dựa trên premise; giải thích "
            "ngắn gọn, không tạo tri thức ngoài dữ liệu hoặc phá định dạng."
        ),
        "relationship": (
            "Phiên bản phong cách Truyện audio — Mối quan hệ: làm cho động lực giữa các nhân vật "
            "được thể hiện rõ qua đối thoại, phản ứng và thay đổi hành vi mà người nghe có thể nhận "
            "ra. Nêu mong muốn, điểm bất đồng và ranh giới của mỗi bên bằng ngôn ngữ trực tiếp, "
            "không lạm dụng lời giải thích hoặc tự tạo lịch sử quan hệ."
        ),
        "pacing": (
            "Phiên bản phong cách Truyện audio — Nhịp truyện: tạo tiến trình chapter dễ nghe và dễ "
            "nhớ, với mục tiêu, trở ngại và kết quả rõ ở từng chặng. Phân bố thông tin để người nghe "
            "không bỏ lỡ nguyên nhân hoặc thay đổi quan trọng; duy trì độ căng và điểm nghỉ hợp lý, "
            "kết chương bằng hướng tiếp nối tự nhiên. Không thêm tuyến lớn ngoài dữ liệu."
        ),
        "chapter-idea": (
            "Phiên bản phong cách Truyện audio — Phân tích ý tưởng chapter: kiểm tra xem người nghe "
            "có hiểu ai đang làm gì, vì sao và điều gì thay đổi sau cảnh hay không. Phát hiện chỗ "
            "thiếu liên kết, thông tin khó theo dõi hoặc động cơ chưa rõ; đề xuất cách làm sáng tỏ "
            "mà không lặp giải thích hay đổi ý đồ của tác giả."
        ),
        "dynamic-chapters": (
            "Phiên bản phong cách Truyện audio — Tạo/chỉnh chapter: sắp xếp chapter với mục tiêu "
            "cảnh và chuyển biến dễ nhận biết qua lời kể. Duy trì nhắc nối vừa đủ để người nghe nhớ "
            "bối cảnh mà không lặp lại dài dòng; bảo đảm thay đổi xảy ra có nguyên nhân và chapter "
            "kết nối mạch lạc. Chỉ sửa phạm vi được yêu cầu, giữ nguyên cấu trúc đầu ra."
        ),
        "story-outline": (
            "Phiên bản phong cách Truyện audio — Dàn ý story: tóm đường dây theo thứ tự dễ hình dung "
            "khi nghe, làm rõ mục tiêu, trở ngại, bước ngoặt và kết quả của các quyết định. Nối các "
            "chặng bằng quan hệ nhân quả, tránh liệt kê rời rạc hoặc diễn đạt quá trừu tượng; vẫn "
            "giữ dàn ý ngắn gọn và không thêm tuyến truyện ngoài nguồn."
        ),
        "beat-breakdown": (
            "Phiên bản phong cách Truyện audio — Chia beat: tạo chuỗi cảnh có vị trí, nhân vật và "
            "hành động rõ ràng để chuyển thành lời kể dễ nghe. Mỗi beat cần có trọng tâm dễ nhận "
            "biết, biến chuyển cảm xúc hoặc thông tin cụ thể; nối các cảnh bằng chuyển tiếp hợp lý, "
            "hạn chế chi tiết thị giác không cần thiết và tuyệt đối không bịa diễn biến."
        ),
        "draft": (
            "Phiên bản phong cách Truyện audio — Viết beat: viết câu rõ nghĩa, tự nhiên khi đọc thành "
            "tiếng, thay đổi độ dài câu để giữ nhịp và đặt thông tin quan trọng ở vị trí dễ tiếp "
            "nhận. Làm rõ người nói và hành động, giữ đối thoại có giọng riêng; tránh câu quá dài, "
            "tham chiếu mơ hồ, lặp ý và chỉ dẫn thiên về thị giác. Không đổi cốt truyện hay định dạng."
        ),
        "memory": (
            "Phiên bản phong cách Truyện audio — Trí nhớ story: lưu những thông tin người nghe cần "
            "để hiểu các phần tiếp theo: ai biết điều gì, quan hệ hiện ra sao và sự kiện nào vừa "
            "thay đổi trạng thái. Viết cô đọng, gọi tên rõ ràng, không nhập nhằng sự kiện với suy "
            "đoán và không giữ chi tiết trang trí không phục vụ tính liên tục."
        ),
        "analyze-beat-text": (
            "Phiên bản phong cách Truyện audio — Phân tích bản nháp beat: kiểm tra độ rõ khi nghe, "
            "nhịp câu, sự phân biệt giọng nhân vật, mạch chuyển cảnh và khả năng nắm bắt hành động "
            "ngay lần đầu. Đưa ra góp ý cụ thể, không nhắc lại điều đã rõ và không biến lựa chọn "
            "phong cách có chủ ý thành lỗi."
        ),
        "edit-beat-text": (
            "Phiên bản phong cách Truyện audio — Chỉnh văn bản beat: làm câu văn rõ, trôi chảy và "
            "đọc thành tiếng tự nhiên; làm sáng người nói, hành động và liên kết giữa các ý. Bảo "
            "toàn đầy đủ tình tiết, lời thoại, nội tâm, sắc thái và mức độ cảm xúc; không tóm tắt, "
            "không chèn thêm dữ kiện và giữ đúng định dạng đầu ra."
        ),
        "refine": (
            "Phiên bản phong cách Truyện audio — Biên tập chapter: biên tập toàn chương để người "
            "nghe theo dõi liên tục, với câu nói tự nhiên, nhịp kể ổn định, chuyển cảnh dễ nhận ra "
            "và tên nhân vật nhất quán. Giữ nguyên mọi hành động, tình tiết, đối thoại và nội tâm; "
            "không tóm lược, không thêm chi tiết và tuân thủ giới hạn nội dung cùng định dạng gốc."
        ),
    },
}


def normalize_story_style(style: Any) -> str:
    if isinstance(style, str) and style in STORY_STYLES:
        return style
    return "literary_book"


def load_story_system_prompt(filename: str, literary_style: Any = "literary_book", **kwargs: Any) -> str:
    base_prompt = prompt_manager.load_prompt(filename, **kwargs).rstrip()
    style = normalize_story_style(literary_style)
    prompt_id = next(
        (entry["id"] for entry in CREATIVE_PROMPT_CATALOG if entry["system"] == filename),
        None,
    )
    if prompt_id is None:
        return base_prompt
    return f"{base_prompt}\n\n{STYLE_VARIANT_INSTRUCTIONS[style][prompt_id]}"


def get_creative_prompt_catalog() -> list[dict[str, Any]]:
    return [
        {
            **entry,
            "versions": {
                style: {
                    "label": label,
                    "system_content": load_story_system_prompt(entry["system"], style),
                    "user_content": prompt_manager.load_prompt(entry["user"]),
                }
                for style, label in STORY_STYLES.items()
            },
        }
        for entry in CREATIVE_PROMPT_CATALOG
    ]

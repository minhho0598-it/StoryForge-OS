import os

# Lấy đường dẫn gốc của project
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROMPTS_DIR = os.path.join(BASE_DIR, "prompts")

class PromptManager:
    @staticmethod
    def load_prompt(filename: str, **kwargs) -> str:
        """
        Đọc nội dung file prompt và thay thế các biến.
        Ví dụ: Trong file có {{ keywords }}, nếu truyền keywords="biển", 
        hệ thống sẽ tự động thay thế.
        """
        file_path = os.path.join(PROMPTS_DIR, filename)
        
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Không tìm thấy file prompt: {file_path}")
            
        with open(file_path, "r", encoding="utf-8") as file:
            content = file.read()
            
        # Thay thế các biến động (nếu có)
        for key, value in kwargs.items():
            # Thay thế cả 2 trường hợp: có dấu cách hoặc không có dấu cách bên trong ngoặc
            content = content.replace(f"{{{{{key}}}}}", str(value))
            content = content.replace(f"{{{{ {key} }}}}", str(value))
            
        return content

prompt_manager = PromptManager()
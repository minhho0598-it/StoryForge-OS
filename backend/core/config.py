import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:8081/v1")
    LLM_MODEL_NAME = os.getenv("LLM_MODEL_NAME", "gemini-3.5-flash-thinking")
    LLM_API_KEY = os.getenv("LLM_API_KEY", "dummy")
    
    TTS_API_URL = os.getenv("TTS_API_URL", "")
    
    SUPABASE_URL = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

settings = Settings()

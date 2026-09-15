from supabase import create_client, Client
from core.config import settings

# Khởi tạo kết nối đến Supabase
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
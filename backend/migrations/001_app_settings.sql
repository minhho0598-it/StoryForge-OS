CREATE TABLE IF NOT EXISTS public.app_settings (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (key, value)
VALUES (
    'default_render_config',
    '{
        "voice_id": "Nguyệt Nga",
        "render_mode": "full",
        "auto_split_parts": false,
        "use_background_audio": false,
        "intro_video_path": "./data/sample_assets/intro.mp4",
        "main_video_path": "./data/sample_assets/main.mp4",
        "background_folder_path": "./data/sample_assets/backgrounds",
        "background_audio_path": "",
        "overlay_x": 1110,
        "overlay_y": 10,
        "overlay_w": 601,
        "overlay_h": 1060
    }'::jsonb
)
ON CONFLICT (key) DO NOTHING;
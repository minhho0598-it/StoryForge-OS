from math import isfinite
from typing import Any, Mapping


GLOBAL_RENDER_CONFIG_KEY = "default_render_config"

DEFAULT_THUMBNAIL_CONFIG: dict[str, Any] = {
    "background_path": "",
    "character_path": "",
    "font_path": "assets/fonts/PaytoneOne-Regular.ttf",
    "genre": "general",
    "color_mode": "rules",
    "canvas_width": 1280,
    "canvas_height": 720,
    "character_box": {"x": 28, "y": 54, "width": 590, "height": 590},
    "title_box": {"x": 660, "y": 165, "width": 550, "height": 340},
    "subtitle_box": {"x": 680, "y": 530, "width": 510, "height": 100},
}

DEFAULT_RENDER_CONFIG: dict[str, Any] = {
    "literary_style": "literary_book",
    "voice_id": "Nguyệt Nga",
    "render_mode": "full",
    "auto_split_parts": False,
    "use_background_audio": False,
    "background_audio_volume": 0.45,
    "story_intro_enabled": False,
    "story_intro_position": "start",
    "story_intro_pause_ms": 1000,
    "main_video_path": "./data/sample_assets/main.mp4",
    "background_folder_path": "./data/sample_assets/backgrounds",
    "background_audio_path": "",
    "overlay_x": 1110,
    "overlay_y": 10,
    "overlay_w": 601,
    "overlay_h": 1060,
    "thumbnail": DEFAULT_THUMBNAIL_CONFIG,
}


def normalize_render_config(config: Mapping[str, Any] | None) -> dict[str, Any]:
    normalized = {**DEFAULT_RENDER_CONFIG, **(config or {})}
    normalized.pop("intro_video_path", None)
    saved_thumbnail = normalized.get("thumbnail")
    saved_thumbnail = saved_thumbnail if isinstance(saved_thumbnail, Mapping) else {}
    thumbnail = {**DEFAULT_THUMBNAIL_CONFIG, **saved_thumbnail}
    for box_key in ("character_box", "title_box", "subtitle_box"):
        saved_box = thumbnail.get(box_key)
        saved_box = saved_box if isinstance(saved_box, Mapping) else {}
        thumbnail[box_key] = {
            **DEFAULT_THUMBNAIL_CONFIG[box_key],
            **saved_box,
        }
    normalized["thumbnail"] = thumbnail
    normalized["literary_style"] = (
        normalized["literary_style"]
        if isinstance(normalized["literary_style"], str)
        and normalized["literary_style"] == "literary_book"
        else DEFAULT_RENDER_CONFIG["literary_style"]
    )
    normalized["story_intro_enabled"] = bool(normalized["story_intro_enabled"])
    normalized["render_mode"] = (
        normalized["render_mode"]
        if isinstance(normalized["render_mode"], str)
        and normalized["render_mode"] in {"full", "simple"}
        else DEFAULT_RENDER_CONFIG["render_mode"]
    )
    try:
        background_audio_volume = float(normalized["background_audio_volume"])
        normalized["background_audio_volume"] = (
            min(1.0, max(0.0, background_audio_volume))
            if isfinite(background_audio_volume)
            else DEFAULT_RENDER_CONFIG["background_audio_volume"]
        )
    except (TypeError, ValueError):
        normalized["background_audio_volume"] = DEFAULT_RENDER_CONFIG["background_audio_volume"]
    normalized["story_intro_position"] = (
        normalized["story_intro_position"]
        if normalized["story_intro_position"] in {"start", "end"}
        else DEFAULT_RENDER_CONFIG["story_intro_position"]
    )
    try:
        normalized["story_intro_pause_ms"] = max(0, int(normalized["story_intro_pause_ms"]))
    except (TypeError, ValueError):
        normalized["story_intro_pause_ms"] = DEFAULT_RENDER_CONFIG["story_intro_pause_ms"]
    return normalized


def get_global_render_config(client: Any) -> dict[str, Any]:
    response = (
        client.table("app_settings")
        .select("value")
        .eq("key", GLOBAL_RENDER_CONFIG_KEY)
        .execute()
    )
    rows = response.data or []
    saved_config = rows[0].get("value") if rows else None
    return normalize_render_config(saved_config)


def save_global_render_config(client: Any, config: Mapping[str, Any]) -> dict[str, Any]:
    normalized = normalize_render_config(config)
    client.table("app_settings").upsert(
        {"key": GLOBAL_RENDER_CONFIG_KEY, "value": normalized}, on_conflict="key"
    ).execute()
    return normalized
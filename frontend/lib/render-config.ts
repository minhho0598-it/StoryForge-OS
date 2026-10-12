export type RenderConfig = {
  literary_style: "literary_book" | "audio_story";
  voice_id: string;
  render_mode: "full" | "simple";
  auto_split_parts: boolean;
  use_background_audio: boolean;
  background_audio_volume: number;
  story_intro_enabled: boolean;
  story_intro_position: "start" | "end";
  story_intro_pause_ms: number;
  main_video_path: string;
  background_folder_path: string;
  background_audio_path: string;
  overlay_x: number;
  overlay_y: number;
  overlay_w: number;
  overlay_h: number;
};

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  literary_style: "literary_book",
  voice_id: "Nguyệt Nga",
  render_mode: "full",
  auto_split_parts: false,
  use_background_audio: false,
  background_audio_volume: 0.45,
  story_intro_enabled: false,
  story_intro_position: "start",
  story_intro_pause_ms: 1000,
  main_video_path: "./data/sample_assets/main.mp4",
  background_folder_path: "./data/sample_assets/backgrounds",
  background_audio_path: "",
  overlay_x: 1110,
  overlay_y: 10,
  overlay_w: 601,
  overlay_h: 1060,
};

type LegacyRenderConfig = Partial<RenderConfig> & { intro_video_path?: string };

export function normalizeRenderConfig(config?: LegacyRenderConfig | null): RenderConfig {
  const normalized = { ...DEFAULT_RENDER_CONFIG, ...config };
  delete normalized.intro_video_path;
  return normalized;
}
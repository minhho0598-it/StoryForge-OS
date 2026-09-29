export type RenderConfig = {
  voice_id: string;
  render_mode: "full" | "simple";
  auto_split_parts: boolean;
  use_background_audio: boolean;
  intro_video_path: string;
  main_video_path: string;
  background_folder_path: string;
  background_audio_path: string;
  overlay_x: number;
  overlay_y: number;
  overlay_w: number;
  overlay_h: number;
};

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  voice_id: "Nguyệt Nga",
  render_mode: "full",
  auto_split_parts: false,
  use_background_audio: false,
  intro_video_path: "./data/sample_assets/intro.mp4",
  main_video_path: "./data/sample_assets/main.mp4",
  background_folder_path: "./data/sample_assets/backgrounds",
  background_audio_path: "",
  overlay_x: 1110,
  overlay_y: 10,
  overlay_w: 601,
  overlay_h: 1060,
};

export function normalizeRenderConfig(config?: Partial<RenderConfig> | null): RenderConfig {
  return { ...DEFAULT_RENDER_CONFIG, ...config };
}
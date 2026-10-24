export type RenderConfig = {
  literary_style: "literary_book";
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
  thumbnail: ThumbnailConfig;
};

export type ThumbnailBoxConfig = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ThumbnailConfig = {
  background_path: string;
  character_path: string;
  font_path: string;
  genre: "general" | "romance" | "healing" | "youth" | "drama" | "mystery" | "fantasy";
  color_mode: "rules" | "ai" | "manual";
  canvas_width: number;
  canvas_height: number;
  character_box: ThumbnailBoxConfig;
  title_box: ThumbnailBoxConfig;
  subtitle_box: ThumbnailBoxConfig;
};

export const DEFAULT_THUMBNAIL_CONFIG: ThumbnailConfig = {
  background_path: "",
  character_path: "",
  font_path: "assets/fonts/PaytoneOne-Regular.ttf",
  genre: "general",
  color_mode: "rules",
  canvas_width: 1280,
  canvas_height: 720,
  character_box: { x: 28, y: 54, width: 590, height: 590 },
  title_box: { x: 660, y: 165, width: 550, height: 340 },
  subtitle_box: { x: 680, y: 530, width: 510, height: 100 },
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
  thumbnail: DEFAULT_THUMBNAIL_CONFIG,
};

type LegacyRenderConfig = Omit<Partial<RenderConfig>, "thumbnail"> & {
  thumbnail?: Partial<ThumbnailConfig> & {
    character_box?: Partial<ThumbnailBoxConfig>;
    title_box?: Partial<ThumbnailBoxConfig>;
    subtitle_box?: Partial<ThumbnailBoxConfig>;
  } | null;
  intro_video_path?: string;
};

export function normalizeRenderConfig(config?: LegacyRenderConfig | null): RenderConfig {
  const thumbnail = config?.thumbnail;
  const normalized: RenderConfig & { intro_video_path?: string } = {
    ...DEFAULT_RENDER_CONFIG,
    ...config,
    literary_style: config?.literary_style === "literary_book" ? "literary_book" : DEFAULT_RENDER_CONFIG.literary_style,
    thumbnail: {
      ...DEFAULT_THUMBNAIL_CONFIG,
      ...thumbnail,
      character_box: {
        ...DEFAULT_THUMBNAIL_CONFIG.character_box,
        ...thumbnail?.character_box,
      },
      title_box: {
        ...DEFAULT_THUMBNAIL_CONFIG.title_box,
        ...thumbnail?.title_box,
      },
      subtitle_box: {
        ...DEFAULT_THUMBNAIL_CONFIG.subtitle_box,
        ...thumbnail?.subtitle_box,
      },
    },
  };
  delete normalized.intro_video_path;
  return normalized;
}
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_RENDER_CONFIG, type RenderConfig } from "@/lib/render-config";
import { VoiceSelect } from "@/components/voice-select";
import { SlidersHorizontal } from "lucide-react";

type RenderConfigEditorProps = {
  config: RenderConfig;
  onChange: <K extends keyof RenderConfig>(key: K, value: RenderConfig[K]) => void;
  title: string;
  description: string;
  idPrefix: string;
};

export function RenderConfigEditor({
  config,
  onChange,
  title,
  description,
  idPrefix,
}: RenderConfigEditorProps) {
  const storyIntroEnabledId = `${idPrefix}-story-intro-enabled`;
  const storyIntroPauseId = `${idPrefix}-story-intro-pause`;
  const autoSplitId = `${idPrefix}-auto-split`;
  const backgroundAudioId = `${idPrefix}-use-background-audio`;
  const backgroundAudioVolumeId = `${idPrefix}-background-audio-volume`;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="border-b bg-white">
        <CardTitle className="flex items-center gap-2 text-lg">
          <SlidersHorizontal className="h-5 w-5 text-indigo-600" /> {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 bg-white p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Giọng đọc AI</Label>
            <VoiceSelect
              value={config.voice_id}
              onValueChange={(value) => onChange("voice_id", value || DEFAULT_RENDER_CONFIG.voice_id)}
            />
          </div>
          <div className="space-y-2">
            <Label>Chế độ render</Label>
            <Select
              value={config.render_mode}
              onValueChange={(value) => {
                if (value === "full" || value === "simple") onChange("render_mode", value);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Bình thường (Video chính + Overlay)</SelectItem>
                <SelectItem value="simple">Đơn giản (Nền + Audio)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-4 rounded-md border bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor={storyIntroEnabledId}>Chèn lời giới thiệu câu chuyện</Label>
              <p className="mt-1 text-xs text-slate-500">Thêm lời giới thiệu vào video khi render.</p>
            </div>
            <Switch
              id={storyIntroEnabledId}
              checked={config.story_intro_enabled}
              onCheckedChange={(value) => onChange("story_intro_enabled", value)}
            />
          </div>
          {config.story_intro_enabled && (
            <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Vị trí lời giới thiệu</Label>
                <Select
                  value={config.story_intro_position}
                  onValueChange={(value) => {
                    if (value === "start" || value === "end") onChange("story_intro_position", value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="start">Trước câu chuyện</SelectItem>
                    <SelectItem value="end">Sau câu chuyện</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={storyIntroPauseId}>Khoảng nghỉ với nội dung truyện (ms)</Label>
                <Input
                  id={storyIntroPauseId}
                  type="number"
                  min={0}
                  step={100}
                  value={config.story_intro_pause_ms}
                  onChange={(event) =>
                    onChange("story_intro_pause_ms", Math.max(0, Math.trunc(Number(event.target.value) || 0)))
                  }
                />
              </div>
            </div>
          )}
        </div>
        {config.render_mode === "simple" && (
          <div className="flex items-center justify-between rounded-md border bg-slate-50 p-4">
            <div>
              <Label htmlFor={autoSplitId}>Tự động chia nhỏ video</Label>
              <p className="mt-1 text-xs text-slate-500">Xuất thành chuỗi Shorts.</p>
            </div>
            <Switch
              id={autoSplitId}
              checked={config.auto_split_parts}
              onCheckedChange={(value) => onChange("auto_split_parts", value)}
            />
          </div>
        )}
        <Separator />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Thư mục video nền</Label>
            <Input
              value={config.background_folder_path}
              onChange={(event) => onChange("background_folder_path", event.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between rounded-md border bg-slate-50 p-3">
              <Label htmlFor={backgroundAudioId} className="font-semibold text-indigo-900">
                Chèn nhạc nền ở mode đơn giản
              </Label>
              <Switch
                id={backgroundAudioId}
                checked={config.use_background_audio}
                onCheckedChange={(value) => onChange("use_background_audio", value)}
              />
            </div>
            <Input
              value={config.background_audio_path}
              onChange={(event) => onChange("background_audio_path", event.target.value)}
              className="font-mono text-sm"
              placeholder="Nhập đường dẫn file nhạc nền"
            />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={backgroundAudioVolumeId}>Âm lượng nhạc nền</Label>
                <span className="text-sm tabular-nums text-slate-600">
                  {Math.round(config.background_audio_volume * 100)}%
                </span>
              </div>
              <input
                id={backgroundAudioVolumeId}
                type="range"
                min="0"
                max="100"
                step="1"
                value={Math.round(config.background_audio_volume * 100)}
                onChange={(event) =>
                  onChange("background_audio_volume", Number(event.target.value) / 100)
                }
                className="h-2 w-full cursor-pointer accent-indigo-600"
                aria-label="Âm lượng nhạc nền"
              />
            </div>
            <p className="text-xs text-slate-500">
              Chỉ khi bật Switch, file này mới được lặp và trộn phía sau giọng đọc.
            </p>
          </div>
          {config.render_mode === "full" && (
            <div className="space-y-2">
              <Label>File video chính</Label>
              <Input
                value={config.main_video_path}
                onChange={(event) => onChange("main_video_path", event.target.value)}
                className="font-mono text-sm"
              />
            </div>
          )}
        </div>
        {config.render_mode === "full" && (
          <>
            <Separator />
            <div>
              <Label className="mb-3 block">Tọa độ overlay</Label>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {(["overlay_x", "overlay_y", "overlay_w", "overlay_h"] as const).map((key) => (
                  <div className="space-y-2" key={key}>
                    <Label className="text-xs text-slate-500">{key.replace("overlay_", "").toUpperCase()}</Label>
                    <Input
                      type="number"
                      value={config[key]}
                      onChange={(event) => onChange(key, Number(event.target.value) || 0)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Check, Loader2, Save, Settings2, SlidersHorizontal } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { DEFAULT_RENDER_CONFIG, normalizeRenderConfig, type RenderConfig } from "@/lib/render-config";
import { VoiceSelect } from "@/components/voice-select";

export default function SettingsPage() {
  const [defaultConfig, setDefaultConfig] = useState<RenderConfig>(DEFAULT_RENDER_CONFIG);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);
  const [returnHref, setReturnHref] = useState("/");
  const renderConfig = defaultConfig;

  useEffect(() => {
    const projectId = localStorage.getItem("story-maker-last-project-id");
    setReturnHref(projectId ? `/project/${encodeURIComponent(projectId)}/overview` : "/");
  }, []);

  useEffect(() => {
    apiClient
      .get<{ render_config?: Partial<RenderConfig> }>("/api/settings/render-config")
      .then((response) => {
        if (response.render_config) setDefaultConfig(normalizeRenderConfig(response.render_config));
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Không tải được cấu hình chung."))
      .finally(() => setLoading(false));
  }, []);

  const updateRenderConfig = <K extends keyof RenderConfig>(key: K, value: RenderConfig[K]) => {
    setDefaultConfig((current) => ({ ...current, [key]: value }));
    setDefaultsSaved(false);
  };

  const saveDefaultSettings = async () => {
    setSavingDefaults(true);
    setLoadError(null);
    try {
      const response = await apiClient.put<{ render_config?: RenderConfig }>("/api/settings/render-config", {
        render_config: defaultConfig,
      });
      if (response.render_config) setDefaultConfig(normalizeRenderConfig(response.render_config));
      setDefaultsSaved(true);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Không thể lưu cấu hình chung. Hãy kiểm tra Backend và Supabase.");
    } finally {
      setSavingDefaults(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-slate-50 p-8 pb-24">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
                <Settings2 className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Cài đặt</h1>
            </div>
            <p className="mt-2 text-slate-500">Cấu hình mặc định được áp dụng cho các project mới.</p>
          </div>
          <Link href={returnHref} className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft aria-hidden="true" />
            Về Dashboard
          </Link>
        </div>

        {loadError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</div>
        )}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <SlidersHorizontal className="h-5 w-5 text-indigo-600" /> Cấu hình render chung
                </CardTitle>
                <CardDescription>
                  Làm mặc định cho các project mới. Cấu hình riêng của từng project được quản lý trong Studio.
                </CardDescription>
              </div>
              <Button onClick={saveDefaultSettings} disabled={savingDefaults} className="bg-indigo-600 hover:bg-indigo-700">
                {savingDefaults ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : defaultsSaved ? (
                  <Check className="mr-2 h-4 w-4" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {defaultsSaved ? "Đã lưu" : "Lưu cấu hình chung"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 bg-white p-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Giọng đọc AI</Label>
                <VoiceSelect
                  value={renderConfig.voice_id}
                  onValueChange={(value) => updateRenderConfig("voice_id", value || DEFAULT_RENDER_CONFIG.voice_id)}
                />
              </div>
              <div className="space-y-2">
                <Label>Chế độ render</Label>
                <Select
                  value={renderConfig.render_mode}
                  onValueChange={(value) => updateRenderConfig("render_mode", value || "full")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Bình thường (Intro + Overlay)</SelectItem>
                    <SelectItem value="simple">Đơn giản (Nền + Audio)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-4 rounded-md border bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor="default-story-intro-enabled">Chèn lời giới thiệu câu chuyện</Label>
                  <p className="mt-1 text-xs text-slate-500">Mặc định cho project mới; có thể chỉnh riêng trong Studio.</p>
                </div>
                <Switch
                  id="default-story-intro-enabled"
                  checked={renderConfig.story_intro_enabled}
                  onCheckedChange={(value) => updateRenderConfig("story_intro_enabled", value)}
                />
              </div>
              {renderConfig.story_intro_enabled && (
                <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Vị trí lời giới thiệu</Label>
                    <Select
                      value={renderConfig.story_intro_position}
                      onValueChange={(value) => value && updateRenderConfig("story_intro_position", value as "start" | "end")}
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
                    <Label htmlFor="default-story-intro-pause">Khoảng nghỉ với nội dung truyện (ms)</Label>
                    <Input
                      id="default-story-intro-pause"
                      type="number"
                      min={0}
                      step={100}
                      value={renderConfig.story_intro_pause_ms}
                      onChange={(event) => updateRenderConfig("story_intro_pause_ms", Math.max(0, Math.trunc(Number(event.target.value) || 0)))}
                    />
                  </div>
                </div>
              )}
            </div>
            {renderConfig.render_mode === "simple" && (
              <div className="flex items-center justify-between rounded-md border bg-slate-50 p-4">
                <div>
                  <Label htmlFor="auto-split">Tự động chia nhỏ video</Label>
                  <p className="mt-1 text-xs text-slate-500">Xuất thành chuỗi Shorts.</p>
                </div>
                <Switch
                  id="auto-split"
                  checked={renderConfig.auto_split_parts}
                  onCheckedChange={(value) => updateRenderConfig("auto_split_parts", value)}
                />
              </div>
            )}
            <Separator />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>Thư mục video nền</Label>
                <Input
                  value={renderConfig.background_folder_path}
                  onChange={(event) => updateRenderConfig("background_folder_path", event.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <div className="flex items-center justify-between rounded-md border bg-slate-50 p-3">
                  <Label htmlFor="use-background-audio" className="font-semibold text-indigo-900">
                    Chèn nhạc nền ở mode đơn giản
                  </Label>
                  <Switch
                    id="use-background-audio"
                    checked={renderConfig.use_background_audio}
                    onCheckedChange={(value) => updateRenderConfig("use_background_audio", value)}
                  />
                </div>
                <Input
                  value={renderConfig.background_audio_path}
                  onChange={(event) => updateRenderConfig("background_audio_path", event.target.value)}
                  className="font-mono text-sm"
                  placeholder="Nhập đường dẫn file nhạc nền"
                />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="background-audio-volume">Âm lượng nhạc nền</Label>
                    <span className="text-sm tabular-nums text-slate-600">{Math.round(renderConfig.background_audio_volume * 100)}%</span>
                  </div>
                  <input
                    id="background-audio-volume"
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round(renderConfig.background_audio_volume * 100)}
                    onChange={(event) => updateRenderConfig("background_audio_volume", Number(event.target.value) / 100)}
                    className="h-2 w-full cursor-pointer accent-indigo-600"
                    aria-label="Âm lượng nhạc nền"
                  />
                </div>
                <p className="text-xs text-slate-500">Chỉ khi bật Switch, file này mới được lặp và trộn phía sau giọng đọc.</p>
              </div>
              {renderConfig.render_mode === "full" && (
                <>
                  <div className="space-y-2">
                    <Label>File video intro</Label>
                    <Input
                      value={renderConfig.intro_video_path}
                      onChange={(event) => updateRenderConfig("intro_video_path", event.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>File video chính</Label>
                    <Input
                      value={renderConfig.main_video_path}
                      onChange={(event) => updateRenderConfig("main_video_path", event.target.value)}
                      className="font-mono text-sm"
                    />
                  </div>
                </>
              )}
            </div>
            {renderConfig.render_mode === "full" && (
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
                          value={renderConfig[key]}
                          onChange={(event) => updateRenderConfig(key, Number(event.target.value) || 0)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
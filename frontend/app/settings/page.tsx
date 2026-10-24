"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Check, Loader2, Save, Settings2 } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { DEFAULT_RENDER_CONFIG, normalizeRenderConfig, type RenderConfig, type ThumbnailBoxConfig, type ThumbnailConfig } from "@/lib/render-config";
import { RenderConfigEditor } from "@/components/render-config-editor";

export default function SettingsPage() {
  const router = useRouter();
  const [defaultConfig, setDefaultConfig] = useState<RenderConfig>(DEFAULT_RENDER_CONFIG);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);
  const renderConfig = defaultConfig;

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

  const updateThumbnailConfig = <K extends keyof ThumbnailConfig>(
    key: K,
    value: ThumbnailConfig[K],
  ) => {
    setDefaultConfig((current) => ({
      ...current,
      thumbnail: { ...current.thumbnail, [key]: value },
    }));
    setDefaultsSaved(false);
  };

  const updateThumbnailBox = (
    boxKey: "character_box" | "title_box" | "subtitle_box",
    key: keyof ThumbnailBoxConfig,
    value: number,
  ) => {
    setDefaultConfig((current) => ({
      ...current,
      thumbnail: {
        ...current.thumbnail,
        [boxKey]: { ...current.thumbnail[boxKey], [key]: value },
      },
    }));
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
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveDefaultSettings} disabled={savingDefaults} className="bg-indigo-600 hover:bg-indigo-700">
              {savingDefaults ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : defaultsSaved ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {defaultsSaved ? "Đã lưu" : "Lưu cài đặt chung"}
            </Button>
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft aria-hidden="true" />
              Trở về
            </Button>
          </div>
        </div>

        {loadError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</div>
        )}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-white">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings2 className="h-5 w-5 text-indigo-600" /> Cấu hình sáng tạo story
            </CardTitle>
            <CardDescription>
              Thiết lập phong cách mặc định cho các project mới.
            </CardDescription>
          </CardHeader>
          <CardContent className="bg-white p-6">
            <div className="max-w-md space-y-2">
              <Label>Phong cách văn chương</Label>
              <Select
                value={renderConfig.literary_style}
                onValueChange={(value) => {
                  if (value === "literary_book" || value === "audio_story") {
                    updateRenderConfig("literary_style", value);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="literary_book">Sách văn chương</SelectItem>
                  <SelectItem value="audio_story">Truyện audio</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        <RenderConfigEditor
          config={renderConfig}
          onChange={updateRenderConfig}
          title="Cấu hình render chung"
          description="Làm mặc định cho các project mới. Cấu hình riêng của từng project được quản lý trong mục Cài đặt của project."
          idPrefix="default"
        />
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-white">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings2 className="h-5 w-5 text-indigo-600" /> Cấu hình thumbnail mặc định
            </CardTitle>
            <CardDescription>
              Các giá trị này được lưu cùng render config chung và tự điền trong tab Metadata.
              Đường dẫn tài nguyên tính từ thư mục backend.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 bg-white p-6">
            <div className="grid gap-4 md:grid-cols-2">
              {([
                ["background_path", "Ảnh nền / template"],
                ["character_path", "Ảnh nhân vật"],
                ["font_path", "Font TTF/OTF"],
              ] as const).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`default-thumbnail-${key}`}>{label}</Label>
                  <input
                    id={`default-thumbnail-${key}`}
                    value={renderConfig.thumbnail[key]}
                    onChange={(event) => updateThumbnailConfig(key, event.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder={key === "font_path" ? "assets/fonts/PaytoneOne-Regular.ttf" : "assets/..."}
                  />
                </div>
              ))}
              <div className="space-y-2">
                <Label>Thể loại màu mặc định</Label>
                <Select
                  value={renderConfig.thumbnail.genre}
                  onValueChange={(value) => {
                    if (
                      value === "general" || value === "romance" || value === "healing"
                      || value === "youth" || value === "drama" || value === "mystery"
                      || value === "fantasy"
                    ) updateThumbnailConfig("genre", value);
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">Chung</SelectItem>
                    <SelectItem value="romance">Ngôn tình</SelectItem>
                    <SelectItem value="healing">Chữa lành</SelectItem>
                    <SelectItem value="youth">Tuổi trẻ</SelectItem>
                    <SelectItem value="drama">Kịch tính</SelectItem>
                    <SelectItem value="mystery">Bí ẩn</SelectItem>
                    <SelectItem value="fantasy">Kỳ ảo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Chế độ phối màu mặc định</Label>
                <Select
                  value={renderConfig.thumbnail.color_mode}
                  onValueChange={(value) => {
                    if (value === "rules" || value === "ai" || value === "manual") {
                      updateThumbnailConfig("color_mode", value);
                    }
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rules">Theo quy tắc</SelectItem>
                    <SelectItem value="ai">AI</SelectItem>
                    <SelectItem value="manual">Thủ công</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {([
                ["canvas_width", "Canvas rộng"],
                ["canvas_height", "Canvas cao"],
              ] as const).map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`default-thumbnail-${key}`}>{label}</Label>
                  <input
                    id={`default-thumbnail-${key}`}
                    type="number"
                    min={1}
                    value={renderConfig.thumbnail[key]}
                    onChange={(event) => updateThumbnailConfig(key, Math.max(1, Number(event.target.value) || 1))}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              ))}
            </div>
            {([
              ["character_box", "Vị trí và kích thước ảnh nhân vật"],
              ["title_box", "Vị trí và kích thước tiêu đề"],
              ["subtitle_box", "Vị trí và kích thước phụ đề"],
            ] as const).map(([boxKey, title]) => (
              <div key={boxKey} className="space-y-3 rounded-md border bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
                <div className="grid gap-3 sm:grid-cols-4">
                  {([
                    ["x", "X"],
                    ["y", "Y"],
                    ["width", "Rộng"],
                    ["height", "Cao"],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`default-thumbnail-${boxKey}-${key}`}>{label}</Label>
                      <input
                        id={`default-thumbnail-${boxKey}-${key}`}
                        type="number"
                        min={key === "x" || key === "y" ? 0 : 1}
                        value={renderConfig.thumbnail[boxKey][key]}
                        onChange={(event) => {
                          const minimum = key === "x" || key === "y" ? 0 : 1;
                          updateThumbnailBox(boxKey, key, Math.max(minimum, Number(event.target.value) || minimum));
                        }}
                        className="h-9 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, Save, Settings2, SlidersHorizontal, Volume2 } from "lucide-react";
import { apiClient, ApiError } from "@/lib/api-client";
import { useFrontendConfig } from "@/contexts/frontend-config-context";
import type { FrontendConfig } from "@/lib/frontend-config";

type RenderConfig = {
  voice_id: string;
  render_mode: string;
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

const defaultRenderConfig: RenderConfig = {
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

export default function SettingsPage() {
  const params = useParams();
  const projectId = params.id as string;

  // Config frontend dùng chung toàn app — đọc từ context, chỉ persist khi bấm "Lưu thay đổi".
  const { config: savedFrontendConfig, saveConfig: saveFrontendConfig } = useFrontendConfig();
  const [frontendConfig, setFrontendConfigDraft] = useState<FrontendConfig>(savedFrontendConfig);

  const [renderConfig, setRenderConfig] = useState<RenderConfig>(defaultRenderConfig);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingRender, setSavingRender] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [frontendSaved, setFrontendSaved] = useState(false);
  const [renderSaved, setRenderSaved] = useState(false);

  // Nếu config được đổi từ nơi khác (ví dụ trang khác cũng có ô backend_url), đồng bộ lại draft.
  useEffect(() => {
    setFrontendConfigDraft(savedFrontendConfig);
  }, [savedFrontendConfig]);

  useEffect(() => {
    apiClient
      .get<{ render_config?: RenderConfig }>(`/api/projects/${projectId}`)
      .then((response) => {
        if (response.data?.render_config) {
          setRenderConfig({ ...defaultRenderConfig, ...response.data.render_config });
        }
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Không tải được cấu hình dự án."))
      .finally(() => setLoading(false));
  }, [projectId]);

  const updateRenderConfig = <K extends keyof RenderConfig>(key: K, value: RenderConfig[K]) => {
    setRenderConfig((current) => ({ ...current, [key]: value }));
    setRenderSaved(false);
  };

  const updateFrontendConfig = <K extends keyof FrontendConfig>(key: K, value: FrontendConfig[K]) => {
    setFrontendConfigDraft((current) => ({ ...current, [key]: value }));
    setFrontendSaved(false);
  };

  const saveFrontendSettings = () => {
    saveFrontendConfig(frontendConfig);
    setFrontendSaved(true);
  };

  const saveRenderSettings = async () => {
    setSavingRender(true);
    setSaveError(null);
    try {
      await apiClient.put(`/api/projects/${projectId}/update-render-config`, { render_config: renderConfig });
      setRenderSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof ApiError ? err.message : "Không thể lưu cấu hình. Hãy kiểm tra Backend đang chạy."
      );
    } finally {
      setSavingRender(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8 pb-24">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
                <Settings2 className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Cài đặt</h1>
            </div>
            <p className="mt-2 text-slate-500">Quản lý cấu hình frontend và profile xuất video của dự án.</p>
          </div>
        </div>

        {loadError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</div>
        )}
        {saveError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</div>
        )}

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-white">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <SlidersHorizontal className="h-5 w-5 text-indigo-600" /> Frontend
                </CardTitle>
                <CardDescription>Các tùy chọn được lưu riêng trên trình duyệt này.</CardDescription>
              </div>
              <Button onClick={saveFrontendSettings} variant="outline">
                {frontendSaved ? <Check className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                {frontendSaved ? "Đã lưu" : "Lưu"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 bg-white p-6 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="backend-url">Địa chỉ Backend API</Label>
              <Input
                id="backend-url"
                value={frontendConfig.backend_url}
                onChange={(event) => updateFrontendConfig("backend_url", event.target.value)}
                className="font-mono"
              />
              <p className="text-xs text-slate-500">Mặc định: http://localhost:8765</p>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border p-4">
              <div>
                <Label htmlFor="auto-refresh">Tự động cập nhật tiến độ</Label>
                <p className="mt-1 text-xs text-slate-500">Theo dõi trạng thái render trong Studio.</p>
              </div>
              <Switch
                id="auto-refresh"
                checked={frontendConfig.auto_refresh}
                onCheckedChange={(value) => updateFrontendConfig("auto_refresh", value)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border p-4">
              <div>
                <Label htmlFor="confirm-render">Xác nhận trước khi render</Label>
                <p className="mt-1 text-xs text-slate-500">Giảm thao tác nhầm khi xuất video.</p>
              </div>
              <Switch
                id="confirm-render"
                checked={frontendConfig.confirm_render}
                onCheckedChange={(value) => updateFrontendConfig("confirm_render", value)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border p-4 md:col-span-2">
              <div>
                <Label htmlFor="compact-navigation">Điều hướng thu gọn</Label>
                <p className="mt-1 text-xs text-slate-500">Dành thêm không gian cho nội dung làm việc.</p>
              </div>
              <Switch
                id="compact-navigation"
                checked={frontendConfig.compact_navigation}
                onCheckedChange={(value) => updateFrontendConfig("compact_navigation", value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Volume2 className="h-5 w-5 text-amber-600" /> Profile âm thanh & render
                </CardTitle>
                <CardDescription>Được lưu cùng project và dùng cho các lần render tiếp theo.</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary">Project render config</Badge>
                <Button onClick={saveRenderSettings} disabled={savingRender} className="bg-indigo-600 hover:bg-indigo-700">
                  {savingRender ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : renderSaved ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {renderSaved ? "Đã lưu" : "Lưu"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 bg-white p-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Giọng đọc AI</Label>
                <Select
                  value={renderConfig.voice_id}
                  onValueChange={(value) => updateRenderConfig("voice_id", value || defaultRenderConfig.voice_id)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Nguyệt Nga">Nguyệt Nga (Nữ - Truyện cảm)</SelectItem>
                    <SelectItem value="Bảo Hoàng">Bảo Hoàng (Nam - Trầm ấm)</SelectItem>
                    <SelectItem value="Ngọc Huyền">Ngọc Huyền (Nữ - Tươi sáng)</SelectItem>
                  </SelectContent>
                </Select>
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
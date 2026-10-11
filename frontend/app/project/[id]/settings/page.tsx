"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RenderConfigEditor } from "@/components/render-config-editor";
import { apiClient, ApiError } from "@/lib/api-client";
import { DEFAULT_RENDER_CONFIG, normalizeRenderConfig, type RenderConfig } from "@/lib/render-config";

type ProjectSettingsData = {
  title: string;
  render_config?: Partial<RenderConfig> | null;
};

export default function ProjectSettingsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;
  const [projectTitle, setProjectTitle] = useState("");
  const [config, setConfig] = useState<RenderConfig>(DEFAULT_RENDER_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    apiClient
      .get<ProjectSettingsData>(`/api/projects/${encodeURIComponent(projectId)}`)
      .then((response) => {
        if (!response.success || !response.data) {
          throw new ApiError("Backend không trả về thông tin project.");
        }
        if (active) {
          setProjectTitle(response.data.title);
          setConfig(normalizeRenderConfig(response.data.render_config));
        }
      })
      .catch((err) => {
        if (active) {
          setLoadError(err instanceof ApiError ? err.message : "Không tải được cài đặt project.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  const updateRenderConfig = <K extends keyof RenderConfig>(key: K, value: RenderConfig[K]) => {
    setConfig((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setSaveError(null);
  };

  const saveSettings = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await apiClient.put(
        `/api/projects/${encodeURIComponent(projectId)}/update-render-config`,
        { render_config: config },
      );
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Không thể lưu cài đặt project.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-8">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</div>
        <Button variant="outline" onClick={() => router.push(`/project/${encodeURIComponent(projectId)}/overview`)}>
          <ArrowLeft aria-hidden="true" />
          Về project
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-y-auto bg-slate-50 p-8 pb-24">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
                <Settings2 className="h-6 w-6" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">Cài đặt project</h1>
            </div>
            <p className="mt-2 text-slate-500">
              {projectTitle ? `Các thay đổi chỉ áp dụng cho ${projectTitle}.` : "Các thay đổi chỉ áp dụng cho project này."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={saveSettings}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : saved ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saved ? "Đã lưu" : "Lưu cài đặt project"}
            </Button>
            <Button variant="outline" onClick={() => router.push(`/project/${encodeURIComponent(projectId)}/overview`)}>
              <ArrowLeft aria-hidden="true" />
              Về project
            </Button>
          </div>
        </div>

        {saveError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{saveError}</div>
        )}

        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-white">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings2 className="h-5 w-5 text-indigo-600" /> Phong cách sáng tạo
            </CardTitle>
            <CardDescription>Chọn phong cách được sử dụng khi tạo nội dung cho project này.</CardDescription>
          </CardHeader>
          <CardContent className="bg-white p-6">
            <div className="max-w-md space-y-2">
              <Label>Phong cách văn chương</Label>
              <Select
                value={config.literary_style}
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
          config={config}
          onChange={updateRenderConfig}
          title="Cấu hình render của project"
          description="Các tuỳ chọn này được lưu riêng và dùng khi render project này."
          idPrefix="project"
        />
      </div>
    </div>
  );
}

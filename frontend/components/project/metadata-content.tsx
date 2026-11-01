"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Wand2, Save, Hash, Share2, Smartphone, Copy, Check, ImagePlus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";
import { getFrontendConfig } from "@/lib/frontend-config";
import {
  DEFAULT_THUMBNAIL_CONFIG,
  normalizeRenderConfig,
  type ThumbnailBoxConfig,
  type ThumbnailConfig,
} from "@/lib/render-config";

type ThumbnailRenderResponse = {
  success: boolean;
  job_id: string;
  status: "pass" | "needs_review";
  render: {
    font_name: string;
  };
  warnings: string[];
  files: {
    image: string;
    svg: string;
    qa: string;
  };
};

type VideoMetadata = {
  title: string;
  hook: string;
  overlay: string;
  description: string;
  type: string;
  hashtag: string;
  thumbnail_prompt: string;
  story_intro: string;
};

export default function MetadataContent() {
  const params = useParams();
  const projectId = params.id as string;

  const [metadata, setMetadata] = useState<VideoMetadata>({
    title: "", hook: "", overlay: "", description: "", type: "", hashtag: "", thumbnail_prompt: "", story_intro: ""
  });
  const [selectedTone, setSelectedTone] = useState("Kịch tính / Giật tít");
  const [aiOptions, setAiOptions] = useState<Record<string, string[]>>({});
  const [loadingMeta, setLoadingMeta] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [thumbnailConfig, setThumbnailConfig] = useState<ThumbnailConfig>(DEFAULT_THUMBNAIL_CONFIG);
  const [thumbnailTitle, setThumbnailTitle] = useState("");
  const [thumbnailSubtitle, setThumbnailSubtitle] = useState("");
  const [isRenderingThumbnail, setIsRenderingThumbnail] = useState(false);
  const [thumbnailError, setThumbnailError] = useState("");
  const [thumbnailResult, setThumbnailResult] = useState<{
    imageUrl: string;
    svgUrl: string;
    qaUrl: string;
    status: ThumbnailRenderResponse["status"];
    fontName: string;
    warnings: string[];
    settingsFingerprint: string;
  } | null>(null);
  
  // Trạng thái lưu field nào vừa được copy
  const [copiedField, setCopiedField] = useState("");

  useEffect(() => {
    apiClient.get<{ video_metadata?: Partial<VideoMetadata> }>(`/api/projects/${projectId}`)
      .then(data => {
        if (data.success) {
          if (data.data.video_metadata) {
            const videoMetadata = data.data.video_metadata;
            setMetadata(prev => ({...prev, ...videoMetadata}));
          }
        }
      });
  }, [projectId]);

  useEffect(() => {
    apiClient
      .get<{ render_config?: Parameters<typeof normalizeRenderConfig>[0] }>("/api/settings/render-config")
      .then(response => {
        if (response.render_config) {
          setThumbnailConfig(normalizeRenderConfig(response.render_config).thumbnail);
        }
      })
      .catch(error => {
        setThumbnailError(
          error instanceof Error
            ? `Không tải được cấu hình thumbnail mặc định: ${error.message}`
            : "Không tải được cấu hình thumbnail mặc định.",
        );
      });
  }, []);

  const effectiveThumbnailTitle =
    thumbnailTitle.trim() || metadata.overlay.trim() || metadata.title.trim();
  const effectiveThumbnailSubtitle = thumbnailSubtitle.trim() || metadata.hook.trim();
  const safeProjectId = projectId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60);
  const thumbnailPayload = {
    job_id: `thumbnail_${safeProjectId}`,
    canvas: {
      width: thumbnailConfig.canvas_width,
      height: thumbnailConfig.canvas_height,
    },
    background: thumbnailConfig.background_path.trim(),
    character: {
      path: thumbnailConfig.character_path.trim(),
      box: thumbnailConfig.character_box,
    },
    content: {
      title: effectiveThumbnailTitle,
      subtitle: effectiveThumbnailSubtitle,
    },
    style: {
      genre: thumbnailConfig.genre,
      color_mode: thumbnailConfig.color_mode,
      font_path: thumbnailConfig.font_path.trim() || null,
      title_box: thumbnailConfig.title_box,
      subtitle_box: thumbnailConfig.subtitle_box,
    },
    output: {
      width: thumbnailConfig.canvas_width,
      height: thumbnailConfig.canvas_height,
      format: "png",
    },
  };
  const thumbnailSettingsFingerprint = JSON.stringify(thumbnailPayload);
  const isThumbnailPreviewStale = Boolean(
    thumbnailResult
    && thumbnailResult.settingsFingerprint !== thumbnailSettingsFingerprint
  );

  const generateMetadataItem = async (type: string) => {
    setLoadingMeta(prev => ({ ...prev, [type]: true }));
    setAiOptions(prev => ({ ...prev, [type]: [] })); 
    
    try {
      const data = await apiClient.post<string[]>(`/api/projects/${projectId}/generate-metadata`, { target_type: type, tone: selectedTone });
      
      if (data.success && data.data.length > 0) {
        if (['title', 'hook', 'overlay'].includes(type)) {
          setAiOptions(prev => ({ ...prev, [type]: data.data }));
        } else {
          setMetadata(prev => ({ ...prev, [type]: data.data[0] }));
        }
      }
    } catch {
      alert("Lỗi kết nối Backend.");
    } finally {
      setLoadingMeta(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleSaveMetadata = async () => {
    setIsSaving(true);
    try {
      await apiClient.put(`/api/projects/${projectId}/update-video-metadata`, { video_metadata: metadata });
      alert("Đã lưu Metadata thành công!");
    } catch {
      alert("Lỗi khi lưu dữ liệu.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRenderThumbnail = async () => {
    setThumbnailError("");
    setThumbnailResult(null);
    if (!thumbnailConfig.background_path.trim() || !thumbnailConfig.character_path.trim()) {
      setThumbnailError("Vui lòng nhập đường dẫn ảnh nền và ảnh nhân vật có sẵn trong backend.");
      return;
    }
    if (!effectiveThumbnailTitle) {
      setThumbnailError("Vui lòng nhập tiêu đề thumbnail.");
      return;
    }

    setIsRenderingThumbnail(true);
    try {
      const response = await apiClient.post<ThumbnailRenderResponse>(
        "/api/thumbnails/render",
        thumbnailPayload,
      );
      const files = response.files;
      const render = response.render;
      if (
        !files
        || typeof files !== "object"
        || !("image" in files)
        || !("svg" in files)
        || !("qa" in files)
        || typeof files.image !== "string"
        || typeof files.svg !== "string"
        || typeof files.qa !== "string"
        || !render
        || typeof render !== "object"
        || !("font_name" in render)
        || typeof render.font_name !== "string"
        || (response.status !== "pass" && response.status !== "needs_review")
      ) {
        throw new Error("Backend trả về kết quả thumbnail không hợp lệ.");
      }
      const backendUrl = getFrontendConfig().backend_url.replace(/\/+$/, "");
      const renderVersion = Date.now();
      setThumbnailResult({
        imageUrl: `${backendUrl}${files.image}?v=${renderVersion}`,
        svgUrl: `${backendUrl}${files.svg}?v=${renderVersion}`,
        qaUrl: `${backendUrl}${files.qa}?v=${renderVersion}`,
        status: response.status,
        fontName: render.font_name,
        warnings: Array.isArray(response.warnings)
          ? response.warnings.filter((warning): warning is string => typeof warning === "string")
          : [],
        settingsFingerprint: thumbnailSettingsFingerprint,
      });
    } catch (error) {
      setThumbnailError(
        error instanceof Error ? error.message : "Không thể tạo thumbnail. Vui lòng kiểm tra cấu hình backend."
      );
    } finally {
      setIsRenderingThumbnail(false);
    }
  };

  const updateThumbnailConfig = <K extends keyof ThumbnailConfig>(
    key: K,
    value: ThumbnailConfig[K],
  ) => {
    setThumbnailConfig(current => ({ ...current, [key]: value }));
  };

  const updateThumbnailBox = (
    boxKey: "character_box" | "title_box" | "subtitle_box",
    key: keyof ThumbnailBoxConfig,
    value: number,
  ) => {
    setThumbnailConfig(current => ({
      ...current,
      [boxKey]: { ...current[boxKey], [key]: value },
    }));
  };

  // HÀM: Copy từng field riêng lẻ
  const copyToClipboard = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(""), 2000);
  };

  const renderCharCount = (text: string, maxLimit: number, warnLimit: number) => {
    const len = (text || "").length;
    let color = "text-slate-400";
    if (len > warnLimit) color = "text-amber-500 font-semibold";
    if (len > maxLimit) color = "text-red-500 font-bold";
    return <span className={`text-[10px] ${color}`}>{len} / {maxLimit}</span>;
  };

  const renderAiOptions = (type: string) => {
    if (!aiOptions[type] || aiOptions[type].length === 0) return null;
    return (
      <div className="flex flex-col gap-2 mt-2 bg-indigo-50 p-3 rounded-md border border-indigo-100">
        <span className="text-xs font-semibold text-indigo-800">Chọn 1 phương án AI gợi ý:</span>
        {aiOptions[type].map((opt, idx) => (
          <div 
            key={idx} 
            className="text-sm p-2 bg-white border border-indigo-200 rounded cursor-pointer hover:border-indigo-500 hover:shadow-sm transition-all"
            onClick={() => {
              setMetadata(prev => ({ ...prev, [type]: opt }));
              setAiOptions(prev => ({ ...prev, [type]: [] })); 
            }}
          >
            {opt}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8 pb-24">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Share2 className="h-7 w-7 text-indigo-600" /> Xuất Bản & SEO
            </h1>
            <p className="text-slate-500 mt-1">Đóng gói nội dung, copy nhanh lên Tiktok/Shorts.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Button onClick={handleSaveMetadata} disabled={isSaving} className="bg-indigo-600 hover:bg-indigo-700">
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Save className="mr-2 h-4 w-4"/>} Lưu Metadata
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <div className="lg:col-span-2 space-y-6">
            
            <Card className="border-indigo-200 bg-indigo-50/50 shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <Label className="font-bold text-indigo-900 flex-shrink-0">Giọng điệu AI Sinh text (Tone):</Label>
                <Select
                  value={selectedTone}
                  onValueChange={(value) => value !== null && setSelectedTone(value)}
                >
                  <SelectTrigger className="bg-white border-indigo-200 w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Kịch tính / Giật tít">🎣 Kịch tính / Giật tít</SelectItem>
                    <SelectItem value="Cảm xúc / So deep">🎭 Cảm xúc / Chạm đáy</SelectItem>
                    <SelectItem value="Hài hước / Gây tò mò">🤪 Hài hước / Gây tò mò</SelectItem>
                    <SelectItem value="Cân bằng / Khách quan">⚖️ Cân bằng / Tự nhiên</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200">
              <CardHeader className="bg-white border-b pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Hash className="h-5 w-5 text-indigo-500" /> Thông tin Đăng tải Video
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6 bg-white">
                
                <div className="space-y-1">
                  <div className="flex justify-between items-end">
                    <Label className="font-bold text-slate-700">1. Tên truyện chính thức</Label>
                    <div className="flex items-center gap-2">
                      {renderCharCount(metadata.title, 65, 55)}
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(metadata.title, 'title')} className="h-7 px-2 text-slate-500 hover:text-slate-900">
                        {copiedField === 'title' ? <Check className="h-4 w-4 text-green-600"/> : <Copy className="h-4 w-4"/>}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => generateMetadataItem('title')} disabled={loadingMeta.title} className="h-7 text-xs text-indigo-600">
                        {loadingMeta.title ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Wand2 className="h-3 w-3 mr-1"/>} AI Tạo 3 Mẫu
                      </Button>
                    </div>
                  </div>
                  <Input value={metadata.title} onChange={e => setMetadata({...metadata, title: e.target.value})} className="font-medium text-lg pr-10" placeholder="Nhập tên truyện..." />
                  {renderAiOptions('title')}
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-end">
                    <Label className="font-bold text-slate-700">2. Câu Hook / Caption</Label>
                    <div className="flex items-center gap-2">
                      {renderCharCount(metadata.hook, 65, 50)}
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(metadata.hook, 'hook')} className="h-7 px-2 text-slate-500 hover:text-slate-900">
                        {copiedField === 'hook' ? <Check className="h-4 w-4 text-green-600"/> : <Copy className="h-4 w-4"/>}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => generateMetadataItem('hook')} disabled={loadingMeta.hook} className="h-7 text-xs text-indigo-600">
                        {loadingMeta.hook ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Wand2 className="h-3 w-3 mr-1"/>} AI Tạo 3 Mẫu
                      </Button>
                    </div>
                  </div>
                  <Input value={metadata.hook} onChange={e => setMetadata({...metadata, hook: e.target.value})} className="font-medium pr-10" placeholder="Câu giật tít để người xem nán lại..." />
                  {renderAiOptions('hook')}
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-end">
                    <Label className="font-bold text-slate-700">3. Chữ Overlay (Chữ to giữa màn hình)</Label>
                    <div className="flex items-center gap-2">
                      {renderCharCount(metadata.overlay, 60, 40)}
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(metadata.overlay, 'overlay')} className="h-7 px-2 text-slate-500 hover:text-slate-900">
                        {copiedField === 'overlay' ? <Check className="h-4 w-4 text-green-600"/> : <Copy className="h-4 w-4"/>}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => generateMetadataItem('overlay')} disabled={loadingMeta.overlay} className="h-7 text-xs text-indigo-600">
                        {loadingMeta.overlay ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Wand2 className="h-3 w-3 mr-1"/>} AI Tạo 3 Mẫu
                      </Button>
                    </div>
                  </div>
                  <Input value={metadata.overlay} onChange={e => setMetadata({...metadata, overlay: e.target.value})} className="font-medium text-amber-600 pr-10" placeholder="Câu thả thính kích thích tò mò..." />
                  {renderAiOptions('overlay')}
                </div>

                <Separator />

                <div className="space-y-1">
                  <div className="flex justify-between items-end">
                    <Label className="font-bold text-slate-700">4. Thể loại</Label>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(metadata.type, 'type')} className="h-7 px-2 text-slate-500 hover:text-slate-900">
                        {copiedField === 'type' ? <Check className="h-4 w-4 text-green-600"/> : <Copy className="h-4 w-4"/>}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => generateMetadataItem('type')} disabled={loadingMeta.type} className="h-7 text-xs text-indigo-600 border-none">
                        {loadingMeta.type ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Wand2 className="h-3 w-3 mr-1"/>} Tự động điền
                      </Button>
                    </div>
                  </div>
                  <Input value={metadata.type} onChange={e => setMetadata({...metadata, type: e.target.value})} className="font-medium text-blue-600 pr-10" placeholder="Truyện tâm linh - kinh dị, Ngôn tình,..." />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-end">
                    <Label className="font-bold text-slate-700">5. Hashtags</Label>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(metadata.hashtag, 'hashtag')} className="h-7 px-2 text-slate-500 hover:text-slate-900">
                        {copiedField === 'hashtag' ? <Check className="h-4 w-4 text-green-600"/> : <Copy className="h-4 w-4"/>}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => generateMetadataItem('hashtag')} disabled={loadingMeta.hashtag} className="h-7 text-xs text-indigo-600 border-none">
                        {loadingMeta.hashtag ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Wand2 className="h-3 w-3 mr-1"/>} Tự động điền
                      </Button>
                    </div>
                  </div>
                  <Input value={metadata.hashtag} onChange={e => setMetadata({...metadata, hashtag: e.target.value})} className="font-medium text-blue-600 pr-10" placeholder="#truyenaudio #ngontinh..." />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-end">
                    <Label className="font-bold text-slate-700">6. Mô tả chi tiết (Description)</Label>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => copyToClipboard(metadata.description, 'description')} className="h-7 px-2 text-slate-500 hover:text-slate-900">
                        {copiedField === 'description' ? <Check className="h-4 w-4 text-green-600"/> : <Copy className="h-4 w-4"/>}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => generateMetadataItem('description')} disabled={loadingMeta.description} className="h-7 text-xs text-indigo-600 border-none">
                        {loadingMeta.description ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Wand2 className="h-3 w-3 mr-1"/>} Tự động viết
                      </Button>
                    </div>
                  </div>
                  <Textarea value={metadata.description} onChange={e => setMetadata({...metadata, description: e.target.value})} className="h-28 resize-none pr-10" placeholder="Tóm tắt nội dung không spoil..." />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200">
              <CardHeader className="bg-slate-50 border-b pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
                  <Wand2 className="h-4 w-4" /> Lời giới thiệu câu chuyện
                </CardTitle>
                <CardDescription>Đoạn này sẽ được đọc bằng giọng TTS khi bật trong Studio.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 bg-white space-y-3">
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => generateMetadataItem('story_intro')} disabled={loadingMeta.story_intro} className="text-xs text-indigo-600">
                    {loadingMeta.story_intro ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Wand2 className="h-3 w-3 mr-1"/>} Tạo lời giới thiệu
                  </Button>
                </div>
                <Textarea
                  value={metadata.story_intro || ""}
                  onChange={e => setMetadata({...metadata, story_intro: e.target.value})}
                  className="min-h-28 resize-y"
                  placeholder="Viết hoặc tạo một đoạn giới thiệu ngắn cho câu chuyện..."
                />
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200">
              <CardHeader className="bg-slate-50 border-b pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-slate-700">
                  <ImagePlus className="h-4 w-4" /> Prompt Vẽ Thumbnail
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 bg-white space-y-3">
                <div className="flex justify-between items-center">
                  <p className="text-xs text-slate-500">Dùng AI sinh prompt tiếng Anh mô tả bối cảnh đẹp nhất để vẽ ảnh.</p>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(metadata.thumbnail_prompt, 'thumbnail')} className="h-7 px-2 text-slate-500 hover:text-slate-900">
                      {copiedField === 'thumbnail' ? <Check className="h-4 w-4 text-green-600"/> : <Copy className="h-4 w-4"/>}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => generateMetadataItem('thumbnail_prompt')} disabled={loadingMeta.thumbnail_prompt} className="h-7 text-xs">
                      {loadingMeta.thumbnail_prompt ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Wand2 className="h-3 w-3 mr-1"/>} Sinh Prompt
                    </Button>
                  </div>
                </div>
                <Textarea 
                  value={metadata.thumbnail_prompt || ""} 
                  onChange={e => setMetadata({...metadata, thumbnail_prompt: e.target.value})} 
                  className="font-mono text-xs bg-slate-900 text-green-400 h-24 pr-10" 
                  placeholder="Cinematic shot, highly detailed..." 
                />
              </CardContent>
            </Card>

            <Card className="shadow-sm border-indigo-200">
              <CardHeader className="bg-indigo-50/70 border-b pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-indigo-900">
                  <ImagePlus className="h-4 w-4" /> Tạo ảnh Thumbnail
                </CardTitle>
                <CardDescription>
                  Ghép ảnh nhân vật và chữ lên template có sẵn bằng API backend. Đường dẫn phải là đường dẫn tương đối bên trong thư mục backend.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 bg-white space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="thumbnail-background">Ảnh nền / template</Label>
                    <Input
                      id="thumbnail-background"
                      value={thumbnailConfig.background_path}
                      onChange={event => updateThumbnailConfig("background_path", event.target.value)}
                      placeholder="assets/thumbnail/background.png"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="thumbnail-character">Ảnh nhân vật</Label>
                    <Input
                      id="thumbnail-character"
                      value={thumbnailConfig.character_path}
                      onChange={event => updateThumbnailConfig("character_path", event.target.value)}
                      placeholder="assets/characters/character.png"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="thumbnail-font">Đường dẫn font TTF/OTF trong backend</Label>
                    <Input
                      id="thumbnail-font"
                      value={thumbnailConfig.font_path}
                      onChange={event => updateThumbnailConfig("font_path", event.target.value)}
                      placeholder="assets/fonts/PaytoneOne-Regular.ttf"
                    />
                    <p className="text-xs text-slate-500">
                      Mặc định dùng Paytone One từ assets/fonts. Đổi đường dẫn nếu muốn dùng font khác.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="thumbnail-genre">Thể loại phối màu</Label>
                    <Select
                      value={thumbnailConfig.genre}
                      onValueChange={value => {
                        if (
                          value === "general" || value === "romance" || value === "healing"
                          || value === "youth" || value === "drama" || value === "mystery"
                          || value === "fantasy"
                        ) updateThumbnailConfig("genre", value);
                      }}
                    >
                      <SelectTrigger id="thumbnail-genre" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
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
                  <div className="space-y-1.5">
                    <Label htmlFor="thumbnail-color-mode">Cách chọn màu</Label>
                    <Select
                      value={thumbnailConfig.color_mode}
                      onValueChange={value => {
                        if (value === "rules" || value === "ai" || value === "manual") {
                          updateThumbnailConfig("color_mode", value);
                        }
                      }}
                    >
                      <SelectTrigger id="thumbnail-color-mode" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rules">Theo quy tắc (mặc định)</SelectItem>
                        <SelectItem value="ai">AI (cần OPENAI_API_KEY)</SelectItem>
                        <SelectItem value="manual">Thủ công</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="thumbnail-title">Chữ tiêu đề trên thumbnail</Label>
                    <Input
                      id="thumbnail-title"
                      value={thumbnailTitle}
                      onChange={event => setThumbnailTitle(event.target.value)}
                      placeholder={metadata.overlay || metadata.title || "Nhập tiêu đề thumbnail"}
                    />
                    <p className="text-xs text-slate-500">
                      Để trống sẽ tự lấy Overlay, hoặc Tên truyện nếu Overlay chưa có.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="thumbnail-subtitle">Phụ đề (không bắt buộc)</Label>
                    <Input
                      id="thumbnail-subtitle"
                      value={thumbnailSubtitle}
                      onChange={event => setThumbnailSubtitle(event.target.value)}
                      placeholder={metadata.hook || "Mặc định không có phụ đề"}
                    />
                    <p className="text-xs text-slate-500">
                      Để trống sẽ tự lấy Hook hiện tại; nhập nội dung để ghi đè.
                    </p>
                  </div>
                </div>

                <details className="rounded-md border border-slate-200 p-3">
                  <summary className="cursor-pointer text-sm font-medium text-slate-700">
                    Tinh chỉnh vị trí ảnh và chữ (canvas {thumbnailConfig.canvas_width} × {thumbnailConfig.canvas_height})
                  </summary>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {([
                      ["character_box", "Ảnh nhân vật"],
                      ["title_box", "Tiêu đề"],
                      ["subtitle_box", "Phụ đề"],
                    ] as const).flatMap(([boxKey, label]) => (
                      ([
                        ["x", "X"],
                        ["y", "Y"],
                        ["width", "Rộng"],
                        ["height", "Cao"],
                      ] as const).map(([key, fieldLabel]) => (
                        <div key={`${boxKey}-${key}`} className="space-y-1.5">
                          <Label htmlFor={`thumbnail-${boxKey}-${key}`}>{label} — {fieldLabel}</Label>
                          <Input
                            id={`thumbnail-${boxKey}-${key}`}
                            type="number"
                            min={key === "x" || key === "y" ? 0 : 1}
                            step={1}
                            value={thumbnailConfig[boxKey][key]}
                            onChange={event => {
                              const minimum = key === "x" || key === "y" ? 0 : 1;
                              updateThumbnailBox(
                                boxKey,
                                key,
                                Math.max(minimum, Number(event.target.value) || minimum),
                              );
                            }}
                          />
                        </div>
                      ))
                    ))}
                  </div>
                </details>

                {thumbnailError && (
                  <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                    {thumbnailError}
                  </p>
                )}

                <Button
                  onClick={handleRenderThumbnail}
                  disabled={isRenderingThumbnail}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {isRenderingThumbnail
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <ImagePlus className="mr-2 h-4 w-4" />}
                  {isRenderingThumbnail ? "Đang tạo thumbnail..." : "Tạo thumbnail"}
                </Button>

                {thumbnailResult && (
                  <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant={thumbnailResult.status === "pass" ? "default" : "outline"}>
                        {thumbnailResult.status === "pass" ? "Đã tạo" : "Cần xem lại bố cục"}
                      </Badge>
                      <div className="flex gap-3 text-sm">
                        <a className="text-indigo-600 underline" href={thumbnailResult.imageUrl} target="_blank" rel="noreferrer">PNG</a>
                        <a className="text-indigo-600 underline" href={thumbnailResult.svgUrl} target="_blank" rel="noreferrer">SVG</a>
                        <a className="text-indigo-600 underline" href={thumbnailResult.qaUrl} target="_blank" rel="noreferrer">Báo cáo QA</a>
                      </div>
                    </div>
                    <p className="text-xs text-slate-600">Font thực tế: {thumbnailResult.fontName}</p>
                    {isThumbnailPreviewStale && (
                      <p role="status" className="rounded bg-amber-50 p-2 text-xs text-amber-800">
                        Cấu hình đã thay đổi; ảnh này là bản render trước. Hãy tạo lại để cập nhật preview.
                      </p>
                    )}
                    <Image
                      src={thumbnailResult.imageUrl}
                      alt="Thumbnail vừa tạo"
                      width={1280}
                      height={720}
                      unoptimized
                      className="h-auto max-h-[360px] w-full rounded border border-slate-200 bg-white object-contain"
                    />
                    {thumbnailResult.warnings.length > 0 && (
                      <ul className="list-inside list-disc space-y-1 text-xs text-slate-500">
                        {thumbnailResult.warnings.map(warning => <li key={warning}>{warning}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Preview bài đăng trên điện thoại
              </h3>
              {isThumbnailPreviewStale && (
                <p role="status" className="mb-3 rounded bg-amber-50 p-2 text-xs text-amber-800">
                  Ảnh thumbnail đang xem chưa khớp với cấu hình hiện tại.
                </p>
              )}
              
              <div className="w-[280px] h-[580px] bg-slate-900 rounded-[2.5rem] border-[8px] border-slate-800 relative overflow-hidden shadow-2xl mx-auto">
                <div className="absolute top-0 inset-x-0 h-6 bg-slate-800 rounded-b-xl w-32 mx-auto z-20"></div>
                <div className="absolute inset-0 bg-gradient-to-b from-slate-700 to-slate-900 flex flex-col justify-between p-4 pb-16 z-10">
                  <div className="flex-1 flex items-center justify-center overflow-hidden rounded-xl bg-black/30">
                    {thumbnailResult ? (
                      <Image
                        src={thumbnailResult.imageUrl}
                        alt="Thumbnail đã render trong preview bài đăng"
                        width={1280}
                        height={720}
                        unoptimized
                        className="h-auto max-h-full w-full object-contain"
                      />
                    ) : (
                      <h2 className="text-3xl font-black text-white text-center drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] leading-tight px-2">
                        {effectiveThumbnailTitle || (
                          <span className="text-slate-300 text-xl font-normal">
                            Tạo thumbnail để xem ảnh thật
                          </span>
                        )}
                      </h2>
                    )}
                  </div>
                  <div className="space-y-2 mt-auto">
                    <h3 className="text-white font-bold text-sm drop-shadow-md">
                      {metadata.title || "Tên truyện..."}
                    </h3>
                    <p className="text-white/90 text-xs drop-shadow-md line-clamp-2">
                      {metadata.hook || "Câu Hook caption hiển thị ở đây..."}
                    </p>
                    <Badge variant="outline" className="bg-white/10 text-blue-300 border-none px-1 text-[10px] drop-shadow-md line-clamp-1">
                      {metadata.type || "#theloai"}
                    </Badge>
                  </div>
                </div>
                <div className="absolute right-3 bottom-20 flex flex-col gap-4 z-20 opacity-80">
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm text-white text-xs">♡</div>
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm text-white text-xs">💬</div>
                  <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm text-white text-xs">⤴️</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
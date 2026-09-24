"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
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

export default function MetadataPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [metadata, setMetadata] = useState({
    title: "", hook: "", overlay: "", description: "", type: "", hashtag: "", thumbnail_prompt: ""
  });
  const [selectedTone, setSelectedTone] = useState("Kịch tính / Giật tít");
  const [aiOptions, setAiOptions] = useState<Record<string, string[]>>({});
  const [loadingMeta, setLoadingMeta] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  
  // Trạng thái lưu field nào vừa được copy
  const [copiedField, setCopiedField] = useState("");

  useEffect(() => {
    apiClient.get<any>(`/api/projects/${projectId}`)
      .then(data => {
        if (data.success) {
          if (data.data.video_metadata) setMetadata(prev => ({...prev, ...data.data.video_metadata}));
        }
      });
  }, [projectId]);

  const generateMetadataItem = async (type: string) => {
    setLoadingMeta(prev => ({ ...prev, [type]: true }));
    setAiOptions(prev => ({ ...prev, [type]: [] })); 
    
    try {
      const data = await apiClient.post<any>(`/api/projects/${projectId}/generate-metadata`, { target_type: type, tone: selectedTone });
      
      if (data.success && data.data.length > 0) {
        if (['title', 'hook', 'overlay'].includes(type)) {
          setAiOptions(prev => ({ ...prev, [type]: data.data }));
        } else {
          setMetadata(prev => ({ ...prev, [type]: data.data[0] }));
        }
      }
    } catch (err) {
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
    } catch (e) { 
      alert("Lỗi khi lưu dữ liệu."); 
    } finally {
      setIsSaving(false);
    }
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
                      {renderCharCount(metadata.title, 100, 80)}
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
                      {loadingMeta.thumbnail_prompt ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Wand2 className="h-3 w-3 mr-1"/>} Sinh Prompt Tiếng Anh
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

          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Xem Trước Trên ĐT
              </h3>
              
              <div className="w-[280px] h-[580px] bg-slate-900 rounded-[2.5rem] border-[8px] border-slate-800 relative overflow-hidden shadow-2xl mx-auto">
                <div className="absolute top-0 inset-x-0 h-6 bg-slate-800 rounded-b-xl w-32 mx-auto z-20"></div>
                <div className="absolute inset-0 bg-gradient-to-b from-slate-700 to-slate-900 flex flex-col justify-between p-4 pb-16 z-10">
                  <div className="flex-1 flex items-center justify-center">
                    <h2 className="text-3xl font-black text-white text-center drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] leading-tight px-2">
                      {metadata.overlay || <span className="text-slate-500 text-xl font-normal">Chữ Overlay sẽ hiện ở đây</span>}
                    </h2>
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
"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Loader2, PlayCircle, Settings2, CheckCircle2, Clock, FileWarning, Wand2, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export default function RenderStudioPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [chapters, setChapters] = useState<any[]>([]);
  const [projectStatus, setProjectStatus] = useState("Idle");
  const [isPolling, setIsPolling] = useState(true);

  // === TÍNH NĂNG MỚI: THEO DÕI TIẾN ĐỘ & CHI TIẾT ===
  const [renderProgress, setRenderProgress] = useState(0);
  const [currentTask, setCurrentTask] = useState("");
  const [currentChapterTask, setCurrentChapterTask] = useState("");
  
  // === TÍNH NĂNG MỚI: CHỌN CHAPTER MUỐN RENDER ===
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);

  // === TÍNH NĂNG MỚI: CẤU HÌNH PROFILE ===
  const [config, setConfig] = useState({
    voice_id: "Nguyệt Nga",
    render_mode: "full",
    auto_split_parts: false,
    intro_video_path: "./data/sample_assets/intro.mp4",
    main_video_path: "./data/sample_assets/main.mp4",
    background_folder_path: "./data/sample_assets/backgrounds",
    silence_audio_path: "./data/sample_assets/empty.wav",
    overlay_x: 1110, overlay_y: 10, overlay_w: 601, overlay_h: 1060
  });

  const [metadata, setMetadata] = useState({
    title: "",
    hook: "",
    overlay: "",
    description: "",
    type: ""
  });
  
  const [loadingMeta, setLoadingMeta] = useState<Record<string, boolean>>({
    title: false, hook: false, overlay: false, description: false, type: false
  });

  const forceRenderRef = useRef(false);
  const hasInitializedSelection = useRef(false);

  // 1. HÀM FETCH INITIAL (Đọc Profile Config từ DB nếu có)
  const fetchInitialData = async () => {
    try {
      const [chapRes, projRes, videoMetaRes] = await Promise.all([
        fetch(`http://localhost:8765/api/projects/${projectId}/chapters`),
        fetch(`http://localhost:8765/api/projects/${projectId}`),
        fetch(`http://localhost:8765/api/projects/${projectId}/video-metadata`)
      ]);
      const chapData = await chapRes.json();
      const projData = await projRes.json();
      const videoMetaData = await videoMetaRes.json();
      
      if (chapData.success) {
        setChapters(chapData.data);
        
        // SỬA Ở ĐÂY: Chỉ tự động chọn nếu là lần load trang đầu tiên
        if (!hasInitializedSelection.current) {
          const readyIds = chapData.data
            .filter((c:any) => ["Refined & Ready for Audio", "Completed", "Error"].includes(c.status))
            .map((c:any) => c.id);
            
          setSelectedChapterIds(readyIds);
          hasInitializedSelection.current = true; // Đánh dấu là đã auto-select xong
        }
      }
      if (projData.success) {
        setProjectStatus(projData.data.status);
        setRenderProgress(projData.data.render_progress || 0);
        
        // Đọc Profile đã lưu
        if (projData.data.render_config) {
            const dbConfig = projData.data.render_config;
            setConfig({
                ...dbConfig, // Lấy các cấu hình cũ từ DB
                // ÉP KIỂU AN TOÀN CHO 2 BIẾN MỚI THÊM:
                render_mode: dbConfig.render_mode || "full",
                auto_split_parts: dbConfig.auto_split_parts ?? false, // Dùng ?? để ép về false nếu dbConfig.auto_split_parts là undefined hoặc null
            });
        }
      }
      if (videoMetaData.success) {
        setMetadata(videoMetaData.data);
      }
    } catch (err) { console.error(err); }
  };

  // 2. HÀM POLLING CHI TIẾT
  const pollLightweightStatus = async () => {
    try {
      const res = await fetch(`http://localhost:8765/api/projects/${projectId}/status-only`);
      const data = await res.json();
      
      if (data.success) {
        // [CẬP NHẬT MỚI Ở ĐÂY]
        // Nếu Backend báo là đã kết thúc hành trình (Xong hoặc Lỗi)
        // thì ta phải bẻ khóa ForceRender lập tức để UI được cập nhật.
        if (data.project_status === "Completed" || data.project_status === "Error") {
            forceRenderRef.current = false;
        }

        // Cập nhật Project Status (chỉ update nếu không bị khóa)
        if (!forceRenderRef.current) {
           setProjectStatus(data.project_status);
        }
        
        // Cập nhật Tiến độ & Log
        setRenderProgress(data.project_progress || 0);
        setCurrentTask(data.task_msg || ""); 

        // Cập nhật Status từng Chapter
        setChapters(prevChapters => prevChapters.map(oldChap => {
          const newChapStatus = data.chapters.find((c: any) => c.id === oldChap.id);
          if (newChapStatus && newChapStatus.status !== oldChap.status) {
             return { ...oldChap, status: newChapStatus.status };
          }
          return oldChap;
        }));
        
        return data.project_status; // Trả về status để vòng lặp bên ngoài biết đường dừng
      }
      return "Error";
    } catch (err) { 
      return "Error"; 
    }
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isActive = true;
    fetchInitialData();

    const pollData = async () => {
      if (!isActive || !isPolling) return;

      const currentStatus = await pollLightweightStatus();

      // KIỂM TRA ĐIỀU KIỆN DỪNG:
      if (currentStatus === "Completed" || currentStatus === "Error") {
        console.log(`[Polling] Backend báo ${currentStatus}. Dừng gửi Request.`);
        setIsPolling(false);
        return; // Thoát hẳn, không gọi setTimeout nữa
      }

      // NẾU CHƯA XONG: Hẹn giờ 3s gọi lại
      if (isActive) {
        timeoutId = setTimeout(pollData, 3000);
      }
    };

    pollData();
    return () => { isActive = false; clearTimeout(timeoutId); };
  }, [isPolling, projectId]);


  // 3. HÀM CHỌN CHAPTER
  const toggleChapterSelection = (id: string) => {
    setSelectedChapterIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // 4. HÀM BATCH RENDER (Gửi danh sách ID và Config)
  const handleBatchRender = async () => {
    if (selectedChapterIds.length === 0) {
        return alert("Vui lòng tick chọn ít nhất 1 chương để Render!");
    }

    setProjectStatus("Rendering");
    forceRenderRef.current = true;
    setIsPolling(true); 

    try {
      const res = await fetch(`http://localhost:8765/api/projects/${projectId}/batch-render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            config: config, 
            target_chapter_ids: selectedChapterIds // Chuyển danh sách ID xuống Backend
        }),
      });
      const data = await res.json();
      if (!data.success) {
        alert("Lỗi Backend.");
        forceRenderRef.current = false;
      }
    } catch (error) {
      alert("Mất kết nối Backend.");
      forceRenderRef.current = false;
    }
  };

  // 5. HÀM LƯU PROFILE CONFIG VÀO DATABASE
  const handleSaveProfile = async () => {
    try {
      await fetch(`http://localhost:8765/api/projects/${projectId}/update-render-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          render_config: config,
          video_metadata: metadata
        }),
      });
      alert("Đã lưu Cấu hình (Profile) thành công!");
    } catch (e) { alert("Lỗi khi lưu cấu hình."); }
  };
  
  const generateMetadataItem = async (type: 'title' | 'hook' | 'overlay' | 'description' | 'type') => {
    // Bật hiệu ứng loading riêng cho đúng cái nút vừa được bấm
    setLoadingMeta(prev => ({ ...prev, [type]: true }));
    
    try {
      const res = await fetch(`http://localhost:8765/api/projects/${projectId}/generate-metadata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_type: type })
      });
      
      const data = await res.json();
      
      if (data.success) {
        // Cập nhật kết quả AI trả về vào State hiển thị trên các ô Input/Textarea
        setMetadata(prev => ({ ...prev, [type]: data.data }));
      } else {
        alert("Lỗi từ server: " + data.detail);
      }
      
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối Backend. Không thể tạo " + type);
    } finally {
      // Tắt hiệu ứng loading
      setLoadingMeta(prev => ({ ...prev, [type]: false }));
    }
  };

  // 6. HÀM SELECT ALL READY CHAPTERS
  const handleSelectAll = () => {
    // Lọc ra danh sách những chương ĐỦ ĐIỀU KIỆN để được chọn
    const selectableChapters = chapters.filter(c => 
      ["Refined & Ready for Audio", "Completed", "Error"].includes(c.status)
    );
    
    // Nếu số lượng đang chọn BẰNG với tổng số lượng có thể chọn -> Tức là đang chọn Full -> Hành động là Bỏ chọn tất cả
    if (selectedChapterIds.length === selectableChapters.length) {
      setSelectedChapterIds([]);
    } else {
      // Ngược lại -> Hành động là Chọn tất cả (Lấy ID của tất cả các chương hợp lệ)
      setSelectedChapterIds(selectableChapters.map(c => c.id));
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-100 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Xưởng Sản Xuất (Render Studio)</h1>
          <p className="text-slate-500 mt-1">Xuất xưởng tác phẩm theo cấu hình tùy chỉnh.</p>
        </div>

        {/* BẢNG THEO DÕI TIẾN ĐỘ RENDER CHẠY NGẦM (NẰM Ở TRÊN CÙNG) */}
        {(projectStatus === "Rendering" || renderProgress > 0) && (
            <Card className="shadow-sm border-indigo-200 bg-indigo-50/50">
                <CardContent className="p-6 space-y-4">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-bold text-indigo-900 flex items-center">
                                {projectStatus === "Rendering" ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5 text-green-600" />}
                                Tiến độ Render Tổng Thể
                            </h3>
                            <p className="text-sm text-indigo-700 mt-1 font-medium">
                                {currentTask || "Đang khởi tạo..."} {/* <-- Chỉ in đúng dòng thông báo ra */}
                            </p>
                        </div>
                        <span className="text-2xl font-black text-indigo-900">{renderProgress}%</span>
                    </div>
                    <Progress value={renderProgress} className="h-3 w-full bg-indigo-100" />
                </CardContent>
            </Card>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          
          {/* CỘT TRÁI: DANH SÁCH CHƯƠNG (CÓ CHECKBOX) */}
          <Card className="xl:col-span-1 shadow-sm border-slate-200 flex flex-col max-h-[70vh]">
            <CardHeader className="bg-white border-b pb-4 flex flex-row items-center justify-between">
              <CardTitle>Chọn Chương (Render List)</CardTitle>
              <Badge variant="outline" className="text-indigo-600 bg-indigo-50 border-indigo-200">
                Đã chọn: {selectedChapterIds.length}/{chapters.filter(c => ["Refined & Ready for Audio", "Completed", "Error"].includes(c.status)).length}
              </Badge>
            </CardHeader>
            <div className="bg-slate-50 px-4 py-2 border-b flex items-center justify-between">
               <div className="flex items-center space-x-2">
                 <Checkbox 
                   id="select-all"
                   // Checkbox "Chọn tất cả" sẽ được tick nếu số lượng đang chọn = tổng số lượng hợp lệ
                   checked={
                     chapters.length > 0 && 
                     selectedChapterIds.length === chapters.filter(c => ["Refined & Ready for Audio", "Completed", "Error"].includes(c.status)).length
                   }
                   // Khóa nút nếu đang render
                   disabled={projectStatus === "Rendering" || chapters.filter(c => ["Refined & Ready for Audio", "Completed", "Error"].includes(c.status)).length === 0}
                   onCheckedChange={handleSelectAll}
                 />
                 <Label htmlFor="select-all" className="text-sm font-medium text-slate-600 cursor-pointer">
                   Chọn tất cả / Bỏ chọn
                 </Label>
               </div>
            </div>
            <CardContent className="p-0 overflow-y-auto">
              <div className="divide-y divide-slate-100">
                {chapters.map((chap) => {
                  const isSelectable = ["Refined & Ready for Audio", "Completed", "Error"].includes(chap.status);
                  
                  return (
                  <div key={chap.id} className="p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors">
                    <Checkbox 
                        checked={selectedChapterIds.includes(chap.id)}
                        disabled={!isSelectable || projectStatus === "Rendering"}
                        onCheckedChange={() => toggleChapterSelection(chap.id)}
                    />
                    <div className="flex-1">
                      <h4 className="font-medium text-slate-800 text-sm">Chương {chap.chapter_number}</h4>
                      <p className="text-xs text-slate-500 truncate max-w-[150px]">{chap.title}</p>
                    </div>
                    <div>
                      {chap.status === "Refined & Ready for Audio" && (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800"><Clock className="mr-1 h-3 w-3"/> Chờ Render</Badge>
                      )}
                      
                      {/* Trạng thái 2: Xử lý Text */}
                      {chap.status === "Preparing Text" && (
                        <Badge variant="default" className="bg-blue-500"><Wand2 className="mr-1 h-3 w-3 animate-pulse"/> Xử lý Kịch bản</Badge>
                      )}

                      {/* Trạng thái 3: Tạo Audio (TTS) */}
                      {chap.status === "Generating Audio" && (
                        <Badge variant="default" className="bg-purple-500"><Loader2 className="mr-1 h-3 w-3 animate-spin"/> Đang tạo Audio</Badge>
                      )}

                      {/* Trạng thái 4: Audio Xong, đứng chờ FFmpeg trộn Video Tổng */}
                      {chap.status === "Audio Generated" && (
                        <Badge variant="secondary" className="bg-indigo-100 text-indigo-700"><CheckCircle2 className="mr-1 h-3 w-3"/> Chờ Ghép Video</Badge>
                      )}

                      {/* Trạng thái 5: Audio Xong, đứng chờ FFmpeg trộn Video Tổng */}
                      {chap.status === "Audio Compiled" && (
                        <Badge variant="secondary" className="bg-indigo-100 text-yellow-700"><CheckCircle2 className="mr-1 h-3 w-3"/> Đã trộn Audio</Badge>
                      )}

                      {/* Trạng thái 6: Hoàn thành toàn cục */}
                      {chap.status === "Completed" && (
                        <Badge variant="default" className="bg-green-500"><CheckCircle2 className="mr-1 h-3 w-3"/> Đã Xong</Badge>
                      )}

                      {/* Trạng thái Lỗi */}
                      {chap.status === "Error" && (
                        <Badge variant="destructive"><FileWarning className="mr-1 h-3 w-3"/> Lỗi Render</Badge>
                      )}

                      {/* Các trạng thái còn lại (Chưa viết xong) */}
                      {!["Refined & Ready for Audio", "Preparing Text", "Generating Audio", "Audio Generated", "Audio Compiled", "Completed", "Error"].includes(chap.status) && (
                        <Badge variant="outline" className="text-slate-400"><FileWarning className="mr-1 h-3 w-3"/> Chưa Refine</Badge>
                      )}
                    </div>
                  </div>
                )})}
              </div>
            </CardContent>
          </Card>

          {/* CỘT PHẢI: SETTING VÀ NÚT BẤM */}
          <div className="xl:col-span-2 space-y-6">
            
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="bg-white border-b flex flex-row justify-between items-center">
                <div>
                    <CardTitle className="flex items-center gap-2">
                    <Settings2 className="h-5 w-5 text-indigo-600" /> Profile Cấu Hình
                    </CardTitle>
                    <CardDescription>Thiết lập Tắt/Bật tính năng và đường dẫn file.</CardDescription>
                </div>
                <Button size="sm" variant="outline" onClick={handleSaveProfile} disabled={projectStatus === "Rendering"}>
                    <Save className="h-4 w-4 mr-2"/> Lưu Profile
                </Button>
              </CardHeader>
              <CardContent className="space-y-6 p-6 bg-slate-50">      
                <div className="space-y-2">
                  <Label>Giọng đọc AI (TTS Voice)</Label>
                  <Select value={config.voice_id} onValueChange={(val) => setConfig({...config, voice_id: val || ""})}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Chọn giọng đọc" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Nguyệt Nga">Nguyệt Nga (Nữ - Truyện cảm)</SelectItem>
                      <SelectItem value="Bảo Hoàng">Bảo Hoàng (Nam - Trầm ấm)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Chế độ Render (Render Mode)</Label>
                  <Select value={config.render_mode} onValueChange={(val) => setConfig({...config, render_mode: val || "full"})}>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Chọn chế độ" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Mode Bình Thường (Intro + Main Overlay + Nền)</SelectItem>
                      <SelectItem value="simple">Mode Đơn Giản (Chỉ Nền + Audio)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {config.render_mode === "simple" && (
                    <div className="flex items-center space-x-2">
                      <Switch 
                          id="auto-split" 
                          checked={!!config.auto_split_parts} // Dùng hai dấu chấm than để ép kiểu Boolean tuyệt đối
                          onCheckedChange={c => setConfig({...config, auto_split_parts: c})} 
                      />
                      <Label htmlFor="auto-split" className="font-semibold text-indigo-900">
                          Tự động chia nhỏ Video (Shorts Series)
                      </Label>
                  </div>
                  )}

                <Separator />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Thư mục Background Video (Bắt buộc cho cả 2 mode)</Label>
                    <Input className="bg-white font-mono text-sm" value={config.background_folder_path} onChange={e => setConfig({...config, background_folder_path: e.target.value})} />
                  </div>
                  
                  {/* Chỉ hiện Intro và Main nếu là Mode Full */}
                  {config.render_mode === "full" && (
                    <>
                      <div className="space-y-2">
                        <Label>File Video Intro</Label>
                        <Input className="bg-white font-mono text-sm" value={config.intro_video_path} onChange={e => setConfig({...config, intro_video_path: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <Label>File Video Main (Loop nền)</Label>
                        <Input className="bg-white font-mono text-sm" value={config.main_video_path} onChange={e => setConfig({...config, main_video_path: e.target.value})} />
                      </div>
                    </>
                  )}
                </div>

                {config.render_mode === "full" && (
                  <>
                    <Separator />
                    <div>
                      <Label className="mb-2 block">Cấu hình Tọa độ lồng ghép (Overlay X, Y, W, H)</Label>
                      <div className="grid grid-cols-4 gap-4">
                        <div className="space-y-1">
                          <span className="text-xs text-slate-500">Vị trí X</span>
                          <Input type="number" className="bg-white" value={config.overlay_x} onChange={e => setConfig({...config, overlay_x: parseInt(e.target.value)})} />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-slate-500">Vị trí Y</span>
                          <Input type="number" className="bg-white" value={config.overlay_y} onChange={e => setConfig({...config, overlay_y: parseInt(e.target.value)})} />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-slate-500">Chiều Rộng (W)</span>
                          <Input type="number" className="bg-white" value={config.overlay_w} onChange={e => setConfig({...config, overlay_w: parseInt(e.target.value)})} />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs text-slate-500">Chiều Cao (H)</span>
                          <Input type="number" className="bg-white" value={config.overlay_h} onChange={e => setConfig({...config, overlay_h: parseInt(e.target.value)})} />
                        </div>
                      </div>
                    </div>
                  </>
                )}
                
              </CardContent>
            </Card>

            <Card className={`shadow-sm border-2 transition-colors duration-300 ${
              projectStatus === "Rendering" ? "border-slate-300 bg-slate-50 opacity-80" : "border-indigo-400 bg-indigo-50/50"
            }`}>
              <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-900">Render Tùy Chọn ({selectedChapterIds.length} Chương)</h3>
                </div>
                
                <div className="shrink-0 w-full md:w-auto">
                  {projectStatus === "Rendering" ? (
                    <Button size="lg" disabled className="w-full h-14 px-8 text-lg bg-slate-600">
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang Xử Lý...
                    </Button>
                  ) : (
                    <Button size="lg" onClick={handleBatchRender} className="w-full h-14 px-8 text-lg bg-indigo-600 hover:bg-indigo-700 shadow-md">
                      <PlayCircle className="mr-2 h-5 w-5" /> Khởi Chạy Render
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200 mt-6 xl:col-span-2">
              <CardHeader className="bg-white border-b">
                <CardTitle className="flex items-center gap-2">
                  Youtube Metadata (SEO)
                </CardTitle>
                <CardDescription>
                  Tạo tiêu đề, câu hook và mô tả cuốn hút để đăng Youtube/TikTok.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6 bg-slate-50">
                
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <Label>Tên truyện chính thức (≤ 60 ký tự)</Label>
                    <Button variant="ghost" size="sm" onClick={() => generateMetadataItem('title')} disabled={loadingMeta.title} className="h-7 text-xs text-indigo-600">
                      {loadingMeta.title ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Wand2 className="h-3 w-3 mr-1"/>} Tạo lại
                    </Button>
                  </div>
                  <Input value={metadata.title} onChange={e => setMetadata({...metadata, title: e.target.value})} className="bg-white font-medium" placeholder="Bấm 'Tạo lại' để AI sinh tên truyện..." />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <Label>Tiêu đề Video / Câu Hook (≤ 60 ký tự)</Label>
                    <Button variant="ghost" size="sm" onClick={() => generateMetadataItem('hook')} disabled={loadingMeta.hook} className="h-7 text-xs text-indigo-600">
                      {loadingMeta.hook ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Wand2 className="h-3 w-3 mr-1"/>} Tạo lại
                    </Button>
                  </div>
                  <Input value={metadata.hook} onChange={e => setMetadata({...metadata, hook: e.target.value})} className="bg-white font-medium" placeholder="VD: Trót yêu bạn thân 10 năm và cái kết đắng..." />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <Label>Chữ Overlay trên Thumbnail</Label>
                    <Button variant="ghost" size="sm" onClick={() => generateMetadataItem('overlay')} disabled={loadingMeta.overlay} className="h-7 text-xs text-indigo-600">
                      {loadingMeta.overlay ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Wand2 className="h-3 w-3 mr-1"/>} Tạo lại
                    </Button>
                  </div>
                  <Input value={metadata.overlay} onChange={e => setMetadata({...metadata, overlay: e.target.value})} className="bg-white font-medium" placeholder="Câu thả thính hoặc dấu chấm hỏi lớn..." />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <Label>Thể loại</Label>
                    <Button variant="ghost" size="sm" onClick={() => generateMetadataItem('type')} disabled={loadingMeta.type} className="h-7 text-xs text-indigo-600">
                      {loadingMeta.type ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Wand2 className="h-3 w-3 mr-1"/>} Tạo lại
                    </Button>
                  </div>
                  <Input value={metadata.type} onChange={e => setMetadata({...metadata, type: e.target.value})} className="bg-white font-medium" placeholder="Thể loại video..." />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <Label>Mô tả (Không Spoil)</Label>
                    <Button variant="ghost" size="sm" onClick={() => generateMetadataItem('description')} disabled={loadingMeta.description} className="h-7 text-xs text-indigo-600">
                      {loadingMeta.description ? <Loader2 className="h-3 w-3 animate-spin mr-1"/> : <Wand2 className="h-3 w-3 mr-1"/>} Tạo lại
                    </Button>
                  </div>
                  <Textarea value={metadata.description} onChange={e => setMetadata({...metadata, description: e.target.value})} className="bg-white h-24 resize-none" placeholder="Tóm tắt nội dung để người xem hiểu bối cảnh..." />
                </div>

              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}

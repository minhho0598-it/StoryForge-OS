"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, PenTool, LayoutList, CheckCircle2, Wand2, Save, X } from "lucide-react";
import { Label } from "@/components/ui/label";

export default function WriterRoomPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [chapters, setChapters] = useState<any[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<any | null>(null);
  
  const [beats, setBeats] = useState<any[]>([]);
  const [loadingBeats, setLoadingBeats] = useState(false);
  const [draftingBeatId, setDraftingBeatId] = useState<string | null>(null);
  const [refining, setRefining] = useState(false);
  const [batchDrafting, setBatchDrafting] = useState(false);

  // --- CÁC STATE QUẢN LÝ LƯU (MỚI) ---
  const [isBeatsDirty, setIsBeatsDirty] = useState(false);
  const [isFinalDirty, setIsFinalDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const DONE_WRITING_STATUSES = [
    "Refined & Ready for Audio", 
    "Preparing Text", 
    "Generating Audio", 
    "Audio Generatedd", 
    "Rendering", 
    "Completed"
  ];

  const currentChapterIndex = chapters.findIndex(c => c.id === selectedChapter?.id);

  const goToNextChapter = () => {
    if (currentChapterIndex < chapters.length - 1) {
      setSelectedChapter(chapters[currentChapterIndex + 1]);
    }
  };

  const goToPrevChapter = () => {
    if (currentChapterIndex > 0) {
      setSelectedChapter(chapters[currentChapterIndex - 1]);
    }
  };

  // 1. Tải danh sách Chương khi vào trang
  useEffect(() => {
    fetch(`http://localhost:8765/api/projects/${projectId}/chapters`)
      .then(res => res.json())
      .then(data => {
        if (data.success) setChapters(data.data);
      });
  }, [projectId]);

  // 2. Tải danh sách Beats khi chọn 1 Chương
  useEffect(() => {
    if (!selectedChapter) return;
    setLoadingBeats(true);
    fetch(`http://localhost:8765/api/chapters/${selectedChapter.id}/beats`)
      .then(res => res.json())
      .then(data => {
        if (data.success) setBeats(data.data);
      })
      .finally(() => setLoadingBeats(false));
  }, [selectedChapter]);

  // --- HÀM XỬ LÝ TEXT THAY ĐỔI TRÊN GIAO DIỆN ---
  
  // 1. Khi gõ chữ vào một Beat
  const handleBeatTextChange = (index: number, newText: string) => {
    const newBeats = [...beats];
    newBeats[index].ai_draft_text = newText;
    setBeats(newBeats);
    setIsBeatsDirty(true); // Bật cờ
  };

  // 2. Khi gõ chữ vào Bản Final
  const handleFinalTextChange = (newText: string) => {
    const newChapters = chapters.map(c => 
      c.id === selectedChapter.id ? { ...c, final_content: newText } : c
    );
    setChapters(newChapters);
    setSelectedChapter({ ...selectedChapter, final_content: newText });
    setIsFinalDirty(true); // Bật cờ
  };

  // --- HÀM LƯU DỮ LIỆU XUỐNG DB ---
  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      // Lưu Beats (nếu có thay đổi)
      if (isBeatsDirty && beats.length > 0) {
        const payload = beats.map(b => ({ id: b.id, draft_text: b.ai_draft_text }));
        await fetch(`http://localhost:8765/api/beats/bulk-update`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ beats: payload })
        });
        setIsBeatsDirty(false);
      }

      // Lưu Bản Final (nếu có thay đổi)
      if (isFinalDirty && selectedChapter) {
        await fetch(`http://localhost:8765/api/chapters/${selectedChapter.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ final_content: selectedChapter.final_content })
        });
        setIsFinalDirty(false);
      }
      
    } catch (e) {
      alert("Lỗi khi lưu dữ liệu.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- CÁC HÀM GỌI API ---

  // Nút: "Tạo Nhịp Truyện (Generate Beats)"
  const handleGenerateBeats = async () => {
    if (!selectedChapter) return;
    setLoadingBeats(true);
    try {
      const res = await fetch(`http://localhost:8765/api/chapters/${selectedChapter.id}/generate-beats`, { method: "POST" });
      const result = await res.json();
      if (result.success) {
        // Gọi lại api lấy beats mới
        const newBeatsRes = await fetch(`http://localhost:8765/api/chapters/${selectedChapter.id}/beats`);
        const newBeats = await newBeatsRes.json();
        setBeats(newBeats.data);
      }
    } catch (error) {
      alert("Lỗi khi tạo Beats.");
    } finally {
      setLoadingBeats(false);
    }
  };

  // Nút: "AI Viết Nháp (Draft Beat)"
  const handleDraftBeat = async (beatId: string, index: number) => {
    setDraftingBeatId(beatId);
    try {
      // Lấy 1500 ký tự của beat phía trước làm văn cảnh nối tiếp
      const previousText = index > 0 && beats[index - 1].ai_draft_text 
        ? encodeURIComponent(beats[index - 1].ai_draft_text.slice(-1500)) 
        : "";

      const res = await fetch(`http://localhost:8765/api/beats/${beatId}/draft?previous_text=${previousText}`, { method: "POST" });
      const result = await res.json();
      
      if (result.success) {
        // Cập nhật text mới vào state ngay lập tức
        const newBeats = [...beats];
        newBeats[index].ai_draft_text = result.text;
        setBeats(newBeats);
      }
    } catch (error) {
      alert("Lỗi khi AI viết nháp.");
    } finally {
      setDraftingBeatId(null);
    }
  };

  // Nút: "Biên tập toàn bộ Chương (Refine)"
  const handleRefineChapter = async () => {
    if (!selectedChapter) return;
    setRefining(true);
    try {
      const res = await fetch(`http://localhost:8765/api/chapters/${selectedChapter.id}/refine`, { method: "POST" });
      const result = await res.json();
      if (result.success) {
        alert("Đã biên tập thành công! Chương đã khóa sổ.");
        // Cập nhật lại UI để hiển thị bài chốt
        const updatedChapters = chapters.map(c => 
          c.id === selectedChapter.id ? { 
            ...c, 
            status: "Refined & Ready for Audio",
            final_content: result.final_content 
          } : c
        );
        setChapters(updatedChapters);
        setSelectedChapter({ 
          ...selectedChapter, 
          status: "Refined & Ready for Audio",
          final_content: result.final_content 
        });
      }
    } catch (error) {
      alert("Lỗi khi refine chương.");
    } finally {
      setRefining(false);
    }
  };

  const handleBatchDraft = async () => {
    if (!selectedChapter) return;
    setBatchDrafting(true);
    
    // Tùy chọn: Hiện thông báo nhắc nhở user quá trình này tốn thời gian
    alert("Hệ thống bắt đầu viết toàn bộ các cảnh. Quá trình này có thể tốn vài phút. Vui lòng không đóng trang.");

    try {
      const res = await fetch(`http://localhost:8765/api/chapters/${selectedChapter.id}/batch-draft`, { method: "POST" });
      const result = await res.json();
      
      if (result.success) {
        alert(result.message);
        // Tải lại danh sách Beats để hiển thị chữ lên màn hình
        const newBeatsRes = await fetch(`http://localhost:8765/api/chapters/${selectedChapter.id}/beats`);
        const newBeats = await newBeatsRes.json();
        setBeats(newBeats.data);
      } else {
         alert("Lỗi Backend: " + result.detail);
      }
    } catch (error) {
      alert("Mất kết nối Backend khi Batch Draft.");
    } finally {
      setBatchDrafting(false);
    }
  };

  return (
    <div className="flex h-screen bg-white">
      {/* SIDEBAR TRÁI: DANH SÁCH CHƯƠNG */}
      <div className="w-64 bg-slate-900 text-slate-300 flex flex-col h-screen"> {/* Thêm h-screen vào đây */}
        
        <div className="p-4 border-b border-slate-700 shrink-0"> {/* Thêm shrink-0 để Header không bị bóp */}
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <PenTool className="h-5 w-5" /> Lò Luyện Chữ
          </h2>
        </div>
        
        {/* XÓA THẺ <ScrollArea> VÀ THAY BẰNG THẺ DIV NÀY */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 pb-20"> 
            {chapters.map((chap) => (
              <button
                key={chap.id}
                onClick={() => setSelectedChapter(chap)}
                className={`w-full text-left px-4 py-3 rounded-md transition-colors ${
                  selectedChapter?.id === chap.id 
                    ? "bg-indigo-600 text-white font-medium" 
                    : "hover:bg-slate-800"
                }`}
              >
                <div className="text-sm">Chương {chap.chapter_number}</div>
                <div className="text-xs truncate opacity-70">{chap.title}</div>
                {DONE_WRITING_STATUSES.includes(chap.status) && (
                  <CheckCircle2 className="h-4 w-4 text-green-400 mt-1" />
                )}
              </button>
            ))}
        </div>
      </div>

      {/* MAIN VIEW PHẢI: XỬ LÝ CHƯƠNG */}
      <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
        {selectedChapter ? (
          <>
            {/* Header Chương */}
            <div className="p-6 bg-white border-b shadow-sm flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-800">{selectedChapter.title}</h1>
                <p className="text-slate-600 mt-1">Sự kiện chính: {selectedChapter.main_event}</p>
                <p className="text-sm font-medium text-orange-500 mt-2">Chức năng: {selectedChapter.primary_function}</p>
                <p className="text-sm font-medium text-green-500 mt-2">Khoảng thời gian: {selectedChapter.timeline_period || "Hiện tại"}</p>
                <p className="text-sm font-medium text-indigo-600 mt-2">Góc nhìn: {selectedChapter.pov_character}</p>
              </div>

              <div className="flex gap-4">
                {loadingBeats ? (
                  <div className="h-10 px-4 flex items-center text-sm text-slate-400">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang kiểm tra dữ liệu...
                  </div>
                ) : (
                  <>
                    {/* Các nút hiện ra SAU KHI đã tải xong Beats */}
                    {beats.length === 0 && (
                      <Button onClick={handleGenerateBeats}>
                        <LayoutList className="mr-2 h-4 w-4" /> Chia Nhịp Truyện (Beats)
                      </Button>
                    )}
                    
                    {beats.length > 0 && !DONE_WRITING_STATUSES.includes(selectedChapter.status) && (
                      <>
                        <Button 
                          onClick={handleBatchDraft} 
                          disabled={batchDrafting || refining || draftingBeatId !== null} 
                          variant="outline"
                          className="border-indigo-500 text-indigo-700 hover:bg-indigo-50"
                        >
                          {batchDrafting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenTool className="mr-2 h-4 w-4" />}
                          Auto-Draft Toàn Bộ
                        </Button>

                        <Button onClick={handleRefineChapter} disabled={refining || batchDrafting} className="bg-amber-600 hover:bg-amber-700">
                          {refining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />} 
                          Biên tập (Refine)
                        </Button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto pb-32 bg-slate-50/50"> 
              <div className="max-w-4xl mx-auto space-y-8">
                
                {/* TRƯỜNG HỢP 1: CHƯƠNG ĐÃ HOÀN THÀNH BIÊN TẬP */}
                {DONE_WRITING_STATUSES.includes(selectedChapter.status) ? (
                  <div className="space-y-6 animate-in fade-in duration-500">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center shadow-sm">
                      <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
                      <h2 className="text-xl font-bold text-green-800 mb-1">Chương này đã hoàn thành!</h2>
                      <p className="text-green-700/80 text-sm">
                        Nội dung đã được biên tập mượt mà bởi AI Editor. Đây là bản thảo cuối cùng sẵn sàng mang đi làm Audio.
                      </p>
                    </div>

                    <Card className="border-indigo-100 shadow-md">
                      <CardHeader className="bg-white border-b sticky top-0 z-10">
                        <CardTitle className="text-lg text-slate-800 flex justify-between items-center">
                          Bản thảo hoàn thiện (Final Content)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        {/* Textarea hiển thị Final Content (Có thể viết thêm Component AutoSaveTextareaChapter cho nó tương tự như Beats) */}
                        <Textarea 
                            className="min-h-[600px] resize-y text-lg leading-loose font-serif p-8 bg-[#fdfbf7] border-0 focus-visible:ring-0 text-slate-800"
                            placeholder="Bản thảo cuối cùng sẽ hiển thị ở đây..."
                            value={selectedChapter.final_content || ""}
                            onChange={(e) => handleFinalTextChange(e.target.value)}
                         />
                      </CardContent>
                    </Card>

                    <div className="flex justify-between items-center pt-4 border-t border-slate-200 mt-6">
                      <Button 
                        variant="outline" 
                        onClick={goToPrevChapter}
                        disabled={currentChapterIndex <= 0}
                        className="text-slate-600"
                      >
                        Chương Trước
                      </Button>

                      <Button 
                        onClick={() => router.push(`/project/${projectId}/studio`)} 
                        className="bg-indigo-600 hover:bg-indigo-700 shadow-sm px-8"
                      >
                        Vào Studio Sản Xuất
                      </Button>

                      <Button 
                        variant="outline" 
                        onClick={goToNextChapter}
                        disabled={currentChapterIndex >= chapters.length - 1}
                        className="text-slate-600"
                      >
                        Chương Tiếp Theo
                      </Button>
                    </div>
                  </div>
                ) : (
                  
                  /* TRƯỜNG HỢP 2: CHƯƠNG ĐANG VIẾT DỞ (HIỆN DANH SÁCH BEATS) */
                  <>
                    {loadingBeats ? (
                      <div className="flex flex-col items-center justify-center text-slate-500 mt-20 space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                        <p>Đang phân tích và tải các cảnh...</p>
                      </div>
                    ) : (
                      beats.map((beat, index) => (
                        <Card key={beat.id} className="border-slate-200 shadow-sm">
                          <CardHeader className="bg-slate-50 border-b py-3">
                            <div className="flex justify-between items-center">
                              <CardTitle className="text-base text-slate-700 font-bold">{beat.beat_id}</CardTitle>
                              <span className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded-full">
                                {beat.location}
                              </span>
                            </div>
                          </CardHeader>
                          <CardContent className="p-0">
                            {/* Hướng dẫn cho AI */}
                            <div className="p-4 bg-amber-50/50 border-b border-amber-100 text-sm text-amber-900">
                              <span className="font-semibold block mb-1">Kịch bản hành động:</span>
                              <p className="whitespace-pre-wrap">{beat.action_and_dialogue}</p>
                            </div>
                            
                            {/* Vùng viết văn */}
                            <div className="p-4 flex flex-col gap-3">
                              <div className="p-4 flex flex-col gap-3 bg-white">
                                <Textarea 
                                  className="min-h-[250px] resize-y text-base leading-relaxed font-serif p-4 focus-visible:ring-indigo-500"
                                  placeholder="Văn bản nháp sẽ xuất hiện ở đây. Tự gõ hoặc nhờ AI viết..."
                                  value={beat.ai_draft_text || ""}
                                  onChange={(e) => handleBeatTextChange(index, e.target.value)}
                                />
                                <div className="flex justify-end pt-2">
                                  <Button 
                                    variant="outline" 
                                    onClick={() => handleDraftBeat(beat.id, index)}
                                    disabled={draftingBeatId === beat.id || batchDrafting || refining}
                                    className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                  >
                                    {draftingBeatId === beat.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <><Wand2 className="mr-2 h-4 w-4"/> AI Viết Nháp Cảnh Này</>}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>

            {/* THANH CÔNG CỤ FLOATING KHI CÓ THAY ĐỔI CHƯA LƯU */}
            {(isBeatsDirty || isFinalDirty) && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5">
                <div className="bg-slate-900 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-4">
                  <span className="font-medium">
                    {isFinalDirty ? "Bản thảo hoàn thiện đang được chỉnh sửa!" : "Các bản nháp (Beats) đang được chỉnh sửa!"}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => {
                        setIsBeatsDirty(false);
                        setIsFinalDirty(false);
                        // Refresh data
                        window.location.reload(); 
                      }}>
                      <X className="h-4 w-4 mr-1" /> Hủy bỏ
                    </Button>
                    <Button size="sm" className="bg-green-500 hover:bg-green-600 text-white" onClick={handleSaveChanges} disabled={isSaving}>
                      {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                      Lưu Thay Đổi
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            Hãy chọn một Chương ở cột bên trái để bắt đầu.
          </div>
        )}
      </div>
    </div>
  );
}
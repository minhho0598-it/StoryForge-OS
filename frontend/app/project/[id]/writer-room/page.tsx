"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, PenTool, LayoutList, CheckCircle2, Wand2, Save, X, Sparkles, Activity, Camera, MessageSquare, HeartPulse, List } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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

  // === STATE CHO AI BEAT EDIT (2-STEP WIZARD) ===
  const [isAiBeatModalOpen, setIsAiBeatModalOpen] = useState(false);
  const [aiBeatStep, setAiBeatStep] = useState<1 | 2>(1);
  const [targetBeatIndex, setTargetBeatIndex] = useState(0);
  
  const [userBeatPrompt, setUserBeatPrompt] = useState("");
  const [isAnalyzingBeat, setIsAnalyzingBeat] = useState(false);
  const [aiBeatAnalysisData, setAiBeatAnalysisData] = useState<any>(null);
  const [isGeneratingAiBeat, setIsGeneratingAiBeat] = useState(false);

  const [activeScrollBeatId, setActiveScrollBeatId] = useState<string | null>(null);
  

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

    if (DONE_WRITING_STATUSES.includes(selectedChapter.status) && !selectedChapter.final_content) {
      // Nếu chương đã hoàn thiện, không cần tải beats nữa, chuyển qua tải final_content
      setBeats([]);
      fetch(`http://localhost:8765/api/chapters/${selectedChapter.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setSelectedChapter((prev: any) => ({ ...prev, final_content: data.data.final_content }));
          }
        });
      return;
    } else if (!DONE_WRITING_STATUSES.includes(selectedChapter.status)) {
      setLoadingBeats(true);
      fetch(`http://localhost:8765/api/chapters/${selectedChapter.id}/beats`)
        .then(res => res.json())
        .then(data => {
          if (data.success) setBeats(data.data);
        })
        .finally(() => setLoadingBeats(false));
    }
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

  // Hàm bấm vào mục lục để cuộn tới Beat
  const scrollToBeat = (beatId: string) => {
    const element = document.getElementById(`beat-card-${beatId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Logic tự động bôi đậm Mục lục khi cuộn chuột
  // 2. Logic tự động bôi đậm Mục lục khi cuộn chuột (ĐÃ FIX LỖI LỆCH ITEM)
  useEffect(() => {
    if (beats.length === 0) return;

    // Lưu trữ tỷ lệ hiển thị của tất cả các Beat hiện tại
    const visibleRatios: Record<string, number> = {};

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const id = entry.target.id.replace("beat-card-", "");
          
          if (entry.isIntersecting) {
            // Lưu lại % diện tích Beat đó đang chiếm trên màn hình
            visibleRatios[id] = entry.intersectionRatio;
          } else {
            // Nếu khuất khỏi màn hình thì xóa đi
            delete visibleRatios[id];
          }
        });

        // Nếu có Beat nào đang hiển thị
        const visibleIds = Object.keys(visibleRatios);
        if (visibleIds.length > 0) {
          // Lấy cái ID nào đang có intersectionRatio lớn nhất (Tức là đang chiếm phần lớn màn hình)
          const mostVisibleId = visibleIds.reduce((a, b) => 
            visibleRatios[a] > visibleRatios[b] ? a : b
          );
          
          setActiveScrollBeatId(mostVisibleId);
        }
      },
      { 
        // rootMargin: Mở rộng vùng quan sát lên xuống một chút để không bị lỡ nhịp khi Card quá dài
        rootMargin: "-10% 0px -10% 0px", 
        // threshold: Tạo nhiều điểm trigger (từ 0% đến 100%) để observer liên tục bắn event khi cuộn
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1.0] 
      }
    );

    // Bắt đầu theo dõi tất cả các Beat
    beats.forEach((b) => {
      const el = document.getElementById(`beat-card-${b.id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [beats]);

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

  const openAiBeatModal = (index: number) => {
    setTargetBeatIndex(index);
    setUserBeatPrompt("");
    setAiBeatStep(1);
    setAiBeatAnalysisData(null);
    setIsAiBeatModalOpen(true);
  };

  const analyzeAiBeatIdea = async () => {
    if (!userBeatPrompt.trim()) return alert("Vui lòng nhập ý tưởng!");
    setIsAnalyzingBeat(true);
    try {
      const beatId = beats[targetBeatIndex].id;
      const currentText = beats[targetBeatIndex].ai_draft_text || "";
      
      const res = await fetch(`http://localhost:8765/api/beats/${beatId}/analyze-text-idea`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_prompt: userBeatPrompt, current_text: currentText })
      });
      const result = await res.json();
      if (result.success) {
        setAiBeatAnalysisData(result.data);
        setAiBeatStep(2);
      } else alert("Lỗi phân tích: " + result.detail);
    } catch (e) { alert("Mất kết nối Backend."); } 
    finally { setIsAnalyzingBeat(false); }
  };

  const generateFinalAiBeat = async (finalPromptToUse: string) => {
    if (!finalPromptToUse || finalPromptToUse.trim() === "") return;
    setIsGeneratingAiBeat(true);
    try {
      const beatId = beats[targetBeatIndex].id;
      const currentText = beats[targetBeatIndex].ai_draft_text || "";

      const res = await fetch(`http://localhost:8765/api/beats/${beatId}/edit-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_prompt: finalPromptToUse, current_text: currentText })
      });
      const result = await res.json();
      
      if (result.success) {
        // Ghi đè văn bản mới vào State, kích hoạt cờ Lưu
        const newBeats = [...beats];
        newBeats[targetBeatIndex].ai_draft_text = result.text;
        setBeats(newBeats);
        setIsBeatsDirty(true); // Bật thanh Save dưới đáy
        
        setIsAiBeatModalOpen(false);
      } else alert("Lỗi sửa đoạn văn: " + result.detail);
    } catch (e) { alert("Mất kết nối Backend."); } 
    finally { setIsGeneratingAiBeat(false); }
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
              {/* Header Chương & Cấu trúc nâng cao */}
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-slate-800">{selectedChapter.title}</h1>
                <p className="text-slate-600 mt-1 font-medium"><span className="font-bold text-slate-800">Sự kiện chính:</span> {selectedChapter.main_event}</p>
                
                <div className="flex gap-4 mt-2">
                  <p className="text-sm font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded border border-orange-100">{selectedChapter.primary_function}</p>
                  <p className="text-sm font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded border border-green-100">Góc nhìn: {selectedChapter.pov_character}</p>
                  <p className="text-sm font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{selectedChapter.timeline_period || "Hiện tại"}</p>
                </div>

                {/* BẢNG KIM CHỈ NAM CẢM XÚC (Chỉ hiện nếu có dữ liệu) */}
                {(selectedChapter.emotional_beat || selectedChapter.relationship_beat || selectedChapter.chapter_hook) && (
                  <div className="mt-4 p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-4">
                    {selectedChapter.emotional_beat && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-indigo-500 tracking-wider">Cảm xúc</span>
                        <p className="text-xs text-slate-700 leading-relaxed">{selectedChapter.emotional_beat}</p>
                      </div>
                    )}
                    {selectedChapter.relationship_beat && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-pink-500 tracking-wider">Quan hệ</span>
                        <p className="text-xs text-slate-700 leading-relaxed">{selectedChapter.relationship_beat}</p>
                      </div>
                    )}
                    {selectedChapter.chapter_hook && (
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-amber-500 tracking-wider">Điểm neo (Hook)</span>
                        <p className="text-xs text-slate-700 leading-relaxed">{selectedChapter.chapter_hook}</p>
                      </div>
                    )}
                  </div>
                )}
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

            {/* KHU VỰC CUỘN CHÍNH (Đã sửa thành flex để chia cột) */}
            <div className="flex-1 p-6 overflow-y-auto pb-32 bg-slate-50/50 flex justify-center items-start gap-8 relative"> 
              
              {/* CỘT TRÁI: DANH SÁCH BEATS (Width 4xl) */}
              <div className="w-full max-w-4xl space-y-8">
                
                {/* TRƯỜNG HỢP 1: CHƯƠNG ĐÃ HOÀN THÀNH BIÊN TẬP */}
                {DONE_WRITING_STATUSES.includes(selectedChapter.status) ? (
                  // ... (Giữ nguyên toàn bộ code cũ của phần Chương Đã Hoàn Thành)
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
                        <Textarea 
                            className="min-h-[600px] resize-y text-lg leading-loose font-serif p-8 bg-[#fdfbf7] border-0 focus-visible:ring-0 text-slate-800"
                            placeholder="Bản thảo cuối cùng sẽ hiển thị ở đây..."
                            value={selectedChapter.final_content || ""}
                            onChange={(e) => handleFinalTextChange(e.target.value)}
                         />
                      </CardContent>
                    </Card>

                    <div className="flex justify-between items-center pt-4 border-t border-slate-200 mt-6">
                      <Button variant="outline" onClick={goToPrevChapter} disabled={currentChapterIndex <= 0} className="text-slate-600">Chương Trước</Button>
                      <Button onClick={() => router.push(`/project/${projectId}/studio`)} className="bg-indigo-600 hover:bg-indigo-700 shadow-sm px-8">Vào Studio Sản Xuất</Button>
                      <Button variant="outline" onClick={goToNextChapter} disabled={currentChapterIndex >= chapters.length - 1} className="text-slate-600">Chương Tiếp</Button>
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
                        // GẮN THÊM ID VÀO THẺ CARD ĐỂ LÀM MỐC CUỘN
                        <Card id={`beat-card-${beat.id}`} key={beat.id} className="border-slate-200 shadow-sm scroll-mt-6">
                          
                          {/* Toàn bộ nội dung của Card (CardHeader, Kịch bản, Textarea...) bọc y hệt code hiện tại của bạn */}
                          <CardHeader className="bg-slate-50 border-b py-3">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <CardTitle className="text-base text-slate-700 font-bold">{beat.beat_id}</CardTitle>
                                <span className="text-xs bg-slate-200 text-slate-700 px-2 py-1 rounded-full">{beat.location}</span>
                              </div>
                              <Button variant="outline" size="sm" onClick={() => openAiBeatModal(index)} disabled={batchDrafting || refining} className="h-7 text-xs border-amber-200 text-amber-600 hover:bg-amber-50">
                                <Sparkles className="mr-1 h-3 w-3"/> Sửa Kịch Bản Cảnh
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="p-0">
                            
                            {/* KHỐI CODE TÁCH CHUỖI CỦA BẠN (Giữ nguyên) */}
                            <div className="bg-slate-50/50 border-b border-slate-200 flex flex-col text-sm">
                              {(() => {
                                const [actionPart = "", dialoguePart = ""] = (beat.action_and_dialogue || "").split(/Dialogue:\s*/i);
                                const action = actionPart.replace(/^Action:\s*/i, "").trim();
                                const dialogue = dialoguePart.replace(/^Dialogue:\s*/i, "").trim();

                                return (
                                  <>
                                    {/* PHẦN 1: HÀNH ĐỘNG VÀ ĐẠO CỤ */}
                                    {action && (() => {
                                      const [mainAction = "", props = ""] = action.split(/(?:Đạo cụ|Props)\s*:/i);
                                      return (
                                        <>
                                          <div className="flex items-start gap-3 p-4 border-b border-slate-100">
                                            <div className="mt-0.5 p-1.5 bg-blue-100 rounded-md text-blue-600 shadow-sm"><Camera className="w-4 h-4" /></div>
                                            <div>
                                              <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wider block mb-1">Hành động & Góc máy</span>
                                              <p className="text-slate-600 text-sm leading-relaxed">{mainAction || "Không có mô tả hành động."}</p>
                                            </div>
                                          </div>
                                          {props && props.toLowerCase() !== "không" && props.toLowerCase() !== "none" && (
                                            <div className="flex items-start gap-3 p-4 border-b border-slate-100 bg-indigo-50/30">
                                              <div className="mt-0.5 px-2 py-1 bg-slate-700 rounded text-slate-100 text-[10px] font-bold shadow-sm uppercase tracking-wider">Đạo cụ</div>
                                              <div><p className="text-indigo-700 font-medium text-sm leading-relaxed border-l-2 border-indigo-300 pl-3">{props}</p></div>
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}

                                    {/* PHẦN 2 & 3: THOẠI VÀ ẨN Ý (SUBTEXT) */}
                                    {dialogue && (() => {
                                      const [spokenDialogue = "", subtext = ""] = dialogue.split(/(?:Ẩn ý|Subtext)\s*:/i);
                                      return (
                                        <>
                                          <div className="flex items-start gap-3 p-4 border-b border-slate-100">
                                            <div className="mt-0.5 p-1.5 bg-emerald-100 rounded-md text-emerald-600 shadow-sm"><MessageSquare className="w-4 h-4" /></div>
                                            <div>
                                              <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wider block mb-1">Nội dung Thoại</span>
                                              <p className="text-slate-600 text-sm leading-relaxed">{spokenDialogue || "Không có thoại."}</p>
                                            </div>
                                          </div>
                                          {subtext && (
                                            <div className="flex items-start gap-3 p-4 border-b border-slate-100 bg-emerald-50/30">
                                              <div className="mt-0.5 px-2 py-1 bg-slate-800 rounded text-slate-100 text-[10px] font-bold shadow-sm uppercase tracking-wider">Ẩn ý</div>
                                              <div><p className="text-emerald-700 font-medium text-sm leading-relaxed italic border-l-2 border-emerald-300 pl-3">"{subtext}"</p></div>
                                            </div>
                                          )}
                                        </>
                                      );
                                    })()}

                                    {/* PHẦN 3: MỤC TIÊU CẢM XÚC */}
                                    {beat.emotional_shift && (
                                      <div className="flex items-start gap-3 p-4 bg-amber-50/50">
                                        <div className="mt-0.5 p-1.5 bg-rose-100 rounded-md text-rose-500 shadow-sm"><HeartPulse className="w-4 h-4" /></div>
                                        <div>
                                          <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wider block mb-1">Mục tiêu Cảm xúc</span>
                                          <p className="text-slate-600 text-sm leading-relaxed font-medium">{beat.emotional_shift}</p>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
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
                                <div className="flex justify-end pt-2 gap-2">
                                  {beat.ai_draft_text && beat.ai_draft_text.trim() !== "" && (
                                    <Button variant="outline" size="sm" onClick={() => {
                                      setTargetBeatIndex(index);
                                      setUserBeatPrompt("");
                                      setAiBeatStep(1);
                                      setAiBeatAnalysisData(null);
                                      setIsAiBeatModalOpen(true); // Mở Modal Edit Text (Lúc nãy viết lộn tên hàm)
                                    }} disabled={draftingBeatId === beat.id || batchDrafting || refining} className="border-amber-200 text-amber-700 hover:bg-amber-50">
                                      <Sparkles className="mr-2 h-4 w-4"/> AI Sửa Đoạn Này
                                    </Button>
                                  )}
                                  <Button variant="outline" size="sm" onClick={() => handleDraftBeat(beat.id, index)} disabled={draftingBeatId === beat.id || batchDrafting || refining} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
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

              {/* ========================================= */}
              {/* CỘT PHẢI: MỤC LỤC BEAT (TOC) NEO CỐ ĐỊNH */}
              {/* ========================================= */}
              {beats.length > 0 && !DONE_WRITING_STATUSES.includes(selectedChapter.status) && (
                <div className="hidden xl:block sticky top-0 w-56 shrink-0 pt-2 transition-opacity duration-300">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <List className="h-4 w-4"/> Mục lục Nhịp truyện
                  </h3>
                  
                  <div className="flex flex-col gap-1 border-l-2 border-slate-200 pl-3 relative">
                    {beats.map((beat) => {
                      const isActive = activeScrollBeatId === beat.id;
                      return (
                        <button
                          key={beat.id}
                          onClick={() => scrollToBeat(beat.id)}
                          className={`text-left text-sm py-2 px-3 rounded-lg transition-all duration-200 ease-in-out group
                            ${isActive 
                              ? 'bg-indigo-100 text-indigo-700 font-bold -ml-[14px] border-l-4 border-indigo-600 pl-[14px] shadow-sm' 
                              : 'text-slate-500 font-medium hover:bg-slate-200 hover:text-slate-800'
                            }`}
                        >
                          <span className="block">{beat.beat_id}</span>
                          <span className={`block text-[10px] truncate mt-0.5 transition-colors ${isActive ? 'text-indigo-500 font-medium' : 'text-slate-400 font-normal group-hover:text-slate-500'}`}>
                            {beat.location}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
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
      {/* MODAL AI SỬA CẢNH (BEAT) - 2 STEP WIZARD */}
      <Dialog open={isAiBeatModalOpen} onOpenChange={setIsAiBeatModalOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-600" />
              Sửa nội dung văn bản: {beats[targetBeatIndex]?.beat_id}
            </DialogTitle>
          </DialogHeader>

          {aiBeatStep === 1 ? (
            <div className="grid gap-4 py-4">
              <p className="text-sm text-slate-500">
                Hãy cho Biên tập viên AI biết bạn muốn thay đổi cảnh này như thế nào (VD: Đổi địa điểm, thêm đạo cụ, làm cho cuộc cãi vã gay gắt hơn...)
              </p>
              <Textarea 
                placeholder="VD: Cho nam chính vô tình làm rơi chiếc nhẫn khi đang nói chuyện..."
                value={userBeatPrompt}
                onChange={(e) => setUserBeatPrompt(e.target.value)}
                className="resize-none h-32 focus-visible:ring-amber-500"
              />
              <div className="flex justify-end mt-2">
                <Button onClick={analyzeAiBeatIdea} disabled={isAnalyzingBeat || !userBeatPrompt} className="bg-amber-600 hover:bg-amber-700">
                  {isAnalyzingBeat ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Activity className="h-4 w-4 mr-2"/>}
                  Biên tập viên Phân tích
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-2 space-y-4">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="bg-white text-amber-700 border-amber-300">Logic: {aiBeatAnalysisData?.feasibility_score}/10</Badge>
                  <span className="font-bold text-sm text-amber-800">Góp ý từ Biên tập viên AI:</span>
                </div>
                <p className="text-sm text-slate-700 italic">"{aiBeatAnalysisData?.critique}"</p>
              </div>

              <div className="space-y-3 mt-4">
                <p className="text-sm font-semibold text-slate-800">Chọn phương án chốt kịch bản:</p>
                
                <div 
                  className="border border-amber-200 bg-amber-50/30 p-3 rounded-lg hover:bg-amber-50 cursor-pointer transition-colors" 
                  onClick={() => generateFinalAiBeat(aiBeatAnalysisData?.suggested_prompt || "")}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-amber-700 uppercase">✨ Đề xuất của Biên tập viên (Khuyên dùng)</span>
                  </div>
                  <p className="text-xs text-slate-600">{aiBeatAnalysisData?.suggested_prompt}</p>
                </div>

                <div 
                  className="border border-slate-200 p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors" 
                  onClick={() => generateFinalAiBeat(userBeatPrompt)}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-slate-500 uppercase">Ý tưởng gốc của bạn</span>
                  </div>
                  <p className="text-xs text-slate-400">{userBeatPrompt}</p>
                </div>
              </div>
              
              {isGeneratingAiBeat && (
                <div className="flex items-center justify-center text-amber-600 mt-4 text-sm font-medium">
                  <Loader2 className="h-4 w-4 animate-spin mr-2"/> Đang cấu trúc lại cảnh này...
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, BookOpen, Layers, ArrowRight, Save, X, Wand2, Map, Sparkles } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


/* ------------------------------------------------------------------ */
/* Helpers: immutable deep-set + small reusable field components       */
/* ------------------------------------------------------------------ */

// Immutably set a value at an arbitrary path (supports object keys and array indices)
function setDeep(obj: any, path: (string | number)[], value: any): any {
  if (path.length === 0) return value;
  const [key, ...rest] = path;
  const isArr = Array.isArray(obj);
  const clone: any = isArr ? [...obj] : { ...(obj || {}) };
  const nextDefault = typeof rest[0] === "number" ? [] : {};
  clone[key as any] = setDeep(clone[key as any] ?? nextDefault, rest, value);
  return clone;
}

function TextField({ label, value, onChange, type = "text", placeholder }: any) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function TextAreaField({ label, value, onChange, rows = 3, placeholder }: any) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Textarea value={value ?? ""} placeholder={placeholder} rows={rows} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ArrayTextareaField({ label, value, onChange, rows = 3, placeholder }: any) {
  const safeValue = value || [];
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Textarea
        value={safeValue.join("\n")}
        placeholder={placeholder}
        rows={rows}
        onChange={(e) => onChange(e.target.value.split("\n"))}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Default shapes used when adding new characters / relationships      */
/* ------------------------------------------------------------------ */

const emptyCharacter = {
  name: "",
  age: "",
  role_in_story: "",
  relationship_to_protagonist: "",
  appearance: "",
  fear: "",
  motivation: "",
  emotional_need: "",
  living_situation: "",
  career_and_financial_status: "",
  external_pressure: "",
  internal_conflict: "",
  secrets_or_insecurities: "",
  habits: [] as string[],
  personality: { flaw: "", strength: "", core_traits: [] as string[] },
  character_arc: {
    starting_belief: "",
    false_belief: "",
    truth_they_learn: "",
    ending_state: "",
  },
};

const emptyRelationship = {
  between: ["", ""] as string[],
  current_relationship: "",
  relationship_arc: "",
  bonding_mechanism: "",
  source_of_tension: "",
  unspoken_issue: "",
  what_a_needs_from_b: "",
  what_b_needs_from_a: "",
  physical_intimacy_arc: "",
};

const PRIMARY_FUNCTIONS = [
  "Setup (Thiết lập cơ bản)",
  "Inciting Incident (Biến cố kích hoạt)",
  "Character Development (Phát triển nhân vật)",
  "Relationship Development (Phát triển quan hệ)",
  "Rising Action (Leo thang xung đột)",
  "Turning Point (Bước ngoặt)",
  "Midpoint (Điểm giữa)",
  "Climax (Cao trào)",
  "Resolution (Giải quyết)",
  "Lore (Hé lộ thông tin thế giới/bí mật)",
  "Khác (Chức năng phụ trợ)" // Fallback cho những logic cũ hoặc AI lỡ sinh lệch
];

export default function ArchitecturePage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  // States
  const [bibleLoading, setBibleLoading] = useState(false);
  const [bibleData, setBibleData] = useState<any>(null);
  const [bibleStatus, setBibleStatus] = useState<"pending" | "done">("pending");
  
  const [pacingLoading, setPacingLoading] = useState(false);
  const [chapters, setChapters] = useState<any[]>([]);
  const [pacingStatus, setPacingStatus] = useState<"pending" | "done">("pending");

  // === THÊM STATE CHO CHARACTER ===
  const [isAiCharModalOpen, setIsAiCharModalOpen] = useState(false);
  const [aiCharPrompt, setAiCharPrompt] = useState("");
  const [isGeneratingChar, setIsGeneratingChar] = useState(false);

  // === THÊM STATE CHO RELATIONSHIP ===
  const [isAiRelModalOpen, setIsAiRelModalOpen] = useState(false);
  const [aiRelPrompt, setAiRelPrompt] = useState("");
  const [isGeneratingRel, setIsGeneratingRel] = useState(false);

  // STATE THEO DÕI THAY ĐỔI CHƯA LƯU (IS DIRTY)
  const [isBibleDirty, setIsBibleDirty] = useState(false);
  const [isPacingDirty, setIsPacingDirty] = useState(false);

  // === THÊM STATE CHO AI CHAPTER ===
  const [isAiChapModalOpen, setIsAiChapModalOpen] = useState(false);
  const [aiChapAction, setAiChapAction] = useState<"insert" | "edit">("insert");
  const [targetChapIndex, setTargetChapIndex] = useState(0);
  const [aiChapPrompt, setAiChapPrompt] = useState("");
  const [isGeneratingAiChap, setIsGeneratingAiChap] = useState(false);

  const [isSavingBibleChanges, setIsSavingBibleChanges] = useState(false);
  const [isSavingPacingChanges, setIsSavingPacingChanges] = useState(false);

  useEffect(() => {
    fetch(`http://localhost:8765/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          if (data.data.story_bible) {
            setBibleData(data.data.story_bible);
            setBibleStatus("done");
          }
        }
      });
    fetchChapters();
  }, [projectId]);

  const fetchChapters = async () => {
    fetch(`http://localhost:8765/api/projects/${projectId}/chapters`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data.length > 0) {
          setChapters(data.data);
          setPacingStatus("done");
        }
      });
  };

  // 1. HÀM LƯU RIÊNG CHO STORY BIBLE
  const handleSaveBible = async () => {
    setIsSavingBibleChanges(true);
    try {
      await fetch(`http://localhost:8765/api/projects/${projectId}/update-bible`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story_bible: bibleData }),
      });
      setIsBibleDirty(false); // Tắt cờ
    } catch (e) {
      alert("Lỗi khi lưu Story Bible.");
    } finally {
      setIsSavingBibleChanges(false);
    }
  };

  // THÊM CHƯƠNG MỚI (Tại vị trí index)
  const addChapterAt = (index: number) => {
    const newChaps = [...chapters];
    // Chèn 1 object rỗng (chưa có ID) vào vị trí index
    newChaps.splice(index, 0, {
      temp_id: crypto.randomUUID(),
      chapter_number: 0, // Sẽ được đánh số lại ở hàm recalculate
      title: "Chương mới",
      timeline_period: "Hiện tại",
      pov_character: "Chưa xác định",
      main_event: "",
      primary_function: "Setup (Thiết lập cơ bản)" // Thay đổi mặc định cho chuẩn với hệ thống mới
    });
    
    // Đánh lại số thứ tự
    const renumberedChaps = newChaps.map((c, i) => ({ ...c, chapter_number: i + 1 }));
    
    setChapters(renumberedChaps);
    setIsPacingDirty(true);
  };

  // XÓA CHƯƠNG
  const removeChapter = (index: number) => {
    const confirm = window.confirm("Bạn có chắc muốn xóa chương này không? Dữ liệu bản nháp (nếu có) sẽ bị mất.");
    if (!confirm) return;
    
    const newChaps = [...chapters];
    newChaps.splice(index, 1);
    
    // Đánh lại số thứ tự
    const renumberedChaps = newChaps.map((c, i) => ({ ...c, chapter_number: i + 1 }));
    
    setChapters(renumberedChaps);
    setIsPacingDirty(true);
  };

  // CẬP NHẬT TRƯỜNG DỮ LIỆU CỦA CHƯƠNG
  const updateChapterField = (index: number, field: string, value: string) => {
    const newChaps = [...chapters];
    newChaps[index][field] = value;
    setChapters(newChaps);
    setIsPacingDirty(true);
  };

  // HÀM SAVE PACING MỚI (Gửi nguyên mảng)
  const handleSavePacing = async () => {
    setIsSavingPacingChanges(true);
    try {
      await fetch(`http://localhost:8765/api/projects/${projectId}/bulk-update-chapters`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapters: chapters })
      });
      setIsPacingDirty(false);
      // Tải lại danh sách để lấy ID mới do Supabase cấp cho các chương vừa tạo
      fetchChapters(); 
    } catch (e) {
      alert("Lỗi khi lưu Pacing.");
    } finally {
      setIsSavingPacingChanges(false);
    }
  };

  // Hàm gọi API tạo Story Bible
  const generateBible = async () => {
    setBibleLoading(true);
    try {
      const response = await fetch(`http://localhost:8765/api/projects/${projectId}/generate-bible`, {
        method: "POST",
      });
      const result = await response.json();

      if (result.success) {
        setBibleData(result.data);
        setBibleStatus("done");
      } else {
        alert("Lỗi: " + result.detail);
      }
    } catch (error) {
      console.error(error);
      alert("Lỗi kết nối Backend.");
    } finally {
      setBibleLoading(false);
    }
  };

  // Hàm gọi API tạo Pacing (Tự động chẻ chapter vào DB)
  const generatePacing = async () => {
    setPacingLoading(true);
    try {
      const response = await fetch(`http://localhost:8765/api/projects/${projectId}/generate-pacing`, {
        method: "POST",
      });
      const result = await response.json();

      if (result.success) {
        alert(result.message);
        await fetchChapters(); // Tải dữ liệu thật từ Supabase
        setPacingStatus("done");
      } else {
        alert("Lỗi từ server: " + result.detail);
      }
    } catch (error) {
      console.error(error);
      alert("Lỗi tạo Pacing.");
    } finally {
      setPacingLoading(false);
    }
  };

  // 3. SỬA HÀM UPDATE DATA ĐỂ BẬT ĐÚNG CỜ
  const updateBible = (path: (string | number)[], value: any) => {
    setBibleData((prev: any) => setDeep(prev ?? {}, path, value));
    setIsBibleDirty(true); // Chỉ bật cờ Bible
  };

  const updateChapterGoal = (index: number, newGoal: string) => {
    const newChaps = [...chapters];
    newChaps[index].goal = newGoal;
    setChapters(newChaps);
    setIsPacingDirty(true); // Chỉ bật cờ Pacing
  };

  const addCharacter = () => {
    const newData = {
      ...bibleData,
      characters: [...(bibleData?.characters || []), { ...emptyCharacter }],
    };
    setBibleData(newData);
    handleSaveBible();
  };

  const removeCharacter = (index: number) => {
    const newChars = [...(bibleData?.characters || [])];
    newChars.splice(index, 1);
    const newData = { ...bibleData, characters: newChars };
    setBibleData(newData);
    handleSaveBible();
  };

  const addRelationship = () => {
    const newData = {
      ...bibleData,
      relationship_dynamics: [...(bibleData?.relationship_dynamics || []), { ...emptyRelationship }],
    };
    setBibleData(newData);
    handleSaveBible();
  };

  const removeRelationship = (index: number) => {
    const newRels = [...(bibleData?.relationship_dynamics || [])];
    newRels.splice(index, 1);
    const newData = { ...bibleData, relationship_dynamics: newRels };
    setBibleData(newData);
    handleSaveBible();
  };

  
  const generateAiCharacter = async () => {
    if (!aiCharPrompt.trim()) return alert("Vui lòng nhập mô tả nhân vật!");
    
    setIsGeneratingChar(true);
    try {
      const res = await fetch(`http://localhost:8765/api/projects/${projectId}/generate-character`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_prompt: aiCharPrompt,
          current_bible: bibleData // Đưa Bible hiện tại lên làm context
        })
      });
      const result = await res.json();
      
      if (result.success) {
        // Chèn nhân vật mới vào list và tự động Bật cờ Dirty
        const newData = {
          ...bibleData,
          characters: [...(bibleData?.characters || []), result.data],
        };
        setBibleData(newData);
        setIsBibleDirty(true);
        
        // Đóng modal và reset
        setIsAiCharModalOpen(false);
        setAiCharPrompt("");
      } else {
        alert("Lỗi tạo nhân vật: " + result.detail);
      }
    } catch (e) {
      alert("Mất kết nối Backend.");
    } finally {
      setIsGeneratingChar(false);
    }
  };


  const generateAiRelationship = async () => {
    if (!aiRelPrompt.trim()) return alert("Vui lòng nhập mô tả mối quan hệ!");
    
    setIsGeneratingRel(true);
    try {
      const res = await fetch(`http://localhost:8765/api/projects/${projectId}/generate-relationship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_prompt: aiRelPrompt,
          current_bible: bibleData // Truyền cả Bible lên
        })
      });
      const result = await res.json();
      
      if (result.success) {
        // Chèn vào list và bật cờ Dirty
        const newData = {
          ...bibleData,
          relationship_dynamics: [...(bibleData?.relationship_dynamics || []), result.data],
        };
        setBibleData(newData);
        setIsBibleDirty(true);
        
        // Đóng modal và reset
        setIsAiRelModalOpen(false);
        setAiRelPrompt("");
      } else {
        alert("Lỗi tạo quan hệ: " + result.detail);
      }
    } catch (e) {
      alert("Mất kết nối Backend.");
    } finally {
      setIsGeneratingRel(false);
    }
  };


  const handleAiChapterSubmit = async () => {
    if (!aiChapPrompt.trim()) return alert("Vui lòng nhập yêu cầu cho AI!");
    
    setIsGeneratingAiChap(true);
    try {
      const res = await fetch(`http://localhost:8765/api/projects/${projectId}/generate-single-chapter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_type: aiChapAction,
          target_index: targetChapIndex,
          user_prompt: aiChapPrompt,
          current_chapters: chapters
        })
      });
      const result = await res.json();
      
      if (result.success) {
        const newChapterData = result.data;
        const newChaps = [...chapters];
        
        if (aiChapAction === "insert") {
          // Chèn vào vị trí index
          newChaps.splice(targetChapIndex, 0, {
            ...newChapterData,
            temp_id: crypto.randomUUID() // <-- THÊM DÒNG NÀY
          });
        } else {
          // Chép đè id cũ để không bị mất liên kết DB, chỉ đè nội dung mới
          newChaps[targetChapIndex] = { ...newChaps[targetChapIndex], ...newChapterData };
        }
        
        // Đánh lại số thứ tự
        const renumberedChaps = newChaps.map((c, i) => ({ ...c, chapter_number: i + 1 }));
        setChapters(renumberedChaps);
        setIsPacingDirty(true);
        
        setIsAiChapModalOpen(false);
        setAiChapPrompt("");
      } else {
        alert("Lỗi tạo chương: " + result.detail);
      }
    } catch (e) {
      alert("Mất kết nối Backend.");
    } finally {
      setIsGeneratingAiChap(false);
    }
  };

  const openAiChapModal = (action: "insert" | "edit", index: number) => {
    setAiChapAction(action);
    setTargetChapIndex(index);
    setAiChapPrompt("");
    setIsAiChapModalOpen(true);
  };

  return (
    <div className="bg-slate-50 p-6 pb-24 relative"> 
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Thiết kế Cấu trúc Truyện</h1>
            <p className="text-slate-500">ID Dự án: <span className="font-mono text-xs">{projectId}</span></p>
          </div>
          {pacingStatus === "done" && !isPacingDirty && !isBibleDirty && (
            <Button size="lg" className="bg-green-600 hover:bg-green-700 shadow-md" onClick={() => router.push(`/project/${projectId}/writer-room`)}>
              Vào Lò Luyện Chữ <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>

        {/* THIẾT KẾ TABS (THAY THẾ CHIA CỘT) */}
        <Tabs defaultValue="bible" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6 h-12 bg-slate-200">
            <TabsTrigger value="bible" className="text-base data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <BookOpen className="h-4 w-4 mr-2" /> DNA Câu Chuyện
            </TabsTrigger>
            <TabsTrigger value="pacing" disabled={bibleStatus === "pending"} className="text-base data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Layers className="h-4 w-4 mr-2" /> Khung Chương (Pacing)
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: STORY BIBLE */}
          <TabsContent value="bible">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-white border-b pb-4 flex flex-row items-center justify-between">
                <CardTitle>Hồ Sơ Thế Giới & Nhân Vật</CardTitle>
                {bibleStatus === "pending" && (
                  <Button onClick={generateBible} disabled={bibleLoading}>
                    {bibleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "AI Sinh Story Bible"}
                  </Button>
                )}
              </CardHeader>
              
              <CardContent className="p-0">
                <Accordion multiple={true} className="w-full">
                  {/* 1. NHẬN DIỆN & CỐT LÕI */}
                  <AccordionItem value="item-1" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Nhận diện & Cốt lõi (Story Identity)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <TextField
                        label="Tiêu đề (Title)"
                        value={bibleData?.story_identity?.title}
                        onChange={(v: any) => updateBible(["story_identity", "title"], v)}
                      />
                      <TextField
                        label="Vibe / Tông truyện"
                        value={bibleData?.story_identity?.vibe}
                        onChange={(v: any) => updateBible(["story_identity", "vibe"], v)}
                      />
                      <TextAreaField
                        label="Tiền đề (Core Premise)"
                        value={bibleData?.story_identity?.core_premise}
                        onChange={(v: any) => updateBible(["story_identity", "core_premise"], v)}
                        rows={4}
                      />
                      <TextAreaField
                        label="Động cơ truyện (Story Engine)"
                        value={bibleData?.story_identity?.story_engine}
                        onChange={(v: any) => updateBible(["story_identity", "story_engine"], v)}
                        rows={3}
                      />
                      <TextAreaField
                        label="Chủ đề trung tâm (Central Theme)"
                        value={bibleData?.story_identity?.central_theme}
                        onChange={(v: any) => updateBible(["story_identity", "central_theme"], v)}
                        rows={2}
                      />
                      <ArrayTextareaField
                        label="Chủ đề phụ (Sub Themes)"
                        value={bibleData?.story_identity?.sub_themes}
                        onChange={(v: any) => updateBible(["story_identity", "sub_themes"], v)}
                      />
                      <TextAreaField
                        label="Cảm xúc hứa hẹn (Emotional Promise)"
                        value={bibleData?.story_identity?.emotional_promise}
                        onChange={(v: any) => updateBible(["story_identity", "emotional_promise"], v)}
                        rows={2}
                      />
                      <TextField
                        label="Cấu trúc Thời gian (Timeline Structure)"
                        value={bibleData?.story_identity?.timeline_structure}
                        onChange={(v: any) => updateBible(["story_identity", "timeline_structure"], v)}
                      />
                      <TextAreaField
                        label="Câu hỏi cảm xúc mà câu chuyện muốn đặt ra (Thematic Question)"
                        value={bibleData?.story_identity?.thematic_question}
                        onChange={(v: any) => updateBible(["story_identity", "thematic_question"], v)}
                        rows={2}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* 2. NHÂN VẬT */}
                  <AccordionItem value="item-2" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Hệ thống Nhân vật
                    </AccordionTrigger>
                    <AccordionContent className="space-y-6 pt-2">
                      {(bibleData?.characters || []).map((char: any, index: number) => (
                        <div key={index} className="p-4 bg-slate-50 border rounded-md space-y-4 relative">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="absolute top-3 right-3"
                            onClick={() => removeCharacter(index)}
                          >
                            Xoá
                          </Button>

                          <div className="flex gap-4">
                            <div className="flex-1">
                              <TextField
                                label="Tên nhân vật"
                                value={char.name}
                                onChange={(v: any) => updateBible(["characters", index, "name"], v)}
                              />
                            </div>
                            <div className="w-24">
                              <TextField
                                label="Tuổi"
                                type="number"
                                value={char.age}
                                onChange={(v: any) => updateBible(["characters", index, "age"], v)}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <TextField
                              label="Vai trò trong truyện"
                              value={char.role_in_story}
                              onChange={(v: any) => updateBible(["characters", index, "role_in_story"], v)}
                            />
                            <TextField
                              label="Quan hệ với nhân vật chính"
                              value={char.relationship_to_protagonist}
                              onChange={(v: any) =>
                                updateBible(["characters", index, "relationship_to_protagonist"], v)
                              }
                            />
                          </div>

                          <TextAreaField
                            label="Sự thay đổi qua thời gian (Timeline Evolution)"
                            placeholder="Mô tả sự thay đổi của nhân vật từ quá khứ đến hiện tại (nếu có)"
                            value={char.timeline_evolution}
                            onChange={(v: any) => updateBible(["characters", index, "timeline_evolution"], v)}
                            rows={2}
                          />

                          <TextAreaField
                            label="Ngoại hình (Appearance)"
                            value={char.appearance}
                            onChange={(v: any) => updateBible(["characters", index, "appearance"], v)}
                            rows={2}
                          />

                          <ArrayTextareaField
                            label="Thói quen (Habits)"
                            value={char.habits}
                            onChange={(v: any) => updateBible(["characters", index, "habits"], v)}
                          />

                          <div className="grid grid-cols-2 gap-4">
                            <TextField
                              label="Hoàn cảnh sống"
                              value={char.living_situation}
                              onChange={(v: any) => updateBible(["characters", index, "living_situation"], v)}
                            />
                            <TextField
                              label="Sự nghiệp & tài chính"
                              value={char.career_and_financial_status}
                              onChange={(v: any) =>
                                updateBible(["characters", index, "career_and_financial_status"], v)
                              }
                            />
                          </div>

                          <TextAreaField
                            label="Nỗi sợ (Fear)"
                            value={char.fear}
                            onChange={(v: any) => updateBible(["characters", index, "fear"], v)}
                            rows={2}
                          />
                          <TextAreaField
                            label="Động lực (Motivation)"
                            value={char.motivation}
                            onChange={(v: any) => updateBible(["characters", index, "motivation"], v)}
                            rows={2}
                          />
                          <TextAreaField
                            label="Nhu cầu cảm xúc (Emotional Need)"
                            value={char.emotional_need}
                            onChange={(v: any) => updateBible(["characters", index, "emotional_need"], v)}
                            rows={2}
                          />
                          <TextAreaField
                            label="Áp lực bên ngoài (External Pressure)"
                            value={char.external_pressure}
                            onChange={(v: any) => updateBible(["characters", index, "external_pressure"], v)}
                            rows={2}
                          />
                          <TextAreaField
                            label="Xung đột nội tâm (Internal Conflict)"
                            value={char.internal_conflict}
                            onChange={(v: any) => updateBible(["characters", index, "internal_conflict"], v)}
                            rows={2}
                          />
                          <TextAreaField
                            label="Bí mật / Tự ti (Secrets or Insecurities)"
                            value={char.secrets_or_insecurities}
                            onChange={(v: any) =>
                              updateBible(["characters", index, "secrets_or_insecurities"], v)
                            }
                            rows={2}
                          />

                          <Separator />
                          <p className="text-sm font-medium text-slate-700">Tính cách (Personality)</p>
                          <TextField
                            label="Điểm mạnh (Strength)"
                            value={char.personality?.strength}
                            onChange={(v: any) =>
                              updateBible(["characters", index, "personality", "strength"], v)
                            }
                          />
                          <TextField
                            label="Khuyết điểm (Flaw)"
                            value={char.personality?.flaw}
                            onChange={(v: any) => updateBible(["characters", index, "personality", "flaw"], v)}
                          />
                          <ArrayTextareaField
                            label="Đặc điểm cốt lõi (Core Traits)"
                            value={char.personality?.core_traits}
                            onChange={(v: any[]) =>
                              updateBible(["characters", index, "personality", "core_traits"], v)
                            }
                          />

                          <Separator />
                          <p className="text-sm font-medium text-slate-700">
                            Hành trình nhân vật (Character Arc)
                          </p>
                          <TextAreaField
                            label="Niềm tin ban đầu (Starting Belief)"
                            value={char.character_arc?.starting_belief}
                            onChange={(v: any) =>
                              updateBible(["characters", index, "character_arc", "starting_belief"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="Niềm tin sai lệch (False Belief)"
                            value={char.character_arc?.false_belief}
                            onChange={(v: any) =>
                              updateBible(["characters", index, "character_arc", "false_belief"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="Sự thật nhận ra (Truth They Learn)"
                            value={char.character_arc?.truth_they_learn}
                            onChange={(v: any) =>
                              updateBible(["characters", index, "character_arc", "truth_they_learn"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="Trạng thái kết thúc (Ending State)"
                            value={char.character_arc?.ending_state}
                            onChange={(v: any) =>
                              updateBible(["characters", index, "character_arc", "ending_state"], v)
                            }
                            rows={2}
                          />
                        </div>
                      ))}

                      <div className="flex gap-4">
                        <Button variant="outline" className="flex-1" onClick={addCharacter}>
                          + Thêm thủ công
                        </Button>
                        <Button 
                          className="flex-1 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-200" 
                          onClick={() => setIsAiCharModalOpen(true)}
                        >
                          <Wand2 className="h-4 w-4 mr-2" /> AI Sinh Nhân Vật
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* 3. BỐI CẢNH THẾ GIỚI */}
                  <AccordionItem value="item-3" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Bối cảnh Thế giới (World Building)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <TextAreaField
                        label="Bối cảnh (Setting)"
                        value={bibleData?.world_building?.setting}
                        onChange={(v: any) => updateBible(["world_building", "setting"], v)}
                        rows={3}
                      />
                      <TextAreaField
                        label="Bối cảnh Chính (Hiện tại)"
                        value={bibleData?.world_building?.primary_setting || bibleData?.world_building?.setting}
                        onChange={(v: any) => updateBible(["world_building", "primary_setting"], v)}
                        rows={2}
                      />
                      <TextAreaField
                        label="Bối cảnh Quá khứ (Nếu có Time-jump)"
                        value={bibleData?.world_building?.past_setting}
                        onChange={(v: any) => updateBible(["world_building", "past_setting"], v)}
                        rows={2}
                      />
                      <TextField
                        label="Địa điểm (Location)"
                        value={bibleData?.world_building?.location}
                        onChange={(v: any) => updateBible(["world_building", "location"], v)}
                      />
                      <TextAreaField
                        label="Đời sống thường nhật (Daily Life)"
                        value={bibleData?.world_building?.daily_life}
                        onChange={(v: any) => updateBible(["world_building", "daily_life"], v)}
                        rows={2}
                      />
                      <TextAreaField
                        label="Các mối quan hệ xã hội (Social Circles)"
                        value={bibleData?.world_building?.social_circles}
                        onChange={(v: any) => updateBible(["world_building", "social_circles"], v)}
                        rows={2}
                      />
                      <TextAreaField
                        label="Bối cảnh văn hoá (Cultural Context)"
                        value={bibleData?.world_building?.cultural_context}
                        onChange={(v: any) => updateBible(["world_building", "cultural_context"], v)}
                        rows={2}
                      />
                      <ArrayTextareaField
                        label="Áp lực kinh tế - xã hội (Socio-economic Pressures)"
                        value={bibleData?.world_building?.socio_economic_pressures}
                        onChange={(v: any) => updateBible(["world_building", "socio_economic_pressures"], v)}

                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* 4. HỆ THỐNG XUNG ĐỘT */}
                  <AccordionItem value="item-4" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Hệ thống Xung đột (Conflict System)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <TextAreaField
                        label="Xung đột trung tâm (Central Conflict)"
                        value={bibleData?.conflict_system?.central_conflict}
                        onChange={(v: any) => updateBible(["conflict_system", "central_conflict"], v)}
                        rows={3}
                      />
                      <TextAreaField
                        label="Nguồn gốc vi-xung đột (Micro-conflict Origin)"
                        value={bibleData?.conflict_system?.micro_conflict_origin}
                        onChange={(v: any) => updateBible(["conflict_system", "micro_conflict_origin"], v)}
                        rows={2}
                      />
                      <TextAreaField
                        label="Logic leo thang (Escalation Logic)"
                        value={bibleData?.conflict_system?.escalation_logic}
                        onChange={(v: any) => updateBible(["conflict_system", "escalation_logic"], v)}
                        rows={3}
                      />
                      <ArrayTextareaField
                        label="Xung đột bên ngoài (External Conflicts)"
                        value={bibleData?.conflict_system?.external_conflicts}
                        onChange={(v: any) => updateBible(["conflict_system", "external_conflicts"], v)}
                      />
                      <ArrayTextareaField
                        label="Xung đột nội tâm (Internal Conflicts)"
                        value={bibleData?.conflict_system?.internal_conflicts}
                        onChange={(v: any) => updateBible(["conflict_system", "internal_conflicts"], v)}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* 5. QUY TẮC TRẦN THUẬT */}
                  <AccordionItem value="item-5" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Quy tắc Trần thuật (Narrative Rules)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-4">
                        <TextField
                          label="Tông giọng (Tone)"
                          value={bibleData?.narrative_rules?.tone}
                          onChange={(v: any) => updateBible(["narrative_rules", "tone"], v)}
                        />
                        <TextField
                          label="Nhịp độ (Pacing)"
                          value={bibleData?.narrative_rules?.pacing}
                          onChange={(v: any) => updateBible(["narrative_rules", "pacing"], v)}
                        />
                      </div>
                      <TextAreaField
                        label="Phong cách hội thoại (Dialogue Style)"
                        value={bibleData?.narrative_rules?.dialogue_style}
                        onChange={(v: any) => updateBible(["narrative_rules", "dialogue_style"], v)}
                        rows={2}
                      />
                      <ArrayTextareaField
                        label="Quy tắc hiện thực (Realism Rules)"
                        value={bibleData?.narrative_rules?.realism_rules}
                        onChange={(v: any) => updateBible(["narrative_rules", "realism_rules"], v)}
                      />
                      <ArrayTextareaField
                        label="Quy tắc lãng mạn (Romance Rules)"
                        value={bibleData?.narrative_rules?.romance_rules}
                        onChange={(v: any) => updateBible(["narrative_rules", "romance_rules"], v)}
                      />
                      <ArrayTextareaField
                        label="Show, don't tell"
                        value={bibleData?.narrative_rules?.show_dont_tell_rules}
                        onChange={(v: any) => updateBible(["narrative_rules", "show_dont_tell_rules"], v)}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* 6. TÍNH LIÊN TỤC & RANH GIỚI */}
                  <AccordionItem value="item-6" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Tính Liên tục & Ranh giới
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-4">
                        <TextField
                          label="Tựa đề gốc (Original Seed Title)"
                          value={bibleData?.story_continuity?.original_seed_title}
                          onChange={(v: any) => updateBible(["story_continuity", "original_seed_title"], v)}
                        />
                        <TextField
                          label="Vibe gốc (Original Vibe)"
                          value={bibleData?.story_continuity?.original_vibe}
                          onChange={(v: any) => updateBible(["story_continuity", "original_vibe"], v)}
                        />
                      </div>
                      <ArrayTextareaField
                        label="Từ khoá đã tích hợp (Keywords Integrated)"
                        value={bibleData?.story_continuity?.keywords_integrated}
                        onChange={(v: any) => updateBible(["story_continuity", "keywords_integrated"], v)}
                      />
                      <ArrayTextareaField
                        label="Yếu tố cốt lõi không được thay đổi"
                        value={bibleData?.story_continuity?.core_elements_that_must_not_change}
                        onChange={(v: any) =>
                          updateBible(["story_continuity", "core_elements_that_must_not_change"], v)
                        }
                      />
                      <ArrayTextareaField
                        label="Ranh giới trần thuật (Narrative Boundaries)"
                        value={bibleData?.narrative_boundaries}
                        onChange={(v: any) => updateBible(["narrative_boundaries"], v)}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* 7. HƯỚNG DẪN THÂN MẬT */}
                  <AccordionItem value="item-7" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Hướng dẫn Thân mật (Intimacy Guidance)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="intimacy-applicable"
                          checked={!!bibleData?.intimacy_guidance?.applicable}
                          onChange={(e) => {
                            const newData = setDeep(
                              bibleData,
                              ["intimacy_guidance", "applicable"],
                              e.target.checked
                            );
                            setBibleData(newData);
                            handleSaveBible();
                          }}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <Label htmlFor="intimacy-applicable" className="cursor-pointer">
                          Có áp dụng hướng dẫn thân mật
                        </Label>
                      </div>
                      <TextAreaField
                        label="Ghi chú (Note)"
                        value={bibleData?.intimacy_guidance?.note}
                        onChange={(v: any) => updateBible(["intimacy_guidance", "note"], v)}
                        rows={2}
                      />
                      <TextAreaField
                        label="Mức độ thoải mái (Comfort Level)"
                        value={bibleData?.intimacy_guidance?.comfort_level}
                        onChange={(v: any) => updateBible(["intimacy_guidance", "comfort_level"], v)}
                        rows={2}
                      />
                      <TextAreaField
                        label="Phong cách miêu tả (Depiction Style)"
                        value={bibleData?.intimacy_guidance?.depiction_style}
                        onChange={(v: any) => updateBible(["intimacy_guidance", "depiction_style"], v)}
                        rows={2}
                      />
                      <ArrayTextareaField
                        label="Nhịp thân mật tự nhiên (Natural Intimacy Beats)"
                        value={bibleData?.intimacy_guidance?.natural_intimacy_beats}
                        onChange={(v: any) => updateBible(["intimacy_guidance", "natural_intimacy_beats"], v)}
                      />
                      <ArrayTextareaField
                        label="Quy tắc đồng thuận & nhịp độ (Consent & Pacing Rules)"
                        value={bibleData?.intimacy_guidance?.consent_and_pacing_rules}
                        onChange={(v: any) =>
                          updateBible(["intimacy_guidance", "consent_and_pacing_rules"], v)
                        }
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* 8. MỐI QUAN HỆ */}
                  <AccordionItem value="item-8" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Động lực Mối quan hệ (Relationship Dynamics)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-6 pt-2">
                      {(bibleData?.relationship_dynamics || []).map((rel: any, index: number) => (
                        <div key={index} className="p-4 bg-slate-50 border rounded-md space-y-3 relative">
                          <Button
                            variant="destructive"
                            size="sm"
                            className="absolute top-3 right-3"
                            onClick={() => removeRelationship(index)}
                          >
                            Xoá
                          </Button>

                          <div className="grid grid-cols-2 gap-4">
                            <TextField
                              label="Nhân vật A"
                              value={rel.between?.[0]}
                              onChange={(v: any) =>
                                updateBible(["relationship_dynamics", index, "between", 0], v)
                              }
                            />
                            <TextField
                              label="Nhân vật B"
                              value={rel.between?.[1]}
                              onChange={(v: any) =>
                                updateBible(["relationship_dynamics", index, "between", 1], v)
                              }
                            />
                          </div>

                          <TextField
                            label="Mối quan hệ Quá khứ (Nếu có)"
                            value={rel.past_relationship}
                            onChange={(v: any) => updateBible(["relationship_dynamics", index, "past_relationship"], v)}
                          />
                          <TextField
                            label="Mối quan hệ Hiện tại"
                            value={rel.current_relationship}
                            onChange={(v: any) => updateBible(["relationship_dynamics", index, "current_relationship"], v)}
                          />
                          <TextAreaField
                            label="Hành trình mối quan hệ (Relationship Arc)"
                            value={rel.relationship_arc}
                            onChange={(v: any) =>
                              updateBible(["relationship_dynamics", index, "relationship_arc"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="Cơ chế gắn kết (Bonding Mechanism)"
                            value={rel.bonding_mechanism}
                            onChange={(v: any) =>
                              updateBible(["relationship_dynamics", index, "bonding_mechanism"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="Nguồn căng thẳng (Source of Tension)"
                            value={rel.source_of_tension}
                            onChange={(v: any) =>
                              updateBible(["relationship_dynamics", index, "source_of_tension"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="Vấn đề chưa nói ra (Unspoken Issue)"
                            value={rel.unspoken_issue}
                            onChange={(v: any) =>
                              updateBible(["relationship_dynamics", index, "unspoken_issue"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="A cần gì từ B"
                            value={rel.what_a_needs_from_b}
                            onChange={(v: any) =>
                              updateBible(["relationship_dynamics", index, "what_a_needs_from_b"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="B cần gì từ A"
                            value={rel.what_b_needs_from_a}
                            onChange={(v: any) =>
                              updateBible(["relationship_dynamics", index, "what_b_needs_from_a"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="Hành trình thân mật thể xác (Physical Intimacy Arc)"
                            value={rel.physical_intimacy_arc}
                            onChange={(v: any) =>
                              updateBible(["relationship_dynamics", index, "physical_intimacy_arc"], v)
                            }
                            rows={2}
                          />
                        </div>
                      ))}

                      <div className="flex gap-4">
                        <Button variant="outline" className="flex-1" onClick={addRelationship}>
                          + Thêm thủ công
                        </Button>
                        <Button 
                          className="flex-1 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 border-indigo-200" 
                          onClick={() => setIsAiRelModalOpen(true)}
                        >
                          <Wand2 className="h-4 w-4 mr-2" /> AI Sinh Quan Hệ
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* 9. KIẾN TRÚC CẢM XÚC */}
                  <AccordionItem value="item-9" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Kiến trúc Cảm xúc (Emotional Architecture)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <TextAreaField
                        label="Trạng thái cảm xúc ban đầu (Starting Emotional State)"
                        value={bibleData?.emotional_architecture?.starting_emotional_state}
                        onChange={(v: any) =>
                          updateBible(["emotional_architecture", "starting_emotional_state"], v)
                        }
                        rows={2}
                      />
                      <TextAreaField
                        label="Bước ngoặt giữa truyện (Midpoint Shift)"
                        value={bibleData?.emotional_architecture?.midpoint_shift}
                        onChange={(v: any) => updateBible(["emotional_architecture", "midpoint_shift"], v)}
                        rows={2}
                      />
                      <TextAreaField
                        label="Bước ngoặt cảm xúc lớn (Major Emotional Turn)"
                        value={bibleData?.emotional_architecture?.major_emotional_turn}
                        onChange={(v: any) =>
                          updateBible(["emotional_architecture", "major_emotional_turn"], v)
                        }
                        rows={2}
                      />
                      <TextAreaField
                        label="Cảm xúc khi kết thúc (Resolution Emotion)"
                        value={bibleData?.emotional_architecture?.resolution_emotion}
                        onChange={(v: any) => updateBible(["emotional_architecture", "resolution_emotion"], v)}
                        rows={2}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: PACING */}
          {/* TAB 2: PACING (TIMELINE EDITOR) */}
          <TabsContent value="pacing">
            <Card className="border-slate-200 shadow-sm min-h-[50vh] flex flex-col">
              
              <CardHeader className="bg-slate-100 rounded-t-lg border-b pb-4 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-indigo-600" />
                    Khung Chương (Pacing)
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Phân bổ thời lượng, bối cảnh và diễn biến từng chương.
                  </CardDescription>
                </div>

                {/* NÚT TẠO LẠI (AI): Luôn hiện để user có thể đập đi chia lại chương */}
                <Button
                  onClick={generatePacing}
                  disabled={pacingLoading}
                  variant="secondary"
                  size="sm"
                  className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200"
                >
                  {pacingLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  {chapters.length > 0 ? "AI Tạo Cấu Trúc Khác" : "AI Tạo Cấu Trúc"}
                </Button>
              </CardHeader>
              
              <CardContent className="flex-1 p-6 bg-slate-50 relative">
                
                {/* TRẠNG THÁI 1: ĐANG LOADING (Gọi AI) */}
                {pacingLoading && (
                  <div className="absolute inset-0 bg-white/80 z-20 flex flex-col items-center justify-center text-indigo-600 backdrop-blur-sm rounded-b-lg">
                    <Loader2 className="h-10 w-10 animate-spin mb-4" />
                    <p className="font-medium animate-pulse">Trí tuệ nhân tạo đang phân bổ cấu trúc truyện...</p>
                  </div>
                )}

                {/* TRẠNG THÁI 2: TRỐNG TRƠN (Chưa có chương nào) */}
                {!pacingLoading && chapters.length === 0 ? (
                  <div className="h-full min-h-[40vh] flex flex-col items-center justify-center text-slate-400 space-y-4">
                    <Layers className="h-16 w-16 text-slate-200" />
                    <p>Dự án chưa có khung chương nào.</p>
                    <div className="flex gap-4">
                      <Button variant="outline" onClick={() => addChapterAt(0)}>
                        + Tự viết chương đầu tiên
                      </Button>
                      <Button onClick={generatePacing} className="bg-indigo-600 hover:bg-indigo-700">
                        <Wand2 className="mr-2 h-4 w-4" /> Nhờ AI chẻ chương
                      </Button>
                    </div>
                  </div>
                ) : (

                /* TRẠNG THÁI 3: HIỂN THỊ DANH SÁCH EDITOR */
                <div className="space-y-6 pb-10">

                  {/* ====== TÓM TẮT MẠCH TRUYỆN (MINIMAP) ====== */}
                  {chapters.length > 0 && (
                    <div className="mb-8 p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
                      <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center uppercase tracking-wider">
                        <Map className="w-4 h-4 mr-2 text-indigo-500"/> Toàn cảnh mạch truyện
                      </h3>
                      <div className="flex gap-3 overflow-x-auto pb-3 pt-1 px-1 scrollbar-thin scrollbar-thumb-slate-300">
                        {chapters.map((c, i) => (
                          <div key={c.id || c.temp_id} className="min-w-[220px] max-w-[220px] border border-slate-150 rounded-lg p-3 bg-slate-50 flex-shrink-0 hover:border-indigo-300 transition-colors cursor-default relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-400 opacity-70"></div>
                            <p className="text-[10px] font-black text-indigo-600 mb-1">CHƯƠNG {c.chapter_number}</p>
                            <p className="font-bold text-sm text-slate-800 line-clamp-1">{c.title || "Chưa có tên"}</p>
                            <p className="text-xs text-slate-500 mt-1 truncate">{c.pov_character}</p>
                            <Badge variant="outline" className="mt-2 text-[9px] bg-white text-slate-600 border-slate-200">
                              {c.primary_function ? c.primary_function.split('(')[0].trim() : "Chưa phân loại"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Nút thêm chương ở đỉnh */}
                  <div className="flex justify-center gap-3 -mb-2">
                      <Button variant="outline" size="sm" className="rounded-full h-8 px-4 mb-6 text-xs text-slate-600 hover:bg-slate-100 shadow-sm" onClick={() => addChapterAt(0)}>
                        + Chèn thủ công
                      </Button>
                      <Button variant="default" size="sm" className="rounded-full h-8 px-4 mb-6 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 shadow-sm" onClick={() => openAiChapModal("insert", 0)}>
                        <Sparkles className="w-3 h-3 mr-1" /> AI Chèn Mở Đầu
                      </Button>
                  </div>

                  {chapters.map((chap, idx) => (
                    <div key={chap.id || chap.temp_id}  className="relative">
                      
                      {/* THE CARD */}
                      <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex flex-col gap-4 hover:border-indigo-300 transition-colors group">
                        
                        {/* THANH CÔNG CỤ HOVER (Nằm góc trên phải) */}
                        <div className="absolute -top-3 -right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <Button variant="secondary" size="sm" className="h-8 rounded-full shadow-md bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50" onClick={() => openAiChapModal("edit", idx)}>
                            <Sparkles className="h-3 w-3 mr-1" /> AI Sửa
                          </Button>
                          <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full shadow-md" onClick={() => removeChapter(idx)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* HEADER CHƯƠNG */}
                        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                          <div className="flex items-end gap-3">
                            <div className="font-black text-slate-800 text-xl whitespace-nowrap bg-slate-100 px-3 py-1 rounded-md">
                              Chương {chap.chapter_number}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-slate-400 uppercase tracking-widest ml-1">Tiêu đề</Label>
                              <Input 
                                className="h-9 font-bold text-slate-700 w-[200px] sm:w-[250px] border-slate-200 focus-visible:ring-indigo-500" 
                                value={chap.title || ""} 
                                onChange={(e) => updateChapterField(idx, "title", e.target.value)}
                                placeholder="Nhập tiêu đề..."
                              />
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3 w-full md:w-auto bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <div className="space-y-1">
                              <Label className="text-[10px] text-amber-600 uppercase tracking-widest ml-1">Mốc thời gian</Label>
                              <Input 
                                className="h-8 text-xs font-semibold text-amber-800 bg-amber-50/50 border-amber-200 w-[130px]" 
                                value={chap.timeline_period || ""} 
                                onChange={(e) => updateChapterField(idx, "timeline_period", e.target.value)}
                                placeholder="Ví dụ: Hiện tại"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-indigo-600 uppercase tracking-widest ml-1">Góc nhìn (POV)</Label>
                              <Input 
                                className="h-8 text-xs font-semibold text-indigo-800 bg-indigo-50/50 border-indigo-200 w-[130px]" 
                                value={chap.pov_character || ""} 
                                onChange={(e) => updateChapterField(idx, "pov_character", e.target.value)}
                                placeholder="Nhân vật..."
                              />
                            </div>
                          </div>
                        </div>
                        
                        <Separator className="bg-slate-100" />

                        {/* NỘI DUNG CHƯƠNG (CODE CỦA BẠN ĐÃ UPDATE LÚC NÃY) */}
                        <div className="flex flex-col gap-5">
                          <div className="space-y-2 w-full md:w-[350px]">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                              🎯 Chức năng (Primary Function)
                            </Label>
                            <Select
                              value={chap.primary_function || ""}
                              onValueChange={(value) => updateChapterField(idx, "primary_function", value)}
                            >
                              <SelectTrigger className="h-10 bg-slate-50 border-slate-200 focus:ring-indigo-500 font-medium text-slate-700">
                                <SelectValue placeholder="Chọn chức năng của chương..." />
                              </SelectTrigger>
                              <SelectContent className="max-h-[350px] min-w-[300px]">
                                {PRIMARY_FUNCTIONS.map((func) => (
                                  <SelectItem key={func} value={func} className="text-sm cursor-pointer py-2.5">
                                    {func}
                                  </SelectItem>
                                ))}
                                {chap.primary_function && !PRIMARY_FUNCTIONS.includes(chap.primary_function) && (
                                  <SelectItem value={chap.primary_function} className="text-sm italic text-amber-600 py-2.5">
                                    {chap.primary_function} (Cũ)
                                  </SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                              🎬 Sự kiện chính (Main Event)
                            </Label>
                            <Textarea 
                              className="resize-y min-h-[120px] text-sm leading-relaxed focus-visible:ring-indigo-500 bg-white"
                              value={chap.main_event || (chap.goal || "")} 
                              onChange={(e) => updateChapterField(idx, "main_event", e.target.value)}
                              placeholder="Mô tả sự kiện cụ thể diễn ra, hành động của nhân vật..."
                            />
                          </div>
                        </div>
                      </div>

                      {/* Nút thêm chương chèn ở giữa */}
                      <div className="flex justify-center gap-3 -mb-3 mt-5 opacity-0 hover:opacity-100 transition-opacity">
                          <Button variant="outline" size="sm" className="rounded-full h-8 px-4 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 shadow-sm z-10 relative" onClick={() => addChapterAt(idx + 1)}>
                            + Chèn thủ công
                          </Button>
                          <Button variant="default" size="sm" className="rounded-full h-8 px-4 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 shadow-sm z-10 relative" onClick={() => openAiChapModal("insert", idx + 1)}>
                            <Sparkles className="w-3 h-3 mr-1" /> AI Chèn Vào Đây
                          </Button>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      </div>

      {/* THANH CÔNG CỤ FLOATING KHI CÓ THAY ĐỔI CHƯA LƯU */}
      {(isBibleDirty || isPacingDirty) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5">
          <div className="bg-slate-900 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-4">
            
            {/* Hiển thị thông báo theo loại dữ liệu đang sửa */}
            <span className="font-medium">
              {isBibleDirty && isPacingDirty ? "Bạn đang sửa cả Bible và Pacing!" :
               isBibleDirty ? "Story Bible có thay đổi chưa lưu!" : 
               "Khung chương (Pacing) có thay đổi chưa lưu!"}
            </span>
            
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                <X className="h-4 w-4 mr-1" /> Hủy bỏ
              </Button>

              {/* Nút lưu Bible */}
              {isBibleDirty && (
                <Button size="sm" className="bg-blue-500 hover:bg-blue-600 text-white" onClick={handleSaveBible} disabled={isSavingBibleChanges}>
                  {isSavingBibleChanges ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Lưu Bible
                </Button>
              )}

              {/* Nút lưu Pacing */}
              {isPacingDirty && (
                <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={handleSavePacing} disabled={isSavingPacingChanges}>
                  {isSavingPacingChanges ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Lưu Pacing
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL AI SINH NHÂN VẬT */}
      <Dialog open={isAiCharModalOpen} onOpenChange={setIsAiCharModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>AI Sinh Nhân Vật Mới</DialogTitle>
            <DialogDescription>
              Hãy miêu tả sơ bộ về nhân vật bạn muốn thêm (vai trò, tính cách...). AI sẽ tự động điền 20 trường thông tin phù hợp với cốt truyện.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Textarea 
              placeholder="VD: Một ông chủ quán cà phê trầm tính, từng trải, luôn cho nam chính những lời khuyên hữu ích..."
              value={aiCharPrompt}
              onChange={(e) => setAiCharPrompt(e.target.value)}
              className="resize-none h-32"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiCharModalOpen(false)}>Hủy</Button>
            <Button onClick={generateAiCharacter} disabled={isGeneratingChar || !aiCharPrompt} className="bg-indigo-600 hover:bg-indigo-700">
              {isGeneratingChar ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Wand2 className="h-4 w-4 mr-2"/>}
              Tạo Nhân Vật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL AI SINH MỐI QUAN HỆ */}
      <Dialog open={isAiRelModalOpen} onOpenChange={setIsAiRelModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>AI Sinh Mối Quan Hệ</DialogTitle>
            <DialogDescription>
              Nhập tên 2 nhân vật và một vài từ khóa về sự tương tác của họ (VD: Cạnh tranh ngầm, Yêu thầm, Quan hệ sếp - nhân viên...).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Textarea 
              placeholder="VD: Quan hệ giữa Minh và ông chủ quán. Minh coi ông như người cha, nhưng ông chủ lại giấu một bí mật liên quan đến gia đình Minh..."
              value={aiRelPrompt}
              onChange={(e) => setAiRelPrompt(e.target.value)}
              className="resize-none h-32"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiRelModalOpen(false)}>Hủy</Button>
            <Button onClick={generateAiRelationship} disabled={isGeneratingRel || !aiRelPrompt} className="bg-indigo-600 hover:bg-indigo-700">
              {isGeneratingRel ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Wand2 className="h-4 w-4 mr-2"/>}
              Tạo Quan Hệ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL AI CHÈN/SỬA CHƯƠNG */}
      <Dialog open={isAiChapModalOpen} onOpenChange={setIsAiChapModalOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              {aiChapAction === "insert" 
                ? `AI Tạo Chương Mới (Vị trí ${targetChapIndex + 1})` 
                : `AI Sửa Chương ${targetChapIndex + 1}`}
            </DialogTitle>
            <DialogDescription>
              {aiChapAction === "insert" 
                ? "Mô tả sự kiện bạn muốn chèn vào vị trí này. AI sẽ tự liên kết với mạch truyện trước và sau."
                : "Chỉ ra điểm bạn chưa ưng ý ở chương này (Ví dụ: Thêm một chút drama, đổi điểm nhìn sang nam chính...)"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Textarea 
              placeholder={aiChapAction === "insert" ? "VD: Nam chính vô tình phát hiện ra bí mật trong điện thoại..." : "VD: Làm cho cuộc cãi vã trở nên gay gắt hơn..."}
              value={aiChapPrompt}
              onChange={(e) => setAiChapPrompt(e.target.value)}
              className="resize-none h-32"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiChapModalOpen(false)}>Hủy</Button>
            <Button onClick={handleAiChapterSubmit} disabled={isGeneratingAiChap || !aiChapPrompt} className="bg-indigo-600 hover:bg-indigo-700">
              {isGeneratingAiChap ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Wand2 className="h-4 w-4 mr-2"/>}
              {aiChapAction === "insert" ? "Tạo Chương Mới" : "Cập Nhật Chương"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
    </div>
  );
}
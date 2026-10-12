"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, BrainCircuit, PenTool } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api-client";

const IDEATION_LENSES = [
  { key: "purist", label: "Nguyên bản" },
  { key: "false_truth", label: "Sự thật bị che giấu" },
  { key: "contract", label: "Hợp đồng ràng buộc" },
  { key: "dark_twist", label: "Đen tối" },
  { key: "second_chance", label: "Gương vỡ lại lành" },
  { key: "healing", label: "Điểm tựa" },
  { key: "forbidden", label: "Mối quan hệ bị cấm đoán" },
  { key: "steamy", label: "Lửa gần rơm" },
] as const;

type LensKey = (typeof IDEATION_LENSES)[number]["key"];

const HEAT_LEVELS = [
  { value: 1, label: "1 · Sạch", description: "Không có yếu tố 18+ hoặc ám chỉ thể xác." },
  { value: 2, label: "2 · Ngọt", description: "Căng thẳng lãng mạn, cùng lắm là nụ hôn." },
  { value: 3, label: "3 · Gợi cảm", description: "Hấp dẫn thể xác rõ, chỉ gợi hoặc chuyển cảnh." },
  { value: 4, label: "4 · Nóng", description: "Mồi thân mật hiện diện rõ trong tình huống và mâu thuẫn." },
  { value: 5, label: "5 · Không giới hạn", description: "Yếu tố 18+ có thể là trục hoặc bước ngoặt của ý tưởng." },
] as const;

interface Idea { id: number; lens_key: string; title: string; vietnamese_context: string; situational_irony: string; logline: string; micro_conflict: string; thematic_question: string; vibe: string; }

export default function NewProjectPage() {
  const router = useRouter();
  
  const [premise, setPremise] = useState("");
  const [selectedLenses, setSelectedLenses] = useState<LensKey[]>(IDEATION_LENSES.map((lens) => lens.key));
  const [ideasPerLens, setIdeasPerLens] = useState("1");
  const [heatLevel, setHeatLevel] = useState(1);
  const [ideasHeatLevel, setIdeasHeatLevel] = useState(1);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [analyzedVibe, setAnalyzedVibe] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<number | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const parsedIdeasPerLens = Number(ideasPerLens);
  const isIdeasPerLensValid = Number.isInteger(parsedIdeasPerLens) && parsedIdeasPerLens >= 1 && parsedIdeasPerLens <= 5;
  const puristIdeas = ideas.filter((idea) => idea.lens_key === "purist");
  const multiAngleIdeas = ideas.filter((idea) => idea.lens_key !== "purist");

  // Generate ideas for the selected lenses.
  const handleGenerateIdeas = async () => {
    if (!premise.trim() || selectedLenses.length === 0 || !isIdeasPerLensValid) return;
    
    setLoading(true); setIdeas([]); setSelectedIdea(null); setAnalyzedVibe("");
    
    try {
      const result = await apiClient.post<Idea[]>("/api/ideation", {
        story_premise: premise.trim(),
        target_lenses: IDEATION_LENSES.filter((lens) => selectedLenses.includes(lens.key)).map((lens) => lens.key),
        ideas_per_lens: parsedIdeasPerLens,
        heat_level: heatLevel,
      });
      
      if (result.success) {
        setIdeas(result.data);
        setAnalyzedVibe(String(result.analyzed_vibe ?? ""));
        setIdeasHeatLevel(heatLevel);
      }
    } catch {
      alert("Lỗi kết nối Backend."); 
    } finally { 
      setLoading(false); 
    }
  };

  // Tạo project
  const handleCreateProject = async (idea: Idea) => {
    setCreatingProject(true);
    try {
      const result = await apiClient.post<{ id?: string }>("/api/projects", {
          title: idea.title, 
          vibe: idea.vibe, 
          logline: idea.logline,
          thematic_question: idea.thematic_question,
          vietnamese_context: idea.vietnamese_context, 
          situational_irony: idea.situational_irony,
          micro_conflict: idea.micro_conflict, 
          story_premise: premise, // Lưu lại bản gốc
          heat_level: ideasHeatLevel,
        });
      if (result.success && typeof result.project_id === "string" && result.project_id) {
        localStorage.setItem("story-maker-last-project-id", result.project_id);
        router.push(`/project/${result.project_id}/overview`);
      }
    } catch { alert("Lỗi tạo dự án"); }
    finally { setCreatingProject(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        
        <div className="text-center space-y-3">
          <Button variant="ghost" onClick={() => router.push("/")} className="mb-4">← Trở về Dashboard</Button>
          <h1 className="text-4xl font-extrabold text-slate-900">Phân Tách Ý Tưởng</h1>
          <p className="text-slate-500">Chọn lăng kính, số lượng và mức độ phù hợp cho lượt phát triển ý tưởng.</p>
        </div>

        {/* KHU VỰC NHẬP DÀN Ý */}
        <div className="max-w-3xl mx-auto bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <PenTool className="h-4 w-4 text-indigo-500"/> Mạch truyện sơ bộ của bạn:
              </label>
              <span className="text-xs text-slate-400">{premise.length} ký tự</span>
            </div>
            
            <Textarea 
              placeholder="Ví dụ: Hai người bạn thân từ nhỏ cùng lên thành phố học. Một người khao khát giàu sang nên dần đánh mất bản thân, người kia vẫn giữ nếp sống giản dị. Mâu thuẫn nổ ra khi..." 
              rows={6}
              value={premise}
              onChange={(e) => setPremise(e.target.value)}
              className="bg-slate-50 text-base leading-relaxed p-4 resize-none border-slate-200 focus-visible:ring-indigo-500"
            />

            <fieldset className="space-y-3">
              <legend className="text-sm font-semibold text-slate-700">Lăng kính câu chuyện</legend>
              <div className="flex justify-end gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedLenses(IDEATION_LENSES.map((lens) => lens.key))}>
                  Chọn tất cả
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedLenses([])}>
                  Bỏ chọn
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {IDEATION_LENSES.map((lens) => (
                  <label key={lens.key} htmlFor={`lens-${lens.key}`} className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 hover:bg-slate-50">
                    <Checkbox
                      id={`lens-${lens.key}`}
                      checked={selectedLenses.includes(lens.key)}
                      onCheckedChange={(checked) => {
                        setSelectedLenses((current) => checked === true
                          ? [...current, lens.key]
                          : current.filter((key) => key !== lens.key));
                      }}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium text-slate-800">{lens.label}</span>
                      <span className="text-xs text-slate-500">{lens.key}</span>
                    </span>
                  </label>
                ))}
              </div>
              {selectedLenses.length === 0 && (
                <p role="alert" className="text-sm text-red-600">Chọn ít nhất một lăng kính để tiếp tục.</p>
              )}
            </fieldset>

            <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ideas-per-lens">Ý tưởng mỗi lăng kính</Label>
                <Input
                  id="ideas-per-lens"
                  type="number"
                  min={1}
                  max={5}
                  step={1}
                  value={ideasPerLens}
                  onChange={(event) => setIdeasPerLens(event.target.value)}
                  aria-invalid={!isIdeasPerLensValid}
                  aria-describedby="ideas-per-lens-help"
                />
                <p id="ideas-per-lens-help" className="text-xs text-slate-500">Nhập từ 1 đến 5 ý tưởng cho mỗi lăng kính.</p>
                {!isIdeasPerLensValid && (
                  <p role="alert" className="text-sm text-red-600">Số lượng phải là số nguyên từ 1 đến 5.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="heat-level">Mức độ nóng</Label>
                <Select value={String(heatLevel)} onValueChange={(value) => setHeatLevel(Number(value ?? 1))}>
                  <SelectTrigger id="heat-level" className="w-full bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HEAT_LEVELS.map((level) => (
                      <SelectItem key={level.value} value={String(level.value)}>{level.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">{HEAT_LEVELS.find((level) => level.value === heatLevel)?.description}</p>
              </div>
            </div>

            <p className="text-center text-sm text-slate-500">
              Dự kiến tạo {selectedLenses.length * (isIdeasPerLensValid ? parsedIdeasPerLens : 0)} ý tưởng
            </p>
            
            <Button size="lg" className="w-full bg-indigo-600 hover:bg-indigo-700 text-md h-12" onClick={handleGenerateIdeas} disabled={loading || !premise.trim() || selectedLenses.length === 0 || !isIdeasPerLensValid}>
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <><BrainCircuit className="mr-2 h-5 w-5" /> Phân Tích & Sinh Ý Tưởng</>}
            </Button>
          </div>
        </div>

        {/* HIỂN THỊ VIBE & IDEAS */}
        {ideas.length > 0 && (
          <div className="space-y-8 animate-in fade-in duration-700 pb-16">
            
            {/* Phản hồi từ AI */}
            <div className="max-w-3xl mx-auto bg-indigo-50 border border-indigo-100 p-4 rounded-xl text-center shadow-sm">
              <span className="text-indigo-600 font-bold uppercase text-xs tracking-wider block mb-1">Góc nhìn của AI</span>
              <p className="text-indigo-900 font-medium italic">&ldquo;{analyzedVibe}&rdquo;</p>
            </div>

            {/* TÁCH RIÊNG Ý TƯỞNG PURIST LÊN ĐẦU */}
            {puristIdeas.length > 0 && (
              <div className="max-w-4xl mx-auto space-y-3">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest text-center">Bản Gọt Giũa Từ Ý Tưởng Gốc ({puristIdeas.length})</h3>
                  <div className="space-y-4">
                    {puristIdeas.map((originalIdea) => (
                  <Card 
                    key={originalIdea.id}
                    className={`cursor-pointer transition-all hover:shadow-lg border-2 flex flex-col ${selectedIdea === originalIdea.id ? 'border-amber-500 bg-amber-50/30 shadow-md' : 'border-amber-200 bg-gradient-to-br from-white to-amber-50/50'}`}
                    onClick={() => setSelectedIdea(originalIdea.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-none shadow-none">
                          💎 {originalIdea.vibe}
                        </Badge>
                      </div>
                      <CardTitle className="text-2xl leading-tight text-slate-800">{originalIdea.title}</CardTitle>
                      <CardDescription className="text-base mt-2 font-medium text-slate-700 leading-relaxed">
                        {originalIdea.logline}
                      </CardDescription>
                    </CardHeader>
                    
                    <CardContent className="space-y-3 text-sm text-slate-600">
                      <div><span className="font-semibold text-slate-900">Bối cảnh: </span>{originalIdea.vietnamese_context}</div>
                      <div><span className="font-semibold text-slate-900">Câu hỏi chủ đề: </span>{originalIdea.thematic_question}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <div className="bg-white p-3 rounded-md border border-amber-100/50 shadow-sm">
                          <span className="font-semibold text-slate-900 block mb-1">Mâu thuẫn mồi: </span> 
                          {originalIdea.micro_conflict}
                        </div>
                        <div className="bg-white p-3 rounded-md border border-amber-100/50 shadow-sm">
                          <span className="font-semibold text-slate-900 block mb-1">Câu hỏi chủ đề: </span> 
                          {originalIdea.thematic_question}
                        </div>
                        <div className="bg-white p-3 rounded-md border border-amber-100/50 shadow-sm">
                          <span className="font-semibold text-slate-900 block mb-1">Sự trớ trêu: </span> 
                          {originalIdea.situational_irony}
                        </div>
                      </div>
                    </CardContent>

                    <CardFooter className="pt-2 pb-4">
                      {selectedIdea === originalIdea.id && (
                        <Button size="lg" className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold" onClick={(e) => { e.stopPropagation(); handleCreateProject(originalIdea); }} disabled={creatingProject}>
                          {creatingProject ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "Chọn mạch truyện Nguyên Bản này"}
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                    ))}
                  </div>
              </div>
            )}

            {multiAngleIdeas.length > 0 && (
              <>
                <Separator className="my-8" />

                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 text-center">{multiAngleIdeas.length} Hướng Phát Triển Đa Chiều (Multi-Angle)</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {multiAngleIdeas.map((idea) => (
                <Card 
                  key={idea.id} 
                  className={`cursor-pointer transition-all hover:shadow-md flex flex-col ${selectedIdea === idea.id ? 'ring-2 ring-indigo-500 bg-indigo-50/30' : ''}`}
                  onClick={() => setSelectedIdea(idea.id)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start gap-4 mb-2">
                      <Badge variant="secondary" className="bg-slate-100 text-slate-600 whitespace-nowrap">
                        {idea.vibe}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg leading-tight text-slate-800">{idea.title}</CardTitle>
                    <CardDescription className="line-clamp-7 mt-2 font-medium text-slate-700 leading-relaxed">
                      {idea.logline}
                    </CardDescription>
                  </CardHeader>
                  
                  <CardContent className="flex-1 space-y-3 text-sm text-slate-600">
                    <div>
                      <span className="font-semibold text-slate-900">Mâu thuẫn mồi: </span> 
                      {idea.micro_conflict}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-900">Câu hỏi chủ đề: </span>
                      {idea.thematic_question}
                    </div>
                    <div className="bg-slate-50 p-3 rounded-md border border-slate-100 italic">
                      <span className="font-semibold text-slate-900 not-italic">Trớ trêu: </span> 
                      {idea.situational_irony}
                    </div>
                  </CardContent>

                  <CardFooter className="pt-4">
                    {selectedIdea === idea.id && (
                      <Button className="w-full bg-indigo-600 hover:bg-indigo-700" onClick={(e) => { e.stopPropagation(); handleCreateProject(idea); }} disabled={creatingProject}>
                        {creatingProject ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Chọn hướng đi này"}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, BrainCircuit, PenTool } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface Idea { id: number; title: string; vietnamese_context: string; situational_irony: string; logline: string; micro_conflict: string; vibe: string; }

export default function NewProjectPage() {
  const router = useRouter();
  
  const [premise, setPremise] = useState("");
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [analyzedVibe, setAnalyzedVibe] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<number | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);

  // Gọi AI phân tích và nhả 10 ý tưởng
  const handleGenerateIdeas = async () => {
    if (!premise.trim()) return alert("Vui lòng nhập mạch truyện sơ bộ!");
    
    setLoading(true); setIdeas([]); setSelectedIdea(null); setAnalyzedVibe("");
    
    try {
      const response = await fetch("http://localhost:8765/api/ideation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ story_premise: premise }),
      });
      const result = await response.json();
      
      if (result.success) {
        setIdeas(result.data);
        setAnalyzedVibe(result.analyzed_vibe);
      }
    } catch (e) { 
      alert("Lỗi kết nối Backend."); 
    } finally { 
      setLoading(false); 
    }
  };

  // Tạo project
  const handleCreateProject = async (idea: Idea) => {
    setCreatingProject(true);
    try {
      const response = await fetch("http://localhost:8765/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: idea.title, 
          vibe: idea.vibe, 
          logline: idea.logline,
          vietnamese_context: idea.vietnamese_context, 
          situational_irony: idea.situational_irony,
          micro_conflict: idea.micro_conflict, 
          story_premise: premise, // Lưu lại bản gốc
        }),
      });
      const result = await response.json();
      if (result.success) {
        router.push(`/project/${result.project_id}/overview`);
      }
    } catch (e) { alert("Lỗi tạo dự án"); } 
    finally { setCreatingProject(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto space-y-10">
        
        <div className="text-center space-y-3">
          <Button variant="ghost" onClick={() => router.push("/")} className="mb-4">← Trở về Dashboard</Button>
          <h1 className="text-4xl font-extrabold text-slate-900">Phân Tách Ý Tưởng</h1>
          <p className="text-slate-500">Đưa ra một đoạn tóm tắt, AI sẽ giúp bạn mở rộng thành 10 hướng đi khác biệt.</p>
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
            
            <Button size="lg" className="w-full bg-indigo-600 hover:bg-indigo-700 text-md h-12" onClick={handleGenerateIdeas} disabled={loading || !premise}>
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
              <p className="text-indigo-900 font-medium italic">"{analyzedVibe}"</p>
            </div>

            {/* TÁCH RIÊNG Ý TƯỞNG 11 (NGUYÊN BẢN) LÊN ĐẦU */}
            {ideas.find(i => i.id === 11) && (() => {
              const originalIdea = ideas.find(i => i.id === 11)!;
              return (
                <div className="max-w-4xl mx-auto">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3 text-center">Bản Gọt Giũa Từ Ý Tưởng Gốc</h3>
                  <Card 
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <div className="bg-white p-3 rounded-md border border-amber-100/50 shadow-sm">
                          <span className="font-semibold text-slate-900 block mb-1">Mâu thuẫn mồi: </span> 
                          {originalIdea.micro_conflict}
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
                </div>
              );
            })()}

            <Separator className="my-8" />

            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 text-center">10 Hướng Phát Triển Đa Chiều (Multi-Angle)</h3>

            {/* GRID 10 Ý TƯỞNG CÒN LẠI */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {ideas.filter(i => i.id !== 11).map((idea) => (
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
          </div>
        )}
      </div>
    </div>
  );
}
"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Users, MapPin, Swords, Target, Play } from "lucide-react";
import { apiClient } from "@/lib/api-client";

export default function OverviewPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get(`/api/projects/${projectId}`)
      .then(data => {
        if (data.success) setProject(data.data);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-indigo-500" /></div>;
  if (!project) return <div className="p-10">Không tìm thấy dự án.</div>;

  // Bóc tách JSON an toàn
  const bible = project.story_bible || {};
  const chars = bible.characters || [];
  const meta = project.video_metadata || {};

  return (
    <div className="h-screen overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-5xl mx-auto space-y-8 pb-10">
        
        {/* 1. HERO SECTION */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-none">{project.status}</Badge>
            <Badge variant="outline" className="text-slate-500">{project.vibe}</Badge>
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">{project.title}</h1>
          <p className="text-xl text-slate-600 leading-relaxed max-w-3xl">
            {project.logline}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* CỘT TRÁI: THẾ GIỚI & NHÂN VẬT (2 phần) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* THẾ GIỚI & XUNG ĐỘT */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-white border-b pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MapPin className="h-5 w-5 text-amber-500" /> Bối cảnh & Xung đột
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6 bg-amber-50/30">
                <div>
                  <h4 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
                    <Target className="h-4 w-4 text-slate-500"/> Môi trường (Vietnamese Context)
                  </h4>
                  <p className="text-slate-600 text-sm">{project.vietnamese_context}</p>
                </div>
                <Separator />
                <div>
                  <h4 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
                    <Swords className="h-4 w-4 text-slate-500"/> Mâu thuẫn cốt lõi
                  </h4>
                  <p className="text-slate-600 text-sm">
                    {bible.conflict_system?.central_conflict || "Chưa có dữ liệu."}
                  </p>
                </div>
                <Separator />
                <div>
                  <h4 className="font-semibold text-slate-800 mb-1">Động lực phát triển (Story Engine)</h4>
                  <p className="text-slate-600 text-sm italic">
                    "{bible.story_identity?.story_engine || "Chưa có dữ liệu."}"
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm border-l-4 border-l-indigo-500">
              <CardHeader className="bg-white border-b pb-4">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg text-slate-800">
                    Tiến độ Cốt truyện (Story So Far)
                  </CardTitle>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-500 font-normal text-xs">
                    Cập nhật tự động
                  </Badge>
                </div>
                <CardDescription>
                  Bản tóm tắt tự động dựa trên các chương đã viết.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 bg-white space-y-6">
                
                {/* 1. Đoạn văn tóm tắt cốt lõi */}
                <div>
                  <p className="text-slate-700 leading-relaxed italic border-l-2 border-slate-300 pl-4">
                    {project.current_memory?.updated_memory?.story_so_far || "Chưa có diễn biến nào được ghi nhận. Hãy bắt đầu viết nháp các cảnh."}
                  </p>
                </div>

                {/* Kiểm tra nếu có chi tiết memory thì mới render phần dưới */}
                {project.current_memory?.updated_memory?.current_status && (
                  <>
                    <Separator />
                    
                    {/* 2. Trạng thái hiện tại của nhân vật */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-slate-400 uppercase">Vị trí hiện tại</span>
                        <p className="text-sm text-slate-700 font-medium">
                          {project.current_memory.updated_memory.current_status.location || "Không rõ"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-semibold text-slate-400 uppercase">Tình trạng nhân vật</span>
                        <p className="text-sm text-slate-700 font-medium">
                          {project.current_memory.updated_memory.current_status.character_conditions || "Bình thường"}
                        </p>
                      </div>
                    </div>

                    {/* 3. Các vấn đề đang bỏ ngỏ (Unresolved Threads) */}
                    {project.current_memory.updated_memory.unresolved_threads?.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <span className="text-xs font-semibold text-red-400 uppercase mb-2 block">Các nút thắt chưa giải quyết</span>
                        <ul className="list-disc list-inside text-sm text-slate-600 space-y-1">
                          {project.current_memory.updated_memory.unresolved_threads.map((thread: string, idx: number) => (
                            <li key={idx}>{thread}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* NHÂN VẬT CHÍNH */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-white border-b pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5 text-blue-500" /> Hệ thống Nhân vật
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {chars.length > 0 ? chars.map((char: any, i: number) => (
                    <div key={i} className="p-6 flex flex-col md:flex-row gap-6 hover:bg-slate-50 transition-colors">
                      <div className="md:w-1/3">
                        <h3 className="text-lg font-bold text-slate-800">{char.name} <span className="text-sm font-normal text-slate-500">({char.age}t)</span></h3>
                        <p className="text-sm text-indigo-600 font-medium mt-1">{char.role_in_story}</p>
                        <div className="mt-3 flex flex-wrap gap-1">
                          {char.personality?.core_traits?.map((t: string, j: number) => (
                            <Badge key={j} variant="secondary" className="text-[10px] bg-slate-200 text-slate-700">{t}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="md:w-2/3 space-y-3 text-sm">
                        <div>
                          <span className="font-semibold text-slate-700">Điểm yếu: </span>
                          <span className="text-slate-600">{char.personality?.flaw}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-700">Mục tiêu thực tế: </span>
                          <span className="text-slate-600">{char.motivation}</span>
                        </div>
                        <div>
                          <span className="font-semibold text-slate-700">Nỗi sợ giấu kín: </span>
                          <span className="text-slate-600">{char.fear}</span>
                        </div>
                      </div>
                    </div>
                  )) : (
                    <div className="p-6 text-slate-500 italic">Chưa có dữ liệu nhân vật. Hãy tạo Story Bible.</div>
                  )}
                </div>
              </CardContent>
            </Card>

          </div>

          {/* CỘT PHẢI: METADATA & QUICK ACTIONS */}
          <div className="space-y-6">
            <Card className="border-red-100 shadow-sm">
              <CardHeader className="bg-red-50/50 border-b pb-4">
                <CardTitle className="flex items-center gap-2 text-lg text-red-700">
                  <Play className="h-5 w-5" /> Kênh Xuất Bản
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4 bg-white">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tên truyện</p>
                  <p className="text-sm font-medium text-slate-800 line-clamp-2">{meta.title || project.title || "Chưa tạo tên truyện."}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tiêu đề Video</p>
                  <p className="text-sm font-medium text-slate-800 line-clamp-2">{meta.hook || "Chưa tạo tiêu đề."}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Chữ trên Thumbnail</p>
                  <p className="text-sm font-bold text-red-600">{meta.overlay || "Chưa tạo."}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Mô tả (Không Spoil)</p>
                  <p className="text-sm text-slate-600 line-clamp-4">{meta.description || "Chưa tạo mô tả."}</p>
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
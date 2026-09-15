"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FolderOpen, Clock, ArrowRight } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:8765/api/projects")
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setProjects(data.data);
        }
      })
      .catch(err => console.error("Lỗi lấy danh sách dự án:", err))
      .finally(() => setLoading(false));
  }, []);

  // Format ngày tháng cho đẹp
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('vi-VN', { 
      day: '2-digit', month: '2-digit', year: 'numeric', 
      hour: '2-digit', minute: '2-digit' 
    }).format(date);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER & NÚT TẠO MỚI */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <FolderOpen className="h-8 w-8 text-indigo-600" />
              Quản lý Dự Án
            </h1>
            <p className="text-slate-500 mt-1">Danh sách các câu chuyện đang và đã sản xuất.</p>
          </div>
          
          <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => router.push('/new')}>
            <Plus className="mr-2 h-5 w-5" /> Dự án mới
          </Button>
        </div>

        {/* LOADING STATE */}
        {loading ? (
          <div className="flex justify-center py-20 text-slate-400">Đang tải danh sách...</div>
        ) : projects.length === 0 ? (
          
          /* EMPTY STATE */
          <div className="text-center py-20 bg-white border border-dashed border-slate-300 rounded-xl">
            <h3 className="text-lg font-medium text-slate-700 mb-2">Chưa có dự án nào</h3>
            <p className="text-slate-500 mb-4">Hãy khởi tạo ý tưởng đầu tiên của bạn.</p>
            <Button variant="outline" onClick={() => router.push('/new')}>
              Bắt đầu ngay
            </Button>
          </div>
          
        ) : (
          
          /* PROJECT GRID */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Card key={project.id} className="flex flex-col hover:shadow-md transition-shadow hover:border-indigo-200">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-4 mb-2">
                    <Badge variant="outline" className="bg-slate-50 text-slate-600">
                      {project.status || "Draft"}
                    </Badge>
                    <span className="text-xs text-slate-400 flex items-center">
                      <Clock className="h-3 w-3 mr-1" /> {formatDate(project.created_at)}
                    </span>
                  </div>
                  <CardTitle className="text-xl line-clamp-1 text-slate-800" title={project.title}>
                    {project.title}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 mt-1">
                    {project.logline}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="flex-1">
                  <Badge variant="secondary" className="font-normal bg-indigo-50 text-indigo-700">
                    {project.vibe}
                  </Badge>
                </CardContent>

                <CardFooter className="pt-4 border-t border-slate-100 bg-slate-50/50">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                    onClick={() => router.push(`/project/${project.id}/architecture`)}
                  >
                    Tiếp tục làm việc <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
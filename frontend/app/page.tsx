"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FolderOpen, Clock, ArrowRight } from "lucide-react";
import { apiClient } from "@/lib/api-client";

interface ProjectListItem {
  id: string;
  title?: string;
  logline?: string;
  status?: string;
  vibe?: string;
  heat_level?: number | null;
  created_at?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get<ProjectListItem[]>("/api/projects")
      .then((data) => {
        if (data.success) {
          setProjects(data.data);
        }
      })
      .catch((err) => console.error("Lỗi lấy danh sách dự án:", err))
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const totalProjects = projects.length;
  const inProgress = projects.filter((project) => {
    const status = (project.status || "Draft").toLowerCase();
    return ["draft", "in progress", "active", "planning", "writing"].includes(status);
  }).length;
  const completed = projects.filter((project) => {
    const status = (project.status || "").toLowerCase();
    return ["completed", "done", "published", "archived", "released"].includes(status);
  }).length;
  const newestProject = projects[0];

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <FolderOpen className="h-8 w-8 text-indigo-600" />
              Story Dashboard
            </h1>
            <p className="mt-1 text-slate-500">Danh sách dự án và thống kê nhanh về tiến độ sáng tác.</p>
          </div>

          <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => router.push("/new")}>
            <Plus className="mr-2 h-5 w-5" /> Dự án mới
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Tổng số story</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-slate-900">{totalProjects}</div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Đang tiến hành</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-600">{inProgress}</div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Hoàn thành</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-emerald-600">{completed}</div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Mới nhất</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg font-semibold text-slate-900 line-clamp-1">{newestProject?.title || "—"}</div>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="flex justify-center py-20 text-slate-400">Đang tải danh sách...</div>
        ) : projects.length === 0 ? (
          <div className="text-center py-20 bg-white border border-dashed border-slate-300 rounded-xl">
            <h3 className="text-lg font-medium text-slate-700 mb-2">Chưa có dự án nào</h3>
            <p className="text-slate-500 mb-4">Hãy khởi tạo ý tưởng đầu tiên của bạn.</p>
            <Button variant="outline" onClick={() => router.push("/new")}>
              Bắt đầu ngay
            </Button>
          </div>
        ) : (
          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <CardHeader className="border-b bg-slate-50/80">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-xl text-slate-900">Danh sách story</CardTitle>
                  <CardDescription>Quản lý và truy cập nhanh từng project.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left">
                  <thead className="bg-slate-50">
                    <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-6 py-3">Story</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Vibe</th>
                      <th className="px-6 py-3">Heat</th>
                      <th className="px-6 py-3">Ngày tạo</th>
                      <th className="px-6 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {projects.map((project) => (
                      <tr key={project.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{project.title}</div>
                          <div className="mt-1 text-sm text-slate-500 line-clamp-2">{project.logline}</div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-700">
                            {project.status || "Draft"}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 font-normal">
                            {project.vibe || "—"}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">
                            {project.heat_level ?? 1} / 5
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {project.created_at ? formatDate(project.created_at) : "—"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button
                            variant="ghost"
                            className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                            onClick={() => router.push(`/project/${project.id}/overview`)}
                          >
                            Mở <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
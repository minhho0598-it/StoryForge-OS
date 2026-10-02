"use client";

import Link from "next/link";
import { usePathname, useParams, useRouter } from "next/navigation";
import { BookOpen, PenTool, Clapperboard, ChevronLeft, LayoutDashboard, Newspaper, Settings, ChevronRight, FolderOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { apiClient, ApiError } from "@/lib/api-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type ProjectOption = {
  id: string;
  title: string;
};

const projectSections = ["architecture", "overview", "metadata", "studio", "writer-room"] as const;

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .get<ProjectOption[]>("/api/projects")
      .then((response) => {
        if (response.success) setProjects(response.data);
      })
      .catch((error) => {
        setProjectsError(error instanceof ApiError ? error.message : "Không tải được danh sách project.");
      })
      .finally(() => setProjectsLoading(false));
  }, []);

  const isActive = (path: string) => pathname.includes(path);
  const currentProject = projects.find((project) => project.id === projectId);
  const currentSection = pathname.split("/")[3];
  const destinationSection = projectSections.includes(currentSection as (typeof projectSections)[number])
    ? currentSection
    : "overview";

  useEffect(() => {
    if (!projectId) return;
    localStorage.setItem("story-maker-last-project-id", projectId);
  }, [projectId]);

  const switchProject = (nextProjectId: string | null) => {
    if (nextProjectId && nextProjectId !== projectId) {
      localStorage.setItem("story-maker-last-project-id", nextProjectId);
      router.push(`/project/${encodeURIComponent(nextProjectId)}/${destinationSection}`);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <div className="relative flex h-screen">
        <div className={`${isCollapsed ? "w-16 sm:w-20" : "w-16 sm:w-64"} bg-slate-900 text-slate-300 flex flex-col shadow-xl z-20 transition-all duration-300 ease-out`}>
          <div className="p-3 border-b border-slate-800 transition-opacity duration-200">
            {!isCollapsed && (
              <Link href="/" className="flex items-center text-slate-400 hover:text-white transition-colors duration-200 text-sm font-medium">
                <ChevronLeft className="h-4 w-4 mr-1" /> Về Danh sách Dự án
              </Link>
            )}
          </div>

          <div className="flex-1 p-3 space-y-2 mt-2 transition-all duration-300 ease-out">
            <Select
              value={projectId}
              onValueChange={switchProject}
              disabled={projectsLoading || projects.length === 0}
            >
              <SelectTrigger
                aria-label="Chuyển project"
                title={currentProject?.title || projectsError || "Chuyển project"}
                className={`h-10 w-full min-w-0 border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 [&>svg:last-child]:hidden sm:[&>svg:last-child]:block ${isCollapsed ? "justify-center px-2" : "justify-between"}`}
              >
                <SelectValue placeholder={projectsLoading ? "Đang tải..." : "Chọn project"}>
                  {isCollapsed ? (
                    <FolderOpen className="h-4 w-4 shrink-0" />
                  ) : (
                    <>
                      <span className="hidden truncate sm:inline">{currentProject?.title || "Project"}</span>
                      <FolderOpen className="h-4 w-4 shrink-0 sm:hidden" />
                    </>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projectsError && !isCollapsed && (
              <p className="px-1 text-xs text-red-300" title={projectsError}>Không tải được project</p>
            )}
            {!projectsLoading && !projectsError && projects.length === 0 && !isCollapsed && (
              <p className="px-1 text-xs text-slate-400">Chưa có project</p>
            )}

            <Link
              href={`/project/${projectId}/overview`}
              title="Overview"
              className={`flex items-center gap-3 px-3 py-3 rounded-md transition-all duration-200 ease-out ${isCollapsed ? "justify-center" : ""} ${isActive('/overview') ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <LayoutDashboard className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="hidden truncate sm:inline">Overview</span>}
            </Link>

            <Link
              href={`/project/${projectId}/architecture`}
              title="Cấu Trúc & DNA"
              className={`flex items-center gap-3 px-3 py-3 rounded-md transition-all duration-200 ease-out ${isCollapsed ? "justify-center" : ""} ${isActive('/architecture') ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <BookOpen className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="hidden truncate sm:inline">Cấu Trúc & DNA</span>}
            </Link>

            <Link
              href={`/project/${projectId}/writer-room`}
              title="Lò Luyện Chữ"
              className={`flex items-center gap-3 px-3 py-3 rounded-md transition-all duration-200 ease-out ${isCollapsed ? "justify-center" : ""} ${isActive('/writer-room') ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <PenTool className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="hidden truncate sm:inline">Lò Luyện Chữ</span>}
            </Link>

            <Link
              href={`/project/${projectId}/studio`}
              title="Xưởng Sản Xuất"
              className={`flex items-center gap-3 px-3 py-3 rounded-md transition-all duration-200 ease-out ${isCollapsed ? "justify-center" : ""} ${isActive('/studio') ? 'bg-amber-600 text-white font-medium shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Clapperboard className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="hidden truncate sm:inline">Xưởng Sản Xuất</span>}
            </Link>

            <Link
              href={`/project/${projectId}/metadata`}
              title="Xuất Bản & SEO"
              className={`flex items-center gap-3 px-3 py-3 rounded-md transition-all duration-200 ease-out ${isCollapsed ? "justify-center" : ""} ${isActive('/metadata') ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Newspaper className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="hidden truncate sm:inline">Xuất Bản & SEO</span>}
            </Link>
          </div>

          <div className="border-t border-slate-800 p-3 transition-all duration-300 ease-out">
            <Link
              href="/settings"
              title="Cài Đặt"
              className={`flex items-center rounded-md transition-all duration-200 ease-out ${isCollapsed ? "justify-center w-full h-8" : "gap-3 px-3 py-3 w-full"} ${isActive('/settings') ? 'bg-slate-700 text-white font-medium shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Settings className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="hidden truncate sm:inline">Cài Đặt</span>}
            </Link>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          className="absolute top-1/2 right-0 z-30 flex -translate-y-1/2 translate-x-1/2 items-center justify-center h-10 w-10 rounded-full border border-slate-700 bg-slate-800 text-slate-200 shadow-lg shadow-slate-900/30 transition-all duration-200 ease-out hover:-translate-y-1/2 hover:translate-x-1/2 hover:scale-105 hover:bg-slate-700 hover:text-white hover:shadow-slate-900/40 active:scale-95"
        >
          {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto relative h-screen transition-all duration-300 ease-out">
        {children}
      </div>
    </div>
  );
}
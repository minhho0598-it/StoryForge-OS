"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { BookOpen, PenTool, Clapperboard, ChevronLeft, Home, Newspaper, Settings, ChevronRight } from "lucide-react";
import { useState } from "react";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams();
  const projectId = params.id as string;
  const [isCollapsed, setIsCollapsed] = useState(false);

  const isActive = (path: string) => pathname.includes(path);

  return (
    <div className="flex h-screen bg-slate-50">
      <div className="relative flex h-screen">
        <div className={`${isCollapsed ? "w-20" : "w-64"} bg-slate-900 text-slate-300 flex flex-col shadow-xl z-20 transition-all duration-300 ease-out`}>
          <div className="p-3 border-b border-slate-800 transition-opacity duration-200">
            {!isCollapsed && (
              <Link href="/" className="flex items-center text-slate-400 hover:text-white transition-colors duration-200 text-sm font-medium">
                <ChevronLeft className="h-4 w-4 mr-1" /> Về Danh sách Dự án
              </Link>
            )}
          </div>

          <div className="flex-1 p-3 space-y-2 mt-2 transition-all duration-300 ease-out">
            <Link
              href={`/project/${projectId}/overview`}
              title="Tổng Quan Dự Án"
              className={`flex items-center gap-3 px-3 py-3 rounded-md transition-all duration-200 ease-out ${isCollapsed ? "justify-center" : ""} ${isActive('/overview') ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Home className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="truncate">Tổng Quan Dự Án</span>}
            </Link>

            <Link
              href={`/project/${projectId}/architecture`}
              title="Cấu Trúc & DNA"
              className={`flex items-center gap-3 px-3 py-3 rounded-md transition-all duration-200 ease-out ${isCollapsed ? "justify-center" : ""} ${isActive('/architecture') ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <BookOpen className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="truncate">Cấu Trúc & DNA</span>}
            </Link>

            <Link
              href={`/project/${projectId}/writer-room`}
              title="Lò Luyện Chữ"
              className={`flex items-center gap-3 px-3 py-3 rounded-md transition-all duration-200 ease-out ${isCollapsed ? "justify-center" : ""} ${isActive('/writer-room') ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <PenTool className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="truncate">Lò Luyện Chữ</span>}
            </Link>

            <Link
              href={`/project/${projectId}/studio`}
              title="Xưởng Sản Xuất"
              className={`flex items-center gap-3 px-3 py-3 rounded-md transition-all duration-200 ease-out ${isCollapsed ? "justify-center" : ""} ${isActive('/studio') ? 'bg-amber-600 text-white font-medium shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Clapperboard className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="truncate">Xưởng Sản Xuất</span>}
            </Link>

            <Link
              href={`/project/${projectId}/metadata`}
              title="Xuất Bản & SEO"
              className={`flex items-center gap-3 px-3 py-3 rounded-md transition-all duration-200 ease-out ${isCollapsed ? "justify-center" : ""} ${isActive('/metadata') ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Newspaper className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="truncate">Xuất Bản & SEO</span>}
            </Link>
          </div>

          <div className="border-t border-slate-800 p-3 transition-all duration-300 ease-out">
            <Link
              href={`/project/${projectId}/settings`}
              title="Cài Đặt"
              className={`flex items-center rounded-md transition-all duration-200 ease-out ${isCollapsed ? "justify-center w-full h-8" : "gap-3 px-3 py-3 w-full"} ${isActive('/settings') ? 'bg-slate-700 text-white font-medium shadow-md' : 'hover:bg-slate-800 hover:text-white'}`}
            >
              <Settings className="h-5 w-5 shrink-0" />
              {!isCollapsed && <span className="truncate">Cài Đặt</span>}
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

      <div className="flex-1 overflow-y-auto relative h-screen transition-all duration-300 ease-out">
        {children}
      </div>
    </div>
  );
}
"use client";

import Link from "next/link";
// IMPORT THÊM useParams TỪ next/navigation
import { usePathname, useParams } from "next/navigation"; 
import { BookOpen, PenTool, Clapperboard, ChevronLeft, Home, Newspaper } from "lucide-react";

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
  // Xóa bỏ props params ở đây để tránh lỗi
}) {
  const pathname = usePathname();
  const params = useParams(); // SỬ DỤNG HOOK NÀY THAY THẾ
  const projectId = params.id as string; // Lấy ID an toàn từ URL hiện tại

  // Hàm kiểm tra xem menu nào đang được chọn
  const isActive = (path: string) => pathname.includes(path);

  return (
    <div className="flex h-screen bg-slate-50">
      {/* SIDEBAR TỔNG CỦA DỰ ÁN */}
      <div className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-xl z-20">
        
        {/* Nút Back về Trang chủ */}
        <div className="p-4 border-b border-slate-800">
          <Link href="/" className="flex items-center text-slate-400 hover:text-white transition-colors text-sm font-medium">
            <ChevronLeft className="h-4 w-4 mr-1" /> Về Danh sách Dự án
          </Link>
        </div>

        {/* Menu Điều hướng */}
        <div className="flex-1 p-3 space-y-2 mt-4">
          <Link href={`/project/${projectId}/overview`} 
            className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${isActive('/overview') ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-800'}`}>
            <Home className="h-5 w-5" />
            Tổng Quan Dự Án
          </Link>

          <Link href={`/project/${projectId}/architecture`} 
            className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${isActive('/architecture') ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-800'}`}>
            <BookOpen className="h-5 w-5" />
            Cấu Trúc & DNA
          </Link>
          
          <Link href={`/project/${projectId}/writer-room`} 
            className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${isActive('/writer-room') ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-800'}`}>
            <PenTool className="h-5 w-5" />
            Lò Luyện Chữ
          </Link>

          <Link href={`/project/${projectId}/studio`} 
            className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${isActive('/studio') ? 'bg-amber-600 text-white font-medium shadow-md' : 'hover:bg-slate-800'}`}>
            <Clapperboard className="h-5 w-5" />
            Xưởng Sản Xuất
          </Link>

          <Link href={`/project/${projectId}/metadata`}
            className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${isActive('/metadata') ? 'bg-indigo-600 text-white font-medium shadow-md' : 'hover:bg-slate-800'}`}>
            <Newspaper className="h-5 w-5" />
             Xuất Bản & SEO
          </Link>
        </div>
      </div>

      {/* VÙNG NỘI DUNG CHÍNH */}
      <div className="flex-1 overflow-y-auto relative h-screen">
        {children}
      </div>
    </div>
  );
}
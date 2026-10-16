"use client";

import { useState } from "react";
import { Clapperboard, Newspaper } from "lucide-react";
import MetadataContent from "@/components/project/metadata-content";
import StudioContent from "@/components/project/studio-content";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type StudioTab = "metadata" | "studio";

export default function StudioPage() {
  const [activeTab, setActiveTab] = useState<StudioTab>("metadata");
  const [hasVisitedStudio, setHasVisitedStudio] = useState(false);

  const handleTabChange = (value: string | null) => {
    if (value !== "metadata" && value !== "studio") return;
    setActiveTab(value);
    if (value === "studio") setHasVisitedStudio(true);
  };

  return (
    <main className="min-h-dvh bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Project Studio</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Xuất bản & Sản xuất</h1>
          <p className="mt-1 text-sm text-slate-600">Quản lý metadata và cấu hình sản xuất trên cùng một màn hình.</p>
        </header>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid min-h-12 w-full grid-cols-2 items-stretch gap-1 bg-slate-200 p-1">
            <TabsTrigger value="metadata" className="!h-auto min-h-10 self-stretch px-3 text-sm">
              <Newspaper className="mr-2 h-4 w-4" />
              Metadata
            </TabsTrigger>
            <TabsTrigger value="studio" className="!h-auto min-h-10 self-stretch px-3 text-sm">
              <Clapperboard className="mr-2 h-4 w-4" />
              Studio
            </TabsTrigger>
          </TabsList>

          <TabsContent value="metadata" keepMounted className="mt-4">
            <MetadataContent />
          </TabsContent>
          <TabsContent value="studio" keepMounted={hasVisitedStudio} className="mt-4">
            {hasVisitedStudio && <StudioContent />}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

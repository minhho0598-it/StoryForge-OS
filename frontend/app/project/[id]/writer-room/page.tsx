"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, Check, CheckCircle2, Copy, Loader2, Save, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import StoryWorkflowPlanner from "@/components/story-workflow-planner";
import { apiClient } from "@/lib/api-client";

const OUTLINE_SIGNATURE_FIELDS = [
  "id",
  "chapter_number",
  "title",
  "timeline_period",
  "pov_character",
  "main_event",
  "primary_function",
  "emotional_beat",
  "relationship_beat",
  "chapter_hook",
  "continuity_note",
] as const;

type OutlineChapter = {
  id?: string | null;
  chapter_number: number;
  title?: string | null;
  timeline_period?: string | null;
  pov_character?: string | null;
  main_event?: string | null;
  primary_function?: string | null;
  emotional_beat?: string | null;
  relationship_beat?: string | null;
  chapter_hook?: string | null;
  continuity_note?: string | null;
};

type WriterChapter = {
  id: string;
  chapter_number: number;
  title: string;
  timeline_period: string;
  pov_character: string;
  main_event: string;
  primary_function: string;
  emotional_beat: string;
  relationship_beat: string;
  chapter_hook: string;
  continuity_note: string;
  status?: string;
  final_content?: string | null;
};

type StoryOutlineState = {
  content: string;
  confirmed: boolean;
  chapter_signature: Record<string, unknown>[];
  story_bible_signature: string;
};

type BeatGenerationState = {
  status: "running" | "completed" | "failed" | "stale" | "not_started";
  completed: number;
  total: number;
};

type ProjectWorkflowState = {
  story_outline?: StoryOutlineState | null;
  story_outline_current?: boolean;
};

function hasCurrentConfirmedOutline(
  chapters: OutlineChapter[],
  outline: StoryOutlineState | null,
  storyBibleCurrent: boolean,
) {
  if (!outline?.confirmed || !storyBibleCurrent || !Array.isArray(outline.chapter_signature)) return false;
  const signature = chapters.map((chapter) =>
    Object.fromEntries(
      OUTLINE_SIGNATURE_FIELDS.map((field) => [field, chapter[field] || ""]),
    ),
  );
  return JSON.stringify(signature) === JSON.stringify(outline.chapter_signature);
}

const REFINED_CHAPTER_STATUSES = [
  "Refined & Ready for Audio",
  "Preparing Text",
  "Generating Audio",
  "Audio Generated",
  "Audio Compiled",
  "Rendering",
  "Completed",
  "Error",
];

export default function WriterRoomPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [chapters, setChapters] = useState<WriterChapter[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<WriterChapter | null>(null);
  const [workflowOutline, setWorkflowOutline] = useState<StoryOutlineState | null>(null);
  const [outlineBibleCurrent, setOutlineBibleCurrent] = useState(false);
  const [beatGeneration, setBeatGeneration] = useState<BeatGenerationState | null>(null);
  const [workflowReady, setWorkflowReady] = useState(false);
  const [showPlanner, setShowPlanner] = useState(true);
  const [workflowLoadError, setWorkflowLoadError] = useState<string | null>(null);
  const [chapterLoadError, setChapterLoadError] = useState<string | null>(null);
  const [isFinalDirty, setIsFinalDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const currentChapterIndex = chapters.findIndex((chapter) => chapter.id === selectedChapter?.id);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get<WriterChapter[]>(`/api/projects/${projectId}/chapters`),
      apiClient.get<ProjectWorkflowState>(`/api/projects/${projectId}`),
      apiClient.get<BeatGenerationState>(`/api/projects/${projectId}/beat-generation`),
    ]).then(([chapterResult, projectResult, generationResult]) => {
      if (cancelled) return;
      const loadedChapters = chapterResult.data ?? [];
      const project = projectResult.data ?? {};
      const refinedChapters = loadedChapters.filter((chapter) =>
        REFINED_CHAPTER_STATUSES.includes(chapter.status ?? ""),
      );
      const initialChapter = refinedChapters.length === 0 || refinedChapters.length === loadedChapters.length
        ? loadedChapters[0]
        : refinedChapters[refinedChapters.length - 1];

      setChapters(loadedChapters);
      setWorkflowOutline(project.story_outline ?? null);
      setOutlineBibleCurrent(Boolean(project.story_outline_current));
      setBeatGeneration(generationResult.data ?? null);
      setSelectedChapter(initialChapter ?? null);
      setWorkflowReady(true);
    }).catch((error) => {
      if (cancelled) return;
      console.error("Failed to load Writer Room workflow state:", error);
      setWorkflowLoadError(error instanceof Error ? error.message : "Không tải được trạng thái Writer Room.");
    });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!selectedChapter || selectedChapter.final_content || !REFINED_CHAPTER_STATUSES.includes(selectedChapter.status ?? "")) {
      return;
    }

    let cancelled = false;
    apiClient.get<WriterChapter>(`/api/chapters/${selectedChapter.id}`)
      .then((result) => {
        if (!cancelled && result.data?.final_content) {
          setSelectedChapter((current) => current?.id === selectedChapter.id
            ? { ...current, final_content: result.data.final_content }
            : current);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setChapterLoadError(error instanceof Error ? error.message : "Không tải được bản thảo chương.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedChapter]);

  const handleFinalTextChange = (newText: string) => {
    if (!selectedChapter) return;
    setSelectedChapter((current) => current ? { ...current, final_content: newText } : current);
    setChapters((current) => current.map((chapter) =>
      chapter.id === selectedChapter.id ? { ...chapter, final_content: newText } : chapter,
    ));
    setIsFinalDirty(true);
  };

  const handleSaveChanges = async () => {
    if (!selectedChapter || !isFinalDirty) return true;
    setIsSaving(true);
    setChapterLoadError(null);
    try {
      await apiClient.put(`/api/chapters/${selectedChapter.id}`, {
        final_content: selectedChapter.final_content,
      });
      setIsFinalDirty(false);
      return true;
    } catch (error) {
      setChapterLoadError(error instanceof Error ? error.message : "Không lưu được bản thảo chương.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const selectChapter = async (chapter: WriterChapter) => {
    if (isSaving) return;
    if (isFinalDirty && !(await handleSaveChanges())) return;
    setChapterLoadError(null);
    setSelectedChapter(chapter);
  };

  const goToChapter = async (direction: -1 | 1) => {
    const nextChapter = chapters[currentChapterIndex + direction];
    if (nextChapter) await selectChapter(nextChapter);
  };

  const handleCopyChapter = async () => {
    if (!selectedChapter?.final_content) return;
    try {
      await navigator.clipboard.writeText(selectedChapter.final_content);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      setChapterLoadError(error instanceof Error ? error.message : "Không thể sao chép bản thảo.");
    }
  };

  const handleStartWriting = useCallback(async () => {
    const selectedChapterId = selectedChapter?.id;
    try {
      const [refreshed, project] = await Promise.all([
        apiClient.get<WriterChapter[]>(`/api/projects/${projectId}/chapters`),
        apiClient.get<ProjectWorkflowState>(`/api/projects/${projectId}`),
      ]);
      setChapters(refreshed.data ?? []);
      setWorkflowOutline(project.data?.story_outline ?? null);
      setOutlineBibleCurrent(Boolean(project.data?.story_outline_current));
      setBeatGeneration({
        status: "completed",
        completed: refreshed.data?.length ?? 0,
        total: refreshed.data?.length ?? 0,
      });
      setSelectedChapter(
        refreshed.data?.find((chapter) => chapter.id === selectedChapterId)
          ?? refreshed.data?.[0]
          ?? null,
      );
      setChapterLoadError(null);
      setShowPlanner(false);
    } catch (error) {
      setWorkflowLoadError(error instanceof Error ? error.message : "Không tải được dữ liệu Writer Room.");
    }
  }, [projectId, selectedChapter?.id]);

  if (workflowLoadError) {
    return (
      <div role="alert" className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Không thể tải trạng thái Story Workflow: {workflowLoadError}. Hãy kiểm tra kết nối backend và đã áp dụng migration `002_story_workflow.sql`.
      </div>
    );
  }

  if (!workflowReady) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" /> Đang kiểm tra trạng thái Story Workflow...
      </div>
    );
  }

  if (showPlanner) {
    return (
      <StoryWorkflowPlanner
        chapters={chapters}
        storyOutline={workflowOutline}
        outlineBibleCurrent={outlineBibleCurrent}
        beatGeneration={beatGeneration}
        onStartWriting={handleStartWriting}
        onBack={hasCurrentConfirmedOutline(chapters, workflowOutline, outlineBibleCurrent) && beatGeneration?.status === "completed"
          ? () => setShowPlanner(false)
          : undefined}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-slate-50 p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Writer Room</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Bản thảo chương</h1>
            <p className="mt-1 text-sm text-slate-600">Draft beat và refine chương được quản lý trong Story Workflow Planner.</p>
          </div>
          <Button variant="outline" onClick={() => setShowPlanner(true)}>
            <Wand2 className="mr-2 h-4 w-4" /> Quản lý Story Workflow
          </Button>
        </header>

        {chapterLoadError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {chapterLoadError}
          </div>
        )}

        {selectedChapter ? (
          <>
            <Select
              value={selectedChapter.id}
              onValueChange={(value) => {
                const chapter = chapters.find((item) => item.id === value);
                if (chapter) void selectChapter(chapter);
              }}
            >
              <SelectTrigger className="w-full max-w-md" aria-label="Chọn chương">
                <SelectValue placeholder="Chọn chương" />
              </SelectTrigger>
              <SelectContent align="start">
                {chapters.map((chapter) => (
                  <SelectItem key={chapter.id} value={chapter.id}>
                    Chương {chapter.chapter_number}: {chapter.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-start justify-between gap-4 border-b bg-white">
                <div className="min-w-0">
                  <CardTitle className="text-lg text-slate-800">
                    Chương {selectedChapter.chapter_number}: {selectedChapter.title}
                  </CardTitle>
                  {selectedChapter.main_event && (
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{selectedChapter.main_event}</p>
                  )}
                </div>
                {selectedChapter.final_content && (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Đã refine" />
                )}
              </CardHeader>
              <CardContent className="p-0">
                {selectedChapter.final_content ? (
                  <>
                    <div className="flex items-center justify-between border-b px-4 py-2">
                      <p className="text-sm font-medium text-slate-600">Nội dung đã refine</p>
                      <Button variant="ghost" size="sm" onClick={() => void handleCopyChapter()}>
                        {isCopied
                          ? <><Check className="mr-2 h-4 w-4 text-emerald-600" /> Đã copy</>
                          : <><Copy className="mr-2 h-4 w-4" /> Copy</>}
                      </Button>
                    </div>
                    <Textarea
                      className="min-h-[60vh] resize-y rounded-none border-0 bg-[#fdfbf7] p-4 font-serif text-sm leading-loose text-slate-800 focus-visible:ring-0 sm:p-8 sm:text-lg"
                      value={selectedChapter.final_content}
                      onChange={(event) => handleFinalTextChange(event.target.value)}
                      disabled={isSaving}
                    />
                  </>
                ) : (
                  <div className="space-y-3 p-6 text-sm text-slate-600">
                    <p>Chương này chưa có bản refine. Hãy dùng Planner để tạo hoặc chỉnh beats và refine chương.</p>
                    <Button onClick={() => setShowPlanner(true)}>
                      <Wand2 className="mr-2 h-4 w-4" /> Mở Story Workflow Planner
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Button
                variant="outline"
                onClick={() => void goToChapter(-1)}
                disabled={currentChapterIndex <= 0 || isSaving}
              >
                Chương trước
              </Button>
              <div className="flex flex-wrap gap-2">
                {isFinalDirty && (
                  <Button onClick={() => void handleSaveChanges()} disabled={isSaving}>
                    {isSaving
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <Save className="mr-2 h-4 w-4" />}
                    Lưu bản thảo
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => void goToChapter(1)}
                  disabled={currentChapterIndex >= chapters.length - 1 || isSaving}
                >
                  Chương tiếp
                </Button>
                {selectedChapter.final_content && (
                  <Button onClick={() => router.push(`/project/${projectId}/studio`)}>
                    Vào Studio
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="space-y-3 p-6 text-center text-sm text-slate-600">
              <p>Chưa có chapter trong project này.</p>
              <Button onClick={() => setShowPlanner(true)}>
                <Wand2 className="mr-2 h-4 w-4" /> Mở Story Workflow Planner
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Activity, AlertCircle, BookOpen, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Copy, FileText, Layers, List, Loader2, Map, MapPin, Plus, Save, Sparkles, Trash2, Users, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api-client";
import { createTemporaryId } from "@/lib/utils";

type Chapter = {
  id?: string;
  temp_id?: string;
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

type ChapterIdeaAnalysis = {
  feasibility_score: number | string;
  critique: string;
  suggested_prompt: string;
};

type StoryOutline = {
  content: string;
  confirmed: boolean;
  chapter_signature: Record<string, unknown>[];
  story_bible_signature: string;
};

type BeatGeneration = {
  status: "running" | "completed" | "failed" | "stale" | "not_started";
  completed: number;
  total: number;
  current_chapter?: number | null;
  error?: string;
};

type PacingEvaluation = {
  overall_score: number | string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: {
    chapter_number: number | string;
    issue: string;
    fix: string;
  }[];
};

type StoryBeat = {
  id: string;
  chapter_id: string;
  beat_id: string;
  beat_order: number;
  location: string;
  characters_present: string;
  action_and_dialogue: string;
  emotional_shift: string;
  ai_draft_text: string;
};

const LOCAL_BEAT_ID_PREFIX = "local-";

function isLocalBeat(beatId: string) {
  return beatId.startsWith(LOCAL_BEAT_ID_PREFIX);
}

async function copyTextToClipboard(text: string) {
  let clipboardError: unknown;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (error) {
    clipboardError = error;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.fontSize = "16px";
  document.body.appendChild(textarea);

  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    if (!document.execCommand("copy")) {
      throw new Error("Trình duyệt không cho phép sao chép vào clipboard.");
    }
  } catch (fallbackError) {
    const messages = [clipboardError, fallbackError]
      .filter((error): error is Error => error instanceof Error)
      .map((error) => error.message);
    throw new Error(messages.join(" "));
  } finally {
    textarea.remove();
  }
}

type BeatEvaluation = {
  overall_score: number | string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: {
    chapter_number?: number | string;
    beat_id?: string;
    issue: string;
    fix: string;
  }[];
};

type WorkflowTab = "chapters" | "outline" | "beats";

const PRIMARY_FUNCTIONS = [
  "Setup (Thiết lập cơ bản)",
  "Inciting Incident (Biến cố kích hoạt)",
  "Character Development (Phát triển nhân vật)",
  "Relationship Development (Phát triển quan hệ)",
  "Rising Action (Leo thang xung đột)",
  "Turning Point (Bước ngoặt)",
  "Midpoint (Điểm giữa)",
  "Climax (Cao trào)",
  "Falling Action (Hạ nhiệt)",
  "Resolution (Giải quyết)",
  "Lore (Hé lộ thông tin thế giới/bí mật)",
  "Khác (Chức năng phụ trợ)",
];

const SIGNATURE_FIELDS = [
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

function chapterSignature(chapters: Chapter[]) {
  return chapters.map((chapter) =>
    Object.fromEntries(
      SIGNATURE_FIELDS.map((field) => [field, chapter[field] || ""]),
    ),
  );
}

const emptyChapter = (chapter_number: number): Chapter => ({
  temp_id: createTemporaryId(),
  chapter_number,
  title: `Chương ${chapter_number}`,
  timeline_period: "Hiện tại",
  pov_character: "",
  main_event: "",
  primary_function: "",
  emotional_beat: "",
  relationship_beat: "",
  chapter_hook: "",
  continuity_note: "",
});

function chapterStatusLabel(status?: string) {
  if (!status) return "Chưa bắt đầu";
  if (status === "Refined & Ready for Audio") return "Đã refine";
  if (status === "Beats Generated") return "Đã sinh beats";
  if (status === "Preparing Text") return "Đang chuẩn bị văn bản";
  if (status === "Generating Audio") return "Đang tạo audio";
  if (status === "Audio Generated") return "Đã tạo audio";
  if (status === "Audio Compiled") return "Đã ghép audio";
  if (status === "Rendering") return "Đang render";
  if (status === "Completed") return "Hoàn tất";
  if (status === "Error") return "Có lỗi";
  return status;
}

function isChapterRefined(chapter: Chapter) {
  return Boolean(chapter.final_content?.trim()) || [
    "Refined & Ready for Audio",
    "Preparing Text",
    "Generating Audio",
    "Audio Generated",
    "Audio Compiled",
    "Rendering",
    "Completed",
    "Error",
  ].includes(chapter.status ?? "");
}

function isAccessibleBeatChapter(chapter: Chapter, chapters: Chapter[]) {
  const chapterId = chapter.id;
  if (!chapterId) return false;
  const refinedIds = new Set(
    chapters
      .filter((item) => isChapterRefined(item) && item.id)
      .map((item) => item.id!),
  );

  if (refinedIds.size === 0) return true;
  if (refinedIds.has(chapterId)) return true;

  const chapterIndex = chapters.findIndex((item) => item.id === chapterId);
  if (chapterIndex === -1) return false;

  return chapters.some((item, index) => {
    if (!item.id || !refinedIds.has(item.id)) return false;
    return Math.abs(index - chapterIndex) <= 1;
  });
}

export default function StoryWorkflowPlanner({
  chapters: initialChapters,
  storyOutline: initialOutline,
  outlineBibleCurrent: initialOutlineBibleCurrent,
  beatGeneration: initialGeneration,
  onStartWriting,
  onBack,
}: {
  chapters: Chapter[];
  storyOutline: StoryOutline | null;
  outlineBibleCurrent: boolean;
  beatGeneration: BeatGeneration | null;
  onStartWriting: () => void;
  onBack?: () => void;
}) {
  const params = useParams();
  const projectId = params.id as string;
  const [chapters, setChapters] = useState(initialChapters);
  const [outline, setOutline] = useState(initialOutline);
  const [bibleSignatureCurrent, setBibleSignatureCurrent] = useState(initialOutlineBibleCurrent);
  const [generation, setGeneration] = useState(initialGeneration);
  const [activeTab, setActiveTab] = useState<WorkflowTab>(
    initialChapters.length === 0 ? "chapters" : !initialOutline ? "outline" : "beats",
  );
  const [chaptersDirty, setChaptersDirty] = useState(false);
  const [outlineDirty, setOutlineDirty] = useState(false);
  const [savingChapters, setSavingChapters] = useState(false);
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [savingOutline, setSavingOutline] = useState(false);
  const [startingBeats, setStartingBeats] = useState(false);
  const [creatingChapters, setCreatingChapters] = useState(false);
  const [isChapterGenerationOpen, setIsChapterGenerationOpen] = useState(false);
  const [chapterGenerationError, setChapterGenerationError] = useState<string | null>(null);
  const [chapterPrompt, setChapterPrompt] = useState("");
  const [chapterIdeaText, setChapterIdeaText] = useState("");
  const [chapterIdeaAnalysis, setChapterIdeaAnalysis] = useState<ChapterIdeaAnalysis | null>(null);
  const [analyzingChapterIdea, setAnalyzingChapterIdea] = useState(false);
  const [chapterChangeTarget, setChapterChangeTarget] = useState<{ action: "insert" | "edit"; index: number } | null>(null);
  const [generatingChapter, setGeneratingChapter] = useState<number | null>(null);
  const [chapterChangeError, setChapterChangeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEvaluationOpen, setIsEvaluationOpen] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<PacingEvaluation | null>(null);
  const [evaluatedSignature, setEvaluatedSignature] = useState<string | null>(null);
  const [beatsByChapter, setBeatsByChapter] = useState<Record<string, StoryBeat[]>>({});
  const [loadingWorkflowBeats, setLoadingWorkflowBeats] = useState(
    initialChapters.length > 0 && Boolean(initialOutline),
  );
  const [workflowBeatsError, setWorkflowBeatsError] = useState<string | null>(null);
  const [dirtyBeatIds, setDirtyBeatIds] = useState<Record<string, boolean>>({});
  const [savingBeats, setSavingBeats] = useState(false);
  const [evaluatingBeats, setEvaluatingBeats] = useState(false);
  const [beatEvaluationOpen, setBeatEvaluationOpen] = useState(false);
  const [beatEvaluationError, setBeatEvaluationError] = useState<string | null>(null);
  const [beatEvaluation, setBeatEvaluation] = useState<BeatEvaluation | null>(null);
  const [beatEvaluationScope, setBeatEvaluationScope] = useState<"chapter" | "story">("story");
  const [beatEvaluationChapter, setBeatEvaluationChapter] = useState<Chapter | null>(null);
  const [selectedBeatChapterId, setSelectedBeatChapterId] = useState(initialChapters[0]?.id ?? "");
  const beatViewMode = "chapter" as const;
  const [expandedChapterIds, setExpandedChapterIds] = useState<Record<string, boolean>>({});
  const [refiningChapterId, setRefiningChapterId] = useState<string | null>(null);
  const [dirtyChapterContentIds, setDirtyChapterContentIds] = useState<Record<string, boolean>>({});
  const [savingRefinedChapterId, setSavingRefinedChapterId] = useState<string | null>(null);
  const [draftingWorkflowBeatId, setDraftingWorkflowBeatId] = useState<string | null>(null);
  const [batchDraftingChapterId, setBatchDraftingChapterId] = useState<string | null>(null);
  const [copiedWorkflowBeatPromptId, setCopiedWorkflowBeatPromptId] = useState<string | null>(null);
  const [isPlannerTocOpen, setIsPlannerTocOpen] = useState(false);
  const [activePlannerTocId, setActivePlannerTocId] = useState<string | null>(null);
  const isBatchDrafting = batchDraftingChapterId !== null;

  const currentSignature = useMemo(
    () => JSON.stringify(chapterSignature(chapters)),
    [chapters],
  );
  const outlineMatches = Boolean(
    outline &&
    bibleSignatureCurrent &&
    JSON.stringify(outline.chapter_signature) === currentSignature,
  );
  const canGenerateOutline = chapters.length > 0 && !chaptersDirty && !savingChapters;
  const canConfirmOutline =
    Boolean(outline?.content.trim()) && outlineMatches && !chaptersDirty && !outlineDirty;
  const canEvaluatePacing =
    chapters.length > 0 && !chaptersDirty && !savingChapters && !isEvaluating;
  const dirtyBeatCount = Object.values(dirtyBeatIds).filter(Boolean).length;
  const hasUnsavedLocalBeats = Object.values(beatsByChapter)
    .flat()
    .some((beat) => isLocalBeat(beat.id));
  const hasChaptersWithoutBeats = chapters.some(
    (chapter) => chapter.id && !beatsByChapter[chapter.id]?.length,
  );
  const shouldShowBeatGeneration =
    !loadingWorkflowBeats &&
    (hasChaptersWithoutBeats ||
      generation?.status === "failed" ||
      generation?.status === "stale");
  const accessibleBeatChapterIds = useMemo(
    () =>
      new Set(
        chapters
          .filter((chapter) => isAccessibleBeatChapter(chapter, chapters))
          .map((chapter) => chapter.id)
          .filter((chapterId): chapterId is string => Boolean(chapterId)),
      ),
    [chapters],
  );
  const fallbackBeatChapter = chapters.find((chapter) => chapter.id && accessibleBeatChapterIds.has(chapter.id)) ?? null;
  const selectedBeatChapter = chapters.find((chapter) => chapter.id === selectedBeatChapterId)
    ?? fallbackBeatChapter;
  const selectedBeatChapterIndex = selectedBeatChapter
    ? chapters.findIndex((chapter) => chapter.id === selectedBeatChapter.id)
    : -1;
  const isSelectedBeatChapterRefined = selectedBeatChapter
    ? isChapterRefined(selectedBeatChapter)
    : false;
  const previousBeatChapter = selectedBeatChapterIndex > 0
    ? chapters[selectedBeatChapterIndex - 1]
    : null;
  const nextBeatChapter = selectedBeatChapterIndex >= 0
    ? chapters[selectedBeatChapterIndex + 1]
    : null;

  const loadWorkflowBeats = useCallback(async () => {
    try {
      const result = await apiClient.get<StoryBeat[]>(`/api/projects/${projectId}/beats`);
      const beatsByChapterResult: Record<string, StoryBeat[]> = Object.fromEntries(
        chapters.flatMap((chapter) => chapter.id ? [[chapter.id, [] as StoryBeat[]]] : []),
      );
      for (const beat of result.data ?? []) {
        (beatsByChapterResult[beat.chapter_id] ??= []).push(beat);
      }
      setBeatsByChapter(beatsByChapterResult);
      setWorkflowBeatsError(null);
    } catch (requestError) {
      setWorkflowBeatsError(
        requestError instanceof Error ? requestError.message : "Không thể tải danh sách beats.",
      );
    } finally {
      setLoadingWorkflowBeats(false);
    }
  }, [chapters, projectId]);

  useEffect(() => {
    if (activeTab !== "beats" || chapters.length === 0) return;
    const timer = window.setTimeout(() => {
      setLoadingWorkflowBeats(true);
      void loadWorkflowBeats();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeTab, chapters.length, generation?.status, loadWorkflowBeats]);

  const refreshWorkflowBeats = async () => {
    setLoadingWorkflowBeats(true);
    setWorkflowBeatsError(null);
    await loadWorkflowBeats();
  };

  const scrollToPlannerBeat = (beatId: string) => {
    const beatElement = document.getElementById(`planner-beat-${beatId}`);
    beatElement?.querySelector("details")?.setAttribute("open", "");
    beatElement?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const navigateToPlannerBeat = (chapterId: string, beatId: string) => {
    setSelectedBeatChapterId(chapterId);
    setExpandedChapterIds((current) => ({ ...current, [chapterId]: true }));
    window.setTimeout(() => scrollToPlannerBeat(beatId), 50);
    setIsPlannerTocOpen(false);
  };

  const scrollToPlannerChapter = (chapterId: string) => {
    setSelectedBeatChapterId(chapterId);
    setExpandedChapterIds((current) => ({ ...current, [chapterId]: true }));
    window.setTimeout(() => {
    document.getElementById(`planner-chapter-${chapterId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    }, 50);
  };

  const setWorkflowBeatDraft = (chapterId: string, beatId: string, text: string) => {
    setBeatsByChapter((current) => ({
      ...current,
      [chapterId]: (current[chapterId] ?? []).map((beat) =>
        beat.id === beatId ? { ...beat, ai_draft_text: text } : beat,
      ),
    }));
    setDirtyBeatIds((current) => {
      const next = { ...current };
      delete next[beatId];
      return next;
    });
  };

  const previousWorkflowBeatText = (chapter: Chapter, beatIndex: number) => {
    const chapterBeats = chapter.id ? beatsByChapter[chapter.id] ?? [] : [];
    if (beatIndex > 0) {
      return chapterBeats[beatIndex - 1]?.ai_draft_text ?? "";
    }

    const chapterIndex = chapters.findIndex((item) => item.id === chapter.id);
    if (chapterIndex <= 0) return "";
    const previousChapter = chapters[chapterIndex - 1];
    if (!previousChapter.id) return "";
    const previousChapterBeats = beatsByChapter[previousChapter.id] ?? [];
    return previousChapterBeats.at(-1)?.ai_draft_text ?? "";
  };

  const copyWorkflowBeatPrompt = async (chapter: Chapter, beat: StoryBeat, index: number) => {
    if (isChapterRefined(chapter)) return;
    setWorkflowBeatsError(null);
    if (hasUnsavedLocalBeats) {
      setWorkflowBeatsError("Hãy lưu các beat mới trước khi sao chép prompt.");
      return;
    }
    if (dirtyBeatCount > 0 && !(await saveWorkflowBeats())) return;
    try {
      const previousText = previousWorkflowBeatText(chapter, index);
      const query = new URLSearchParams({ previous_text: previousText.slice(-1500) });
      const result = await apiClient.get<{ system_prompt: string; user_prompt: string }>(
        `/api/beats/${beat.id}/draft-prompt?${query.toString()}`,
      );
      if (!result.data?.system_prompt || !result.data.user_prompt) {
        throw new Error("Backend không trả về đầy đủ prompt tạo draft beat.");
      }
      const fullPrompt = [
        "SYSTEM PROMPT",
        result.data.system_prompt,
        "",
        "USER PROMPT",
        result.data.user_prompt,
      ].join("\n");
      await copyTextToClipboard(fullPrompt);
      setCopiedWorkflowBeatPromptId(beat.id);
      window.setTimeout(() => {
        setCopiedWorkflowBeatPromptId((current) => current === beat.id ? null : current);
      }, 2000);
    } catch (copyError) {
      setWorkflowBeatsError(
        copyError instanceof Error ? `Không thể sao chép prompt tạo draft beat: ${copyError.message}` : "Không thể sao chép prompt tạo draft beat.",
      );
    }
  };

  const draftWorkflowBeat = async (chapter: Chapter, beat: StoryBeat, index: number) => {
    if (!chapter.id || isChapterRefined(chapter) || draftingWorkflowBeatId || batchDraftingChapterId) return;
    if (hasUnsavedLocalBeats) {
      setWorkflowBeatsError("Hãy lưu các beat mới trước khi tiếp tục dùng AI.");
      return;
    }
    if (dirtyBeatCount > 0 && !(await saveWorkflowBeats())) return;
    if (
      beat.ai_draft_text?.trim() &&
      !window.confirm(`AI sẽ thay nội dung nháp hiện tại của ${beat.beat_id}. Tiếp tục?`)
    ) return;
    setWorkflowBeatsError(null);
    setDraftingWorkflowBeatId(beat.id);
    try {
      const previousText = previousWorkflowBeatText(chapter, index);
      const query = new URLSearchParams({
        previous_text: previousText.slice(-1500),
      });
      const result = await apiClient.post<{ text: string }>(
        `/api/beats/${beat.id}/draft?${query.toString()}`,
      );
      if (typeof result.text !== "string") {
        throw new Error("Backend không trả về nội dung nháp của beat.");
      }
      setWorkflowBeatDraft(chapter.id, beat.id, result.text);
      markChapterDraftStale(chapter.id, "Draft Completed");
      setExpandedChapterIds((current) => ({ ...current, [chapter.id!]: true }));
      scrollToPlannerBeat(beat.id);
    } catch (requestError) {
      setWorkflowBeatsError(
        requestError instanceof Error ? requestError.message : `Không thể viết nháp ${beat.beat_id}.`,
      );
    } finally {
      setDraftingWorkflowBeatId(null);
    }
  };

  const batchDraftWorkflowChapter = async (chapter: Chapter, chapterBeats: StoryBeat[]) => {
    if (!chapter.id || isChapterRefined(chapter) || !chapterBeats.length || batchDraftingChapterId || draftingWorkflowBeatId) return;
    if (hasUnsavedLocalBeats) {
      setWorkflowBeatsError("Hãy lưu các beat mới trước khi tiếp tục dùng AI.");
      return;
    }
    if (dirtyBeatCount > 0 && !(await saveWorkflowBeats())) return;
    const hasExistingDrafts = chapterBeats.some((beat) => beat.ai_draft_text?.trim());
    if (
      hasExistingDrafts &&
      !window.confirm("AI sẽ viết lại toàn bộ nội dung nháp hiện có trong chapter này. Tiếp tục?")
    ) return;
    setWorkflowBeatsError(null);
    markChapterDraftStale(chapter.id, "Drafting");
    setBatchDraftingChapterId(chapter.id);
    try {
      const previousText = previousWorkflowBeatText(chapter, 0);
      const query = new URLSearchParams({ previous_text: previousText.slice(-1500) });
      await apiClient.post(`/api/chapters/${chapter.id}/batch-draft?${query.toString()}`);
      const result = await apiClient.get<StoryBeat[]>(`/api/chapters/${chapter.id}/beats`);
      setBeatsByChapter((current) => ({ ...current, [chapter.id!]: result.data ?? [] }));
      markChapterDraftStale(chapter.id, "Draft Completed");
      setExpandedChapterIds((current) => ({ ...current, [chapter.id!]: true }));
    } catch (requestError) {
      setWorkflowBeatsError(
        requestError instanceof Error ? requestError.message : "Không thể viết nháp toàn bộ beats trong chapter.",
      );
    } finally {
      setBatchDraftingChapterId(null);
    }
  };

  useEffect(() => {
    if (activeTab !== "beats") return;
    const targets = document.querySelectorAll<HTMLElement>("[data-planner-toc-id]");
    if (targets.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (visible) setActivePlannerTocId((visible.target as HTMLElement).dataset.plannerTocId ?? null);
    }, { rootMargin: "-15% 0px -65% 0px", threshold: [0, 0.1, 0.5, 1] });
    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [activeTab, beatsByChapter, beatViewMode, expandedChapterIds]);

  const updateWorkflowBeat = (chapterId: string, beatId: string, field: keyof StoryBeat, value: string) => {
    if (isBatchDrafting) return;
    setBeatsByChapter((current) => ({
      ...current,
      [chapterId]: (current[chapterId] ?? []).map((beat) =>
        beat.id === beatId ? { ...beat, [field]: value } : beat,
      ),
    }));
    setDirtyBeatIds((current) => ({ ...current, [beatId]: true }));
  };

  const markChapterDraftStale = (chapterId: string, status = "Beats Generated") => {
    setChapters((current) => current.map((chapter) =>
      chapter.id === chapterId
        ? { ...chapter, status, final_content: null }
        : chapter,
    ));
    setDirtyChapterContentIds((current) => {
      const next = { ...current };
      delete next[chapterId];
      return next;
    });
  };

  const updateRefinedChapterContent = (chapterId: string, content: string) => {
    setChapters((current) => current.map((chapter) =>
      chapter.id === chapterId ? { ...chapter, final_content: content } : chapter,
    ));
    setDirtyChapterContentIds((current) => ({ ...current, [chapterId]: true }));
    setWorkflowBeatsError(null);
  };

  const saveRefinedChapterContent = async (chapterId: string) => {
    const chapter = chapters.find((item) => item.id === chapterId);
    if (!chapter || savingRefinedChapterId) return;
    setSavingRefinedChapterId(chapterId);
    setWorkflowBeatsError(null);
    try {
      await apiClient.put(`/api/chapters/${chapterId}`, {
        final_content: chapter.final_content ?? "",
      });
      setDirtyChapterContentIds((current) => {
        const next = { ...current };
        delete next[chapterId];
        return next;
      });
    } catch (requestError) {
      setWorkflowBeatsError(
        requestError instanceof Error ? requestError.message : "Không lưu được nội dung chương đã refine.",
      );
    } finally {
      setSavingRefinedChapterId(null);
    }
  };

  const saveWorkflowBeats = async (): Promise<boolean> => {
    if (savingBeats || isBatchDrafting) return false;
    const pending = Object.keys(dirtyBeatIds).filter((beatId) => dirtyBeatIds[beatId]);
    if (pending.length === 0) return true;
    setSavingBeats(true);
    setWorkflowBeatsError(null);
    try {
      const dirtyBeats = Object.values(beatsByChapter).flat().filter((beat) => pending.includes(beat.id));
      const existingBeats = dirtyBeats.filter((beat) => !isLocalBeat(beat.id));
      const newBeats = dirtyBeats.filter((beat) => isLocalBeat(beat.id));
      await Promise.all(existingBeats.map((beat) =>
        apiClient.put(`/api/beats/${beat.id}`, {
          location: beat.location,
          characters_present: beat.characters_present,
          action_and_dialogue: beat.action_and_dialogue,
          emotional_shift: beat.emotional_shift,
        }),
      ));
      if (existingBeats.length > 0) {
        await apiClient.put("/api/beats/bulk-update", {
          beats: existingBeats.map((beat) => ({
            id: beat.id,
            draft_text: beat.ai_draft_text,
          })),
        });
      }

      new Set(existingBeats.map((beat) => beat.chapter_id)).forEach((chapterId) =>
        markChapterDraftStale(chapterId),
      );
      setDirtyBeatIds((current) => {
        const next = { ...current };
        existingBeats.forEach((beat) => delete next[beat.id]);
        return next;
      });
      for (const chapter of chapters) {
        if (!chapter.id) continue;
        const chapterNewBeats = newBeats
          .filter((beat) => beat.chapter_id === chapter.id)
          .sort((left, right) =>
            (beatsByChapter[chapter.id!]?.findIndex((beat) => beat.id === left.id) ?? 0) -
            (beatsByChapter[chapter.id!]?.findIndex((beat) => beat.id === right.id) ?? 0),
          );
        for (const beat of chapterNewBeats) {
          const chapterBeats = beatsByChapter[chapter.id] ?? [];
          const insertIndex = chapterBeats.findIndex((item) => item.id === beat.id);
          const result = await apiClient.post<StoryBeat>(`/api/chapters/${chapter.id}/beats`, {
            insert_index: insertIndex,
            location: beat.location,
            characters_present: beat.characters_present,
            action_and_dialogue: beat.action_and_dialogue,
            emotional_shift: beat.emotional_shift,
            draft_text: beat.ai_draft_text,
          });
          const createdBeat = result.data;
          if (!createdBeat?.id) {
            throw new Error("Backend không trả về beat vừa lưu.");
          }

          setBeatsByChapter((current) => ({
            ...current,
            [chapter.id!]: (current[chapter.id!] ?? [])
              .map((item) => item.id === beat.id ? createdBeat : item)
              .map((item, index) => ({
                ...item,
                beat_order: index + 1,
                beat_id: `C${chapter.chapter_number}_B${index + 1}`,
              })),
          }));
          setDirtyBeatIds((current) => {
            const next = { ...current };
            delete next[beat.id];
            return next;
          });
          markChapterDraftStale(chapter.id);
        }
      }

      return true;
    } catch (requestError) {
      setWorkflowBeatsError(
        requestError instanceof Error ? requestError.message : "Không lưu được các thay đổi beats.",
      );
      return false;
    } finally {
      setSavingBeats(false);
    }
  };

  const refineChapterBeats = async (chapter: Chapter) => {
    if (!chapter.id || generation?.status === "running" || isBatchDrafting) return;
    setWorkflowBeatsError(null);
    if (hasUnsavedLocalBeats) {
      setWorkflowBeatsError("Hãy lưu các beat mới trước khi refine chapter.");
      return;
    }
    if (dirtyBeatCount > 0 && !(await saveWorkflowBeats())) return;
    setRefiningChapterId(chapter.id);
    try {
      const result = await apiClient.post<{ final_content: string }>(`/api/chapters/${chapter.id}/refine`);
      if (typeof result?.final_content !== "string") {
        throw new Error("Backend không trả về nội dung chapter đã biên tập.");
      }
      const refinedContent = result.final_content;
      setChapters((current) => current.map((item) =>
        item.id === chapter.id
          ? { ...item, status: "Refined & Ready for Audio", final_content: refinedContent }
          : item,
      ));
    } catch (requestError) {
      setWorkflowBeatsError(requestError instanceof Error ? requestError.message : "Không thể biên tập nội dung chapter.");
    } finally {
      setRefiningChapterId(null);
    }
  };

  const insertWorkflowBeat = (chapter: Chapter, insertIndex: number) => {
    if (!chapter.id || isChapterRefined(chapter) || isBatchDrafting) return;
    setWorkflowBeatsError(null);
    const beatId = `${LOCAL_BEAT_ID_PREFIX}${createTemporaryId()}`;
    const newBeat: StoryBeat = {
      id: beatId,
      chapter_id: chapter.id,
      beat_id: "Beat mới",
      beat_order: insertIndex + 1,
      location: "Chưa xác định",
      characters_present: "",
      action_and_dialogue: "Action: \nDialogue: ",
      emotional_shift: "",
      ai_draft_text: "",
    };
    setBeatsByChapter((current) => {
      const chapterBeats = [...(current[chapter.id!] ?? [])];
      chapterBeats.splice(insertIndex, 0, newBeat);
      return { ...current, [chapter.id!]: chapterBeats };
    });
    setDirtyBeatIds((current) => ({ ...current, [beatId]: true }));
    setExpandedChapterIds((current) => ({ ...current, [chapter.id!]: true }));
  };

  const deleteWorkflowBeat = async (beat: StoryBeat) => {
    const chapter = chapters.find((item) => item.id === beat.chapter_id);
    if (isBatchDrafting || (chapter && isChapterRefined(chapter))) return;
    if (isLocalBeat(beat.id)) {
      if (!window.confirm("Xóa beat mới chưa lưu?")) return;
      setBeatsByChapter((current) => ({
        ...current,
        [beat.chapter_id]: (current[beat.chapter_id] ?? []).filter((item) => item.id !== beat.id),
      }));
      setDirtyBeatIds((current) => {
        const next = { ...current };
        delete next[beat.id];
        return next;
      });
      return;
    }
    const confirmation = dirtyBeatCount > 0
      ? `Có thay đổi beats chưa lưu. Xóa ${beat.beat_id} sẽ tải lại dữ liệu và bỏ các thay đổi đó. Tiếp tục?`
      : `Xóa ${beat.beat_id}? Thao tác này không thể hoàn tác.`;
    if (!window.confirm(confirmation)) return;
    setWorkflowBeatsError(null);
    try {
      await apiClient.delete(`/api/beats/${beat.id}`);
      setDirtyBeatIds({});
      markChapterDraftStale(beat.chapter_id);
      await refreshWorkflowBeats();
    } catch (requestError) {
      setWorkflowBeatsError(requestError instanceof Error ? requestError.message : "Không thể xóa beat.");
    }
  };

  const evaluateBeats = async (scope: "chapter" | "story", chapter?: Chapter) => {
    if (isBatchDrafting) return;
    setBeatEvaluationScope(scope);
    setBeatEvaluationChapter(chapter ?? null);
    setBeatEvaluation(null);
    setBeatEvaluationError(null);
    setBeatEvaluationOpen(true);
    if (dirtyBeatCount > 0) {
      setBeatEvaluationError("Bạn có beats chưa lưu. Hãy lưu trước khi chấm điểm để AI đánh giá đúng dữ liệu mới nhất.");
      return;
    }
    setEvaluatingBeats(true);
    try {
      const result = await apiClient.post<BeatEvaluation>(`/api/projects/${projectId}/evaluate-beats`, {
        scope,
        chapter_id: chapter?.id,
      });
      setBeatEvaluation(result.data);
    } catch (requestError) {
      setBeatEvaluationError(
        requestError instanceof Error ? requestError.message : "Không thể đánh giá beats.",
      );
    } finally {
      setEvaluatingBeats(false);
    }
  };

  useEffect(() => {
    if (generation?.status !== "running") return;
    const timer = window.setInterval(() => {
      apiClient
        .get<BeatGeneration>(`/api/projects/${projectId}/beat-generation`)
        .then((result) => {
          if (result.success && result.data) {
            setGeneration(result.data);
          }
        })
        .catch((requestError) => {
          setError(requestError instanceof Error ? requestError.message : "Không tải được tiến độ sinh beats.");
        });
    }, 2000);
    return () => window.clearInterval(timer);
  }, [generation?.status, onStartWriting, projectId]);

  const updateChapter = (index: number, field: keyof Chapter, value: string) => {
    setChapters((current) =>
      current.map((chapter, chapterIndex) =>
        chapterIndex === index ? { ...chapter, [field]: value } : chapter,
      ),
    );
    setChaptersDirty(true);
  };

  const addChapterAt = (index: number) => {
    setChapters((current) => {
      const updated = [...current];
      updated.splice(index, 0, emptyChapter(index + 1));
      return updated.map((chapter, chapterIndex) => ({
        ...chapter,
        chapter_number: chapterIndex + 1,
      }));
    });
    setChaptersDirty(true);
  };

  const removeChapter = (index: number) => {
    if (!window.confirm("Bạn có chắc muốn xóa chapter này không? Beats và bản nháp liên quan sẽ bị xóa khi lưu.")) return;
    setChapters((current) =>
      current
        .filter((_, chapterIndex) => chapterIndex !== index)
        .map((chapter, chapterIndex) => ({ ...chapter, chapter_number: chapterIndex + 1 })),
    );
    setChaptersDirty(true);
  };

  const evaluatePacing = async () => {
    if (chaptersDirty) {
      setEvaluationError("Bạn có thay đổi chưa lưu. Hãy lưu danh sách chapter trước khi đánh giá.");
      setIsEvaluationOpen(true);
      return;
    }

    setIsEvaluationOpen(true);
    setEvaluationError(null);
    if (evaluation && evaluatedSignature === currentSignature) return;

    setIsEvaluating(true);
    try {
      const result = await apiClient.post<PacingEvaluation>(
        `/api/projects/${projectId}/evaluate-pacing`,
      );
      setEvaluation(result.data);
      setEvaluatedSignature(currentSignature);
    } catch (requestError) {
      setEvaluationError(
        requestError instanceof Error ? requestError.message : "Không thể đánh giá cấu trúc chapter.",
      );
    } finally {
      setIsEvaluating(false);
    }
  };

  const saveChapters = async () => {
    setSavingChapters(true);
    setError(null);
    try {
      const payload = chapters.map((chapter, index) => ({
        id: chapter.id ?? null,
        chapter_number: index + 1,
        title: chapter.title.trim() || `Chương ${index + 1}`,
        timeline_period: chapter.timeline_period || "",
        pov_character: Array.isArray(chapter.pov_character)
          ? chapter.pov_character.join(", ")
          : chapter.pov_character || "",
        main_event: chapter.main_event || "",
        primary_function: chapter.primary_function || "",
        emotional_beat: chapter.emotional_beat || "",
        relationship_beat: chapter.relationship_beat || "",
        chapter_hook: chapter.chapter_hook || "",
        continuity_note: chapter.continuity_note || "",
      }));
      await apiClient.put(`/api/projects/${projectId}/bulk-update-chapters`, { chapters: payload });
      const refreshed = await apiClient.get<Chapter[]>(`/api/projects/${projectId}/chapters`);
      setChapters(refreshed.data);
      setChaptersDirty(false);
      setOutline((current) => current ? { ...current, confirmed: false } : current);
      setGeneration((current) =>
        current && current.status !== "running" && current.completed > 0
          ? { ...current, status: "stale" }
          : current,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không lưu được danh sách chapter.");
    } finally {
      setSavingChapters(false);
    }
  };

  const generateChapters = async () => {
    if (chapters.length > 0) return;
    setCreatingChapters(true);
    setChapterGenerationError(null);
    try {
      await apiClient.post(`/api/projects/${projectId}/generate-pacing`);
      const refreshed = await apiClient.get<Chapter[]>(`/api/projects/${projectId}/chapters`);
      setChapters(refreshed.data);
      setChaptersDirty(false);
      setIsChapterGenerationOpen(false);
    } catch (requestError) {
      setChapterGenerationError(requestError instanceof Error ? requestError.message : "Không thể tạo danh sách chapter.");
    } finally {
      setCreatingChapters(false);
    }
  };

  const openChapterChangeDialog = (action: "insert" | "edit", index: number) => {
    setChapterChangeTarget({ action, index });
    setChapterPrompt("");
    setChapterIdeaText("");
    setChapterIdeaAnalysis(null);
    setChapterChangeError(null);
  };

  const analyzeChapterIdea = async () => {
    if (!chapterChangeTarget || chapterChangeTarget.action !== "insert" || !chapterIdeaText.trim()) {
      setChapterChangeError("Nhập ý tưởng trước khi phân tích.");
      return;
    }
    setAnalyzingChapterIdea(true);
    setChapterChangeError(null);
    try {
      const result = await apiClient.post<ChapterIdeaAnalysis>(
        `/api/projects/${projectId}/analyze-chapter-idea`,
        {
          action_type: "insert",
          target_index: chapterChangeTarget.index,
          user_prompt: chapterIdeaText.trim(),
          current_chapters: chapters,
        },
      );
      if (!result.data || typeof result.data.critique !== "string") {
        throw new Error("AI không trả về nhận xét hợp lệ cho ý tưởng chapter.");
      }
      setChapterIdeaAnalysis(result.data);
      setChapterPrompt("");
    } catch (requestError) {
      setChapterChangeError(requestError instanceof Error ? requestError.message : "Không thể phân tích ý tưởng chapter.");
    } finally {
      setAnalyzingChapterIdea(false);
    }
  };

  const generateChapterChange = async () => {
    if (!chapterChangeTarget || !chapterPrompt.trim()) {
      setChapterChangeError("Nhập yêu cầu cho AI trước khi tạo hoặc sửa chapter.");
      return;
    }
    const { action, index } = chapterChangeTarget;
    if (action === "insert" && !chapterIdeaAnalysis) {
      setChapterChangeError("Hãy phân tích và xem nhận xét ý tưởng trước khi xác nhận chèn chapter.");
      return;
    }
    setGeneratingChapter(index);
    setChapterChangeError(null);
    try {
      const result = await apiClient.post<Chapter[]>(
        `/api/projects/${projectId}/generate-dynamic-chapters`,
        {
          action_type: action,
          target_index: index,
          user_prompt: chapterPrompt.trim(),
          current_chapters: chapters,
        },
      );
      if (!Array.isArray(result.data) || result.data.length === 0) {
        throw new Error("AI không trả về chapter hợp lệ.");
      }
      const generated = result.data.map((chapter) => ({
        ...emptyChapter(1),
        ...chapter,
        temp_id: createTemporaryId(),
      }));
      const updated = [...chapters];
      if (action === "insert") {
        updated.splice(index, 0, ...generated);
      } else {
        if (chapters[index]?.id) generated[0].id = chapters[index].id;
        updated.splice(index, 1, ...generated);
      }
      setChapters(updated.map((chapter, chapterIndex) => ({
        ...chapter,
        chapter_number: chapterIndex + 1,
      })));
      setChaptersDirty(true);
      setOutline((current) => current ? { ...current, confirmed: false } : current);
      setChapterPrompt("");
      setChapterIdeaText("");
      setChapterIdeaAnalysis(null);
      setChapterChangeTarget(null);
    } catch (requestError) {
      setChapterChangeError(requestError instanceof Error ? requestError.message : "Không thể tạo/sửa chapter bằng AI.");
    } finally {
      setGeneratingChapter(null);
    }
  };

  const generateOutline = async () => {
    setGeneratingOutline(true);
    setError(null);
    try {
      const result = await apiClient.post<StoryOutline>(
        `/api/projects/${projectId}/generate-story-outline`,
      );
      setOutline(result.data);
      setBibleSignatureCurrent(true);
      setOutlineDirty(false);
      setActiveTab("outline");
      setGeneration((current) =>
        current && current.status !== "running" && current.completed > 0
          ? { ...current, status: "stale" }
          : current,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể tạo dàn ý story.");
    } finally {
      setGeneratingOutline(false);
    }
  };

  const saveOutline = async (confirmed: boolean) => {
    if (!outline || !canGenerateOutline) return;
    setSavingOutline(true);
    setError(null);
    try {
      const result = await apiClient.put<StoryOutline>(`/api/projects/${projectId}/story-outline`, {
        story_outline: outline.content,
        confirmed,
        chapter_signature: chapterSignature(chapters),
        story_bible_signature: outline.story_bible_signature,
      });
      setOutline(result.data);
      setBibleSignatureCurrent(true);
      setOutlineDirty(false);
      if (confirmed) setActiveTab("beats");
      if (outlineDirty && generation && generation.status !== "running" && generation.completed > 0) {
        setGeneration({ status: "stale", completed: 0, total: chapters.length });
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không lưu được dàn ý story.");
    } finally {
      setSavingOutline(false);
    }
  };

  const startBeatGeneration = async () => {
    if (!outline?.confirmed || !outlineMatches) return;
    const resetExisting = generation?.status === "stale"
      ? window.confirm(
          "Danh sách chapter hoặc dàn ý đã thay đổi. Sinh lại sẽ xóa toàn bộ beats và bản chapter cuối hiện có trước khi tạo mới. Tiếp tục?",
        )
      : false;
    if (generation?.status === "stale" && !resetExisting) return;
    setStartingBeats(true);
    setError(null);
    try {
      const result = await apiClient.post<BeatGeneration>(
        `/api/projects/${projectId}/generate-all-beats`,
        { reset_existing: resetExisting },
      );
      setGeneration(result.data);
      setActiveTab("beats");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Không thể bắt đầu sinh beats.");
    } finally {
      setStartingBeats(false);
    }
  };

  return (
    <main className="min-h-full bg-slate-50 p-[clamp(0.75rem,2vw,2rem)] 2xl:pr-64">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Writer Room · Lập kế hoạch</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">Dựng mạch truyện trước khi viết</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Sinh chapter, duyệt dàn ý story tổng thể, sau đó tạo beats tuần tự để mỗi chương kế thừa những gì đã xảy ra trước đó.
            </p>
          </div>
          {onBack && (
            <Button
              variant="outline"
              onClick={() => {
                if ((chaptersDirty || outlineDirty) && !window.confirm("Rời kế hoạch sẽ bỏ các thay đổi chưa lưu. Tiếp tục?")) return;
                onBack();
              }}
            >
              Quay lại Writer Room
            </Button>
          )}
        </header>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as WorkflowTab)} className="w-full">
          <TabsList className="grid min-h-12 w-full grid-cols-3 items-stretch gap-1 bg-slate-200 p-1">
            <TabsTrigger value="chapters" disabled={isBatchDrafting} className="!h-auto min-h-10 self-stretch px-2 text-xs sm:text-sm">
              <BookOpen className="mr-1 h-4 w-4 sm:mr-2" /> <span>1. Chapter</span>
              {chapters.length > 0 && <span className="ml-1 rounded-full bg-white/80 px-1.5 text-[10px]">{chapters.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="outline" disabled={isBatchDrafting} className="!h-auto min-h-10 self-stretch px-2 text-xs sm:text-sm">
              <FileText className="mr-1 h-4 w-4 sm:mr-2" /> <span>2. Dàn ý story</span>
              {outline?.confirmed && outlineMatches && <CheckCircle2 className="ml-1 h-3.5 w-3.5 text-green-600" />}
            </TabsTrigger>
            <TabsTrigger value="beats" className="!h-auto min-h-10 self-stretch px-2 text-xs sm:text-sm">
              <Wand2 className="mr-1 h-4 w-4 sm:mr-2" /> <span>3. Sinh beats</span>
              {generation?.status === "completed" && <CheckCircle2 className="ml-1 h-3.5 w-3.5 text-green-600" />}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chapters" className="mt-4">
            <Card className="min-h-[50vh] border-slate-200 shadow-sm">
              <CardHeader className="flex flex-col gap-4 border-b bg-white sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-indigo-600" />
                    Khung Chương (Pacing)
                  </CardTitle>
                  <p className="mt-1 text-sm text-slate-500">
                    Tạo, sắp xếp và hoàn thiện khung chương trước khi tổng hợp thành dàn ý story.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    className="border-amber-200 text-amber-700 hover:bg-amber-50"
                    disabled={chapters.length === 0 || chaptersDirty || savingChapters}
                    onClick={() => setActiveTab("outline")}
                  >
                    <Activity className="mr-2 h-4 w-4" /> Sang dàn ý story
                  </Button>
                  <Button
                    variant="outline"
                    disabled={creatingChapters || chapters.length > 0}
                    onClick={() => {
                      setChapterGenerationError(null);
                      setIsChapterGenerationOpen(true);
                    }}
                  >
                    <Wand2 className="mr-2 h-4 w-4" />
                    Nhờ AI chẻ chương
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="relative space-y-6 bg-slate-50 p-4 sm:p-6">
                {chapters.length > 0 ? (
                  <>
                    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                      <h2 className="mb-4 flex items-center text-sm font-bold uppercase tracking-wider text-slate-700">
                        <Map className="mr-2 h-4 w-4 text-indigo-500" /> Toàn cảnh mạch truyện
                      </h2>
                      <div className="flex gap-3 overflow-x-auto px-1 pb-3 pt-1">
                        {chapters.map((chapter, index) => (
                          <article
                            key={chapter.id ?? chapter.temp_id}
                            className="group relative min-w-[220px] max-w-[220px] shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-indigo-300"
                          >
                            <div className="absolute left-0 top-0 h-full w-1 bg-indigo-400 opacity-70" />
                            <p className="mb-1 text-[10px] font-black text-indigo-600">CHƯƠNG {index + 1}</p>
                            <p className="line-clamp-1 text-sm font-bold text-slate-800">{chapter.title || "Chưa có tên"}</p>
                            <p className="mt-1 truncate text-xs text-slate-500">{chapter.pov_character || "Chưa chọn POV"}</p>
                            <Badge variant="outline" className="mt-2 border-slate-200 bg-white text-[9px] text-slate-600">
                              {chapter.primary_function ? chapter.primary_function.split("(")[0].trim() : "Chưa phân loại"}
                            </Badge>
                          </article>
                        ))}
                      </div>
                    </section>

                    <div className="flex flex-wrap justify-center gap-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full bg-white px-4 text-xs text-slate-600 shadow-sm"
                        onClick={() => addChapterAt(0)}
                      >
                        <Plus className="mr-1 h-3 w-3" /> Chèn mở đầu
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full border-indigo-200 bg-indigo-50 px-4 text-xs text-indigo-700 shadow-sm hover:bg-indigo-100"
                        disabled={generatingChapter !== null}
                        onClick={() => openChapterChangeDialog("insert", 0)}
                      >
                        {generatingChapter === 0 ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                        AI chèn mở đầu
                      </Button>
                    </div>

                    {chapters.map((chapter, index) => (
                      <div key={chapter.id ?? chapter.temp_id} className="relative">
                        <section className="group relative flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-300 sm:p-5">
                          <div className="absolute -right-2 -top-3 z-10 flex gap-2 opacity-100 transition-opacity sm:right-2 sm:top-2 sm:opacity-0 sm:group-hover:opacity-100">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-8 rounded-full border border-slate-200 bg-white text-indigo-600 shadow-md hover:bg-indigo-50"
                              disabled={generatingChapter !== null}
                              onClick={() => openChapterChangeDialog("edit", index)}
                            >
                              {generatingChapter === index ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                              AI sửa
                            </Button>
                            <Button
                              variant="destructive"
                              size="icon"
                              aria-label={`Xóa chương ${index + 1}`}
                              className="h-8 w-8 rounded-full shadow-md"
                              onClick={() => removeChapter(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
                            <div className="flex w-full flex-col items-start gap-3 sm:flex-row sm:items-end">
                              <div className="whitespace-nowrap rounded-md bg-slate-100 px-3 py-1 text-xl font-black text-slate-800">
                                Chương {index + 1}
                              </div>
                              <div className="w-full space-y-1 sm:max-w-[300px]">
                                <Label htmlFor={`chapter-title-${index}`} className="ml-1 text-[10px] uppercase tracking-widest text-slate-400">Tiêu đề</Label>
                                <Input
                                  id={`chapter-title-${index}`}
                                  className="h-9 border-slate-200 font-bold text-slate-700 focus-visible:ring-indigo-500"
                                  value={chapter.title || ""}
                                  onChange={(event) => updateChapter(index, "title", event.target.value)}
                                  placeholder="Nhập tiêu đề..."
                                />
                              </div>
                            </div>

                            <div className="grid w-full grid-cols-2 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-2 md:w-auto md:min-w-[290px]">
                              <div className="min-w-0 space-y-1">
                                <Label htmlFor={`chapter-timeline-${index}`} className="ml-1 text-[10px] uppercase tracking-widest text-amber-600">Mốc thời gian</Label>
                                <Input
                                  id={`chapter-timeline-${index}`}
                                  className="h-8 border-amber-200 bg-amber-50/50 text-xs font-semibold text-amber-800"
                                  value={chapter.timeline_period || ""}
                                  onChange={(event) => updateChapter(index, "timeline_period", event.target.value)}
                                  placeholder="Ví dụ: Hiện tại"
                                />
                              </div>
                              <div className="min-w-0 space-y-1">
                                <Label htmlFor={`chapter-pov-${index}`} className="ml-1 text-[10px] uppercase tracking-widest text-indigo-600">Góc nhìn (POV)</Label>
                                <Input
                                  id={`chapter-pov-${index}`}
                                  className="h-8 border-indigo-200 bg-indigo-50/50 text-xs font-semibold text-indigo-800"
                                  value={chapter.pov_character || ""}
                                  onChange={(event) => updateChapter(index, "pov_character", event.target.value)}
                                  placeholder="Nhân vật..."
                                />
                              </div>
                            </div>
                          </div>

                          <Separator className="bg-slate-100" />

                          <div className="flex flex-col gap-5">
                            <div className="w-full space-y-2 md:max-w-[380px]">
                              <Label htmlFor={`chapter-function-${index}`} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                🎯 Chức năng (Primary Function)
                              </Label>
                              <Select
                                value={chapter.primary_function || ""}
                                onValueChange={(value) => updateChapter(index, "primary_function", value ?? "")}
                              >
                                <SelectTrigger id={`chapter-function-${index}`} className="h-10 border-slate-200 bg-slate-50 font-medium text-slate-700 focus:ring-indigo-500">
                                  <SelectValue placeholder="Chọn chức năng..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-[350px] min-w-[300px]">
                                  {PRIMARY_FUNCTIONS.map((item) => (
                                    <SelectItem key={item} value={item} className="py-2.5">{item}</SelectItem>
                                  ))}
                                  {chapter.primary_function && !PRIMARY_FUNCTIONS.includes(chapter.primary_function) && (
                                    <SelectItem value={chapter.primary_function} className="py-2.5 italic text-amber-600">
                                      {chapter.primary_function} (Cũ)
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor={`chapter-event-${index}`} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                🎬 Sự kiện chính (Main Event)
                              </Label>
                              <Textarea
                                id={`chapter-event-${index}`}
                                className="min-h-[90px] resize-y bg-white text-sm leading-relaxed"
                                value={chapter.main_event || ""}
                                onChange={(event) => updateChapter(index, "main_event", event.target.value)}
                                placeholder="Mô tả sự kiện cụ thể diễn ra..."
                              />
                            </div>

                            <Accordion className="w-full rounded-lg border bg-slate-50">
                              <AccordionItem value={`advanced-${chapter.id ?? chapter.temp_id}`} className="border-none">
                                <AccordionTrigger className="px-4 py-3 text-xs font-semibold text-slate-600 hover:no-underline hover:text-indigo-600">
                                  Hiển thị Cấu trúc Mở rộng (Cảm xúc, Hook, Ghi chú...)
                                </AccordionTrigger>
                                <AccordionContent className="px-4 pb-4 pt-2">
                                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div className="space-y-1">
                                      <Label htmlFor={`chapter-emotion-${index}`} className="text-[10px] font-bold uppercase text-indigo-500">Biến chuyển Cảm xúc</Label>
                                      <Textarea id={`chapter-emotion-${index}`} className="min-h-[60px] text-xs" value={chapter.emotional_beat || ""} onChange={(event) => updateChapter(index, "emotional_beat", event.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                      <Label htmlFor={`chapter-relationship-${index}`} className="text-[10px] font-bold uppercase text-pink-500">Biến chuyển Quan hệ</Label>
                                      <Textarea id={`chapter-relationship-${index}`} className="min-h-[60px] text-xs" value={chapter.relationship_beat || ""} onChange={(event) => updateChapter(index, "relationship_beat", event.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                      <Label htmlFor={`chapter-hook-${index}`} className="text-[10px] font-bold uppercase text-amber-500">Điểm neo (Chapter Hook)</Label>
                                      <Textarea id={`chapter-hook-${index}`} className="min-h-[60px] text-xs" value={chapter.chapter_hook || ""} onChange={(event) => updateChapter(index, "chapter_hook", event.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                      <Label htmlFor={`chapter-continuity-${index}`} className="text-[10px] font-bold uppercase text-slate-500">Lưu ý cho chương sau</Label>
                                      <Textarea id={`chapter-continuity-${index}`} className="min-h-[60px] text-xs" value={chapter.continuity_note || ""} onChange={(event) => updateChapter(index, "continuity_note", event.target.value)} />
                                    </div>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            </Accordion>
                          </div>
                        </section>

                        <div className="my-4 flex justify-center gap-2 sm:my-5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="relative z-10 h-8 rounded-full bg-white px-4 text-xs font-semibold text-slate-600 shadow-sm"
                            onClick={() => addChapterAt(index + 1)}
                          >
                            <Plus className="mr-1 h-3 w-3" /> Chèn thủ công
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="relative z-10 h-8 rounded-full border-indigo-200 bg-indigo-50 px-4 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-100"
                            disabled={generatingChapter !== null}
                            onClick={() => openChapterChangeDialog("insert", index + 1)}
                          >
                            {generatingChapter === index + 1
                              ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              : <Sparkles className="mr-1 h-3 w-3" />}
                            AI chèn vào đây
                          </Button>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="flex min-h-[40vh] flex-col items-center justify-center space-y-4 text-slate-400">
                    <Layers className="h-16 w-16 text-slate-200" />
                    <p>Dự án chưa có khung chương nào.</p>
                    <div className="flex flex-wrap justify-center gap-3">
                      <Button variant="outline" onClick={() => addChapterAt(0)}>
                        <Plus className="mr-2 h-4 w-4" /> Tự viết chương đầu tiên
                      </Button>
                      <Button
                        onClick={() => {
                          setChapterGenerationError(null);
                          setIsChapterGenerationOpen(true);
                        }}
                        disabled={creatingChapters}
                        className="bg-indigo-600 hover:bg-indigo-700"
                      >
                        <Wand2 className="mr-2 h-4 w-4" />
                        Nhờ AI chẻ chương
                      </Button>
                    </div>
                  </div>
                )}

              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="outline" className="mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-sm text-indigo-700">2</span>Dàn ý story tổng thể</CardTitle>
            <p className="text-sm text-slate-500">AI tổng hợp Story Bible và tất cả chapter thành một mạch truyện có quan hệ nhân quả. Hãy đọc và chỉnh sửa trước khi chốt.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" onClick={generateOutline} disabled={!canGenerateOutline || generatingOutline}>
              {generatingOutline ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {outline ? "Tạo lại dàn ý từ chapter" : "Sinh dàn ý story"}
            </Button>
            {outline && (
              <>
                {!outlineMatches && (
                  <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                    Story Bible hoặc danh sách chapter đã thay đổi so với dàn ý. Hãy lưu chapter (nếu có thay đổi) rồi tạo lại dàn ý.
                  </p>
                )}
                <Textarea
                  aria-label="Dàn ý story"
                  className="min-h-72 bg-white leading-relaxed"
                  value={outline.content}
                  onChange={(event) => {
                    setOutline((current) => current ? { ...current, content: event.target.value, confirmed: false } : current);
                    setOutlineDirty(true);
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => saveOutline(false)} disabled={!outlineDirty || savingOutline || !outlineMatches}>
                    Lưu bản nháp dàn ý
                  </Button>
                  <Button onClick={() => saveOutline(true)} disabled={!canConfirmOutline || savingOutline}>
                    {savingOutline ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Chốt dàn ý
                  </Button>
                  {outline.confirmed && outlineMatches && !outlineDirty && (
                    <span className="self-center text-sm font-medium text-green-700">Dàn ý đã chốt</span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

          </TabsContent>
          <TabsContent value="beats" className="mt-4">
            <div className="space-y-5 pb-28 pt-2">
            {generation?.status === "running" && (
              <div className="space-y-2 rounded-xl border border-indigo-100 bg-white p-4 shadow-sm" aria-live="polite">
                <div className="flex items-center gap-2 text-sm font-medium text-indigo-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang sinh beats cho chapter {generation.current_chapter ?? "…"}
                </div>
                <progress className="h-2 w-full accent-indigo-600" value={generation.completed} max={generation.total || 1} />
                <p className="text-xs text-slate-500">{generation.completed} / {generation.total} chapter đã xử lý</p>
              </div>
            )}
            {generation?.status === "failed" && (
              <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                Tiến trình dừng sau {generation.completed} / {generation.total} chapter: {generation.error || "Lỗi không xác định."} Các chapter đã sinh được giữ lại; chạy tiếp sẽ bỏ qua chúng.
              </p>
            )}
            {generation?.status === "stale" && (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                Dàn ý hoặc chapter đã thay đổi sau khi sinh beats. Khi chạy lại, hệ thống sẽ yêu cầu xác nhận trước khi thay beats và bản chapter cuối cũ.
              </p>
            )}
              {workflowBeatsError && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {workflowBeatsError}
                </div>
              )}
              {loadingWorkflowBeats ? (
                <div className="flex items-center justify-center gap-3 rounded-xl border bg-white py-12 text-sm text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-600" /> Đang tải beat theo chapter...
                </div>
              ) : selectedBeatChapter && chapters.filter((chapter) => chapter.id === selectedBeatChapter.id).map((chapter) => {
                const chapterBeats = chapter.id ? beatsByChapter[chapter.id] ?? [] : [];
                return (
                  <Card
                    id={chapter.id ? `planner-chapter-${chapter.id}` : undefined}
                    data-planner-toc-id={chapter.id ? `chapter-${chapter.id}` : undefined}
                    key={chapter.id ?? chapter.temp_id}
                    className="scroll-mt-24 overflow-hidden border-slate-200 shadow-sm"
                  >
                    <CardHeader className="space-y-3 border-b bg-gradient-to-r from-slate-50 to-indigo-50/50 p-4 sm:p-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100">CHAPTER {chapter.chapter_number}</Badge>
                          <Badge variant="outline" className="bg-white">{chapterBeats.length} beats</Badge>
                          <Badge
                            className={
                              chapter.status === "Refined & Ready for Audio"
                                ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                                : chapter.status === "Error"
                                  ? "bg-red-100 text-red-800 hover:bg-red-100"
                                  : "bg-slate-100 text-slate-700 hover:bg-slate-100"
                            }
                          >
                            {chapterStatusLabel(chapter.status)}
                          </Badge>
                        </div>
                        <CardTitle className="mt-3 text-lg text-slate-800">{chapter.title || `Chương ${chapter.chapter_number}`}</CardTitle>
                        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-500">{chapter.main_event || "Chưa có sự kiện chính."}</p>
                      </div>
                      <div className="flex items-center justify-between gap-1 border-y border-slate-200/80 py-2 min-[400px]:gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-11 min-w-11 px-2 transition-all duration-200 hover:-translate-x-0.5 hover:bg-indigo-50 hover:text-indigo-700 active:translate-x-0 disabled:cursor-not-allowed sm:px-3"
                          aria-label={`Đến chương trước${previousBeatChapter ? `, chương ${previousBeatChapter.chapter_number}` : ""}`}
                          title="Chương trước"
                          disabled={isBatchDrafting || !previousBeatChapter?.id}
                          onClick={() => {
                            if (previousBeatChapter?.id) setSelectedBeatChapterId(previousBeatChapter.id);
                          }}
                        >
                          <ChevronLeft className="h-5 w-5 sm:mr-1" />
                          <span className="hidden sm:inline">Trước</span>
                        </Button>
                        <span className="min-w-0 truncate text-center text-[clamp(0.7rem,2.4vw,0.875rem)] font-semibold text-slate-600">
                          Chương {selectedBeatChapterIndex + 1} / {chapters.length}
                        </span>
                        {nextBeatChapter ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-11 min-w-11 px-2 transition-all duration-200 hover:translate-x-0.5 hover:bg-indigo-50 hover:text-indigo-700 active:translate-x-0 disabled:cursor-not-allowed sm:px-3"
                            aria-label={`Đến chương sau, chương ${nextBeatChapter.chapter_number}`}
                            title="Chương sau"
                            disabled={isBatchDrafting || !isSelectedBeatChapterRefined || !nextBeatChapter.id}
                            onClick={() => {
                              if (nextBeatChapter.id) setSelectedBeatChapterId(nextBeatChapter.id);
                            }}
                          >
                            <span className="hidden sm:inline">Sau</span>
                            <ChevronRight className="h-5 w-5 sm:ml-1" />
                          </Button>
                        ) : selectedBeatChapterIndex === chapters.length - 1 && isSelectedBeatChapterRefined ? (
                          <Button type="button" size="sm" className="h-11 cursor-pointer px-3 transition-all duration-200 hover:translate-x-0.5 hover:shadow-md disabled:cursor-not-allowed" onClick={onStartWriting} disabled={isBatchDrafting}>
                            Studio <ChevronRight className="ml-1 h-4 w-4" />
                          </Button>
                        ) : (
                          <span aria-hidden="true" className="min-w-11" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        {!isChapterRefined(chapter) && (
                          <Button
                            type="button"
                            size="sm"
                            className={`h-11 min-w-0 flex-[1_1_9rem] text-white ${chapter.status === "Draft Completed" ? "bg-indigo-600 hover:bg-indigo-700" : "bg-violet-600 hover:bg-violet-700"}`}
                            disabled={
                              isBatchDrafting ||
                              chapter.status === "Drafting" ||
                              !chapter.id ||
                              generation?.status === "running" ||
                              refiningChapterId !== null ||
                              draftingWorkflowBeatId !== null ||
                              savingBeats ||
                              !chapterBeats.length
                            }
                            onClick={() => {
                              if (chapter.status === "Draft Completed") {
                                void refineChapterBeats(chapter);
                              } else {
                                void batchDraftWorkflowChapter(chapter, chapterBeats);
                              }
                            }}
                          >
                            {refiningChapterId === chapter.id ||
                            batchDraftingChapterId === chapter.id ||
                            chapter.status === "Drafting"
                              ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                              : chapter.status === "Draft Completed"
                                ? <Sparkles className="mr-1.5 h-4 w-4" />
                                : <Wand2 className="mr-1.5 h-4 w-4" />}
                            {refiningChapterId === chapter.id
                              ? "Đang refine..."
                              : batchDraftingChapterId === chapter.id || chapter.status === "Drafting"
                                ? "Đang viết toàn chapter..."
                                : chapter.status === "Draft Completed"
                                  ? "Refine chapter"
                                  : "AI viết toàn chapter"}
                          </Button>
                        )}
                      </div>
                      {batchDraftingChapterId === chapter.id && (
                        <div role="status" aria-live="polite" className="flex items-center gap-2 border-t border-violet-100 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-800">
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                          AI đang viết toàn bộ chapter. Các thao tác chỉnh sửa đang tạm khóa.
                        </div>
                      )}
                    </CardHeader>
                    {isChapterRefined(chapter) && chapter.final_content && (
                      <CardContent className="p-3 sm:p-5">
                        <section className="overflow-hidden rounded-xl border border-emerald-100 bg-white">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-emerald-50/70 px-4 py-3">
                            <h3 className="text-sm font-semibold text-emerald-900">
                              Nội dung chapter đã refine
                            </h3>
                            <div className="flex items-center gap-2">
                              {dirtyChapterContentIds[chapter.id!] && (
                                <span className="text-xs font-medium text-amber-700">Chưa lưu</span>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void saveRefinedChapterContent(chapter.id!)}
                                disabled={!dirtyChapterContentIds[chapter.id!] || savingRefinedChapterId !== null}
                              >
                                {savingRefinedChapterId === chapter.id
                                  ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                  : <Save className="mr-1.5 h-4 w-4" />}
                                Lưu nội dung
                              </Button>
                            </div>
                          </div>
                          <Textarea
                            aria-label={`Nội dung chương ${chapter.chapter_number} đã refine`}
                            className="max-h-[70vh] min-h-[45vh] resize-y rounded-none border-0 bg-[#fdfbf7] p-4 font-serif text-sm leading-8 text-slate-800 focus-visible:ring-0 sm:p-8 sm:text-base"
                            value={chapter.final_content}
                            onChange={(event) => updateRefinedChapterContent(chapter.id!, event.target.value)}
                            disabled={savingRefinedChapterId === chapter.id}
                          />
                        </section>
                      </CardContent>
                    )}
                    {isChapterRefined(chapter) && !chapter.final_content && (
                      <CardContent>
                        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                          Chapter đã được đánh dấu refine nhưng chưa có nội dung refine để hiển thị.
                        </p>
                      </CardContent>
                    )}
                    {!isChapterRefined(chapter) && (
                    <CardContent className="space-y-4 bg-gradient-to-b from-white to-slate-50/50 p-3 sm:p-5">
                      {chapterBeats.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
                          Chưa có beat trong chapter này.
                        </div>
                      ) : chapterBeats.map((beat, index) => (
                        <div id={`planner-beat-${beat.id}`} data-planner-toc-id={`beat-${beat.id}`} key={beat.id} className="relative scroll-mt-24">
                          <Card className={`overflow-hidden border transition-colors ${dirtyBeatIds[beat.id] ? "border-amber-300 ring-1 ring-amber-100" : "border-slate-200"}`}>
                            <details className="group/beat">
                              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b bg-gradient-to-r from-slate-50 to-white px-4 py-3 transition-colors hover:from-indigo-50/70 hover:to-white [&::-webkit-details-marker]:hidden">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className="rounded-md bg-slate-900 px-2.5 py-1 font-mono text-xs font-bold text-white">{beat.beat_id}</span>
                                  <span className="text-xs text-slate-400">Nhịp {index + 1}</span>
                                  {beat.location && <span className="hidden max-w-48 truncate rounded-full bg-white px-2.5 py-1 text-xs text-slate-500 ring-1 ring-slate-200 sm:inline-flex">{beat.location}</span>}
                                  {dirtyBeatIds[beat.id] && <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Chưa lưu</Badge>}
                                  {!beat.ai_draft_text?.trim() && <Badge variant="outline" className="text-slate-400">Chưa viết nháp</Badge>}
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5 text-slate-400">
                                  <span className="hidden text-xs sm:inline">{(beat.ai_draft_text ?? "").length.toLocaleString()} ký tự</span>
                                  <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open/beat:rotate-180" />
                                </div>
                              </summary>
                              <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-open/beat:grid-rows-[1fr]">
                                <div className="min-h-0 overflow-hidden">
                                  <div className="space-y-4 p-4">
                                    <div className="grid gap-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 md:grid-cols-3">
                                      <div className="space-y-1.5">
                                        <Label className="flex items-center gap-1.5 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" /> Địa điểm & không khí</Label>
                                        <Input value={beat.location ?? ""} onChange={(event) => updateWorkflowBeat(chapter.id!, beat.id, "location", event.target.value)} disabled={savingBeats || isBatchDrafting} />
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label className="flex items-center gap-1.5 text-xs text-slate-500"><Users className="h-3.5 w-3.5" /> Nhân vật hiện diện</Label>
                                        <Input value={beat.characters_present ?? ""} onChange={(event) => updateWorkflowBeat(chapter.id!, beat.id, "characters_present", event.target.value)} disabled={savingBeats || isBatchDrafting} />
                                      </div>
                                      <div className="space-y-1.5">
                                        <Label className="text-xs text-slate-500">Mục tiêu / chuyển biến cảm xúc</Label>
                                        <Textarea className="min-h-20" value={beat.emotional_shift ?? ""} onChange={(event) => updateWorkflowBeat(chapter.id!, beat.id, "emotional_shift", event.target.value)} disabled={savingBeats || isBatchDrafting} />
                                      </div>
                                    </div>
                                  <div className="space-y-4">
                                    <div className="space-y-1.5">
                                      <Label className="text-xs text-slate-500">Hành động, đạo cụ và thoại</Label>
                                      <Textarea className="min-h-32" value={beat.action_and_dialogue ?? ""} onChange={(event) => updateWorkflowBeat(chapter.id!, beat.id, "action_and_dialogue", event.target.value)} disabled={savingBeats || isBatchDrafting} />
                                    </div>
                                    <details className="group/beat-content w-full overflow-hidden rounded-xl border border-indigo-100 bg-white">
                                      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-indigo-50/60 px-3 py-2.5 text-xs font-semibold text-indigo-800 transition-colors hover:bg-indigo-50 [&::-webkit-details-marker]:hidden">
                                        <span>Nội dung beat</span>
                                        <span className="flex items-center gap-2 font-normal text-slate-500">
                                          {(beat.ai_draft_text ?? "").length.toLocaleString()} ký tự
                                          <ChevronDown className="h-4 w-4 transition-transform duration-200 group-open/beat-content:rotate-180" />
                                        </span>
                                      </summary>
                                      <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-open/beat-content:grid-rows-[1fr]">
                                        <div className="min-h-0 overflow-hidden p-3">
                                          <Textarea
                                            className="min-h-96 w-full resize-y bg-[#fdfbf7] font-serif leading-relaxed"
                                            placeholder="Nội dung viết cho beat sẽ hiển thị tại đây..."
                                            value={beat.ai_draft_text ?? ""}
                                            onChange={(event) => updateWorkflowBeat(chapter.id!, beat.id, "ai_draft_text", event.target.value)}
                                            disabled={savingBeats || isBatchDrafting}
                                          />
                                        </div>
                                      </div>
                                    </details>
                                  </div>
                                </div>
                              </div>
                              </div>
                            </details>
                            {!isChapterRefined(chapter) && (
                            <div className="flex flex-wrap items-center justify-between gap-1 border-t bg-white px-4 py-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                title={`Chèn beat trước ${beat.beat_id}`}
                                aria-label={`Chèn beat trước ${beat.beat_id}`}
                                className="h-8 text-xs text-indigo-700 hover:bg-indigo-50"
                                disabled={isBatchDrafting || generation?.status === "running" || savingBeats}
                                onClick={() => void insertWorkflowBeat(chapter, index)}
                              >
                                <Plus className="mr-1 h-3.5 w-3.5" /> Chèn beat trước
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs text-violet-700 hover:bg-violet-50"
                                disabled={isBatchDrafting || generation?.status === "running" || draftingWorkflowBeatId !== null || savingBeats}
                                onClick={() => void draftWorkflowBeat(chapter, beat, index)}
                              >
                                {draftingWorkflowBeatId === beat.id
                                  ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                                  : <Wand2 className="mr-1 h-3.5 w-3.5" />}
                                {draftingWorkflowBeatId === beat.id ? "Đang viết..." : "AI viết beat"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 gap-1.5 text-xs"
                                disabled={isBatchDrafting || generation?.status === "running" || savingBeats || draftingWorkflowBeatId !== null}
                                onClick={() => void copyWorkflowBeatPrompt(chapter, beat, index)}
                              >
                                {copiedWorkflowBeatPromptId === beat.id
                                  ? <Check className="h-3.5 w-3.5" />
                                  : <Copy className="h-3.5 w-3.5" />}
                                {copiedWorkflowBeatPromptId === beat.id ? "Đã copy prompt" : "Copy prompt tạo draft"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label={`Xóa ${beat.beat_id}`}
                                title="Xóa beat"
                                className="h-8 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
                                disabled={isBatchDrafting || generation?.status === "running" || savingBeats}
                                onClick={() => void deleteWorkflowBeat(beat)}
                              >
                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Xóa
                              </Button>
                            </div>
                            )}
                          </Card>
                        </div>
                      ))}
                    </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      {activeTab === "beats" && chapters.length > 0 && (
        <>
          <aside className="fixed right-4 top-1/2 z-30 hidden w-56 -translate-y-1/2 2xl:block">
            <nav aria-label="Mục lục story beats" className="max-h-[72vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
              <div className="mb-2 flex items-center gap-2 px-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                <List className="h-4 w-4 text-indigo-600" />
                {`Chương ${selectedBeatChapter?.chapter_number}`}
              </div>
              <div className="space-y-1">
                {chapters
                  .filter((chapter) => chapter.id && accessibleBeatChapterIds.has(chapter.id))
                  .map((chapter) => {
                    const chapterId = chapter.id ?? "";
                    const chapterBeats = beatsByChapter[chapterId] ?? [];
                    return (
                      <div key={`toc-${chapterId}`} className="space-y-0.5">
                        <button
                          type="button"
                          disabled={isBatchDrafting}
                          onClick={() => scrollToPlannerChapter(chapterId)}
                          className={`w-full truncate rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                            activePlannerTocId === `chapter-${chapterId}`
                              ? "bg-indigo-100 text-indigo-800"
                              : "text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          Ch. {chapter.chapter_number} · {chapter.title || `Chương ${chapter.chapter_number}`}
                          <span className="ml-1 text-[10px] font-normal text-slate-400">({chapterBeats.length})</span>
                        </button>
                        {chapterBeats.map((beat) => (
                          <button
                            type="button"
                            disabled={isBatchDrafting}
                            key={`toc-beat-${beat.id}`}
                            onClick={() => navigateToPlannerBeat(chapterId, beat.id)}
                            className={`ml-2 block w-[calc(100%-0.5rem)] truncate rounded-md border-l-2 py-1.5 pl-3 text-left text-[11px] transition-colors ${
                              activePlannerTocId === `beat-${beat.id}`
                                ? "border-indigo-600 bg-indigo-50 font-semibold text-indigo-700"
                                : "border-slate-200 text-slate-500 hover:border-indigo-300 hover:bg-slate-50 hover:text-slate-800"
                            }`}
                          >
                            {beat.beat_id} · {beat.location || "Chưa có địa điểm"}
                          </button>
                        ))}
                      </div>
                    );
                  })}
              </div>
            </nav>
          </aside>
          <div className="fixed right-4 top-1/2 z-30 -translate-y-1/2 2xl:hidden">
            {isPlannerTocOpen && (
              <nav aria-label="Mục lục story beats" className="absolute right-12 top-1/2 max-h-[65vh] w-[min(20rem,calc(100vw-5rem))] -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur animate-in slide-in-from-right-2">
                <div className="mb-2 flex items-center gap-2 px-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                  <List className="h-4 w-4 text-indigo-600" />
                  {`Chương ${selectedBeatChapter?.chapter_number}`}
                </div>
                <div className="space-y-1">
                  {chapters
                    .filter((chapter) => chapter.id && accessibleBeatChapterIds.has(chapter.id))
                    .map((chapter) => {
                      const chapterId = chapter.id ?? "";
                      const chapterBeats = beatsByChapter[chapterId] ?? [];
                      return (
                        <div key={`mobile-toc-${chapterId}`} className="space-y-0.5">
                          <button
                            type="button"
                            disabled={isBatchDrafting}
                            onClick={() => {
                              scrollToPlannerChapter(chapterId);
                              setIsPlannerTocOpen(false);
                            }}
                            className="w-full truncate rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Ch. {chapter.chapter_number} · {chapter.title || `Chương ${chapter.chapter_number}`}
                            <span className="ml-1 text-[10px] font-normal text-slate-400">({chapterBeats.length})</span>
                          </button>
                          {chapterBeats.map((beat) => (
                            <button
                              type="button"
                              disabled={isBatchDrafting}
                              key={`mobile-toc-beat-${beat.id}`}
                              onClick={() => navigateToPlannerBeat(chapterId, beat.id)}
                              className="ml-2 block w-[calc(100%-0.5rem)] truncate rounded-md border-l-2 border-slate-200 py-1.5 pl-3 text-left text-[11px] text-slate-500 hover:border-indigo-300 hover:bg-slate-50 hover:text-indigo-700"
                            >
                              {beat.beat_id} · {beat.location || "Chưa có địa điểm"}
                            </button>
                          ))}
                        </div>
                      );
                    })}
                </div>
              </nav>
            )}
            <Button
              type="button"
              size="sm"
              disabled={isBatchDrafting}
              onClick={() => setIsPlannerTocOpen((current) => !current)}
              className="h-12 w-12 rounded-full bg-white p-0 text-slate-700 shadow-xl ring-1 ring-slate-200 hover:bg-indigo-50"
              aria-label={isPlannerTocOpen ? "Ẩn mục lục" : "Mở mục lục"}
              title={isPlannerTocOpen ? "Ẩn mục lục" : "Mở mục lục"}
            >
              <List className="h-5 w-5 text-indigo-600" />
            </Button>
          </div>
        </>
      )}
      {activeTab === "chapters" && (
        <div className="fixed bottom-24 right-4 z-40 sm:right-8">
          <div className="group/chapter-score">
          <Button
            type="button"
            aria-label="AI chấm điểm"
            title="AI chấm điểm"
            disabled={!canEvaluatePacing}
            onClick={evaluatePacing}
            className="h-14 w-14 cursor-pointer overflow-hidden rounded-full border-0 bg-amber-500 p-0 text-white shadow-lg transition-[width,background-color,box-shadow] duration-300 ease-out hover:w-44 hover:bg-amber-600 hover:shadow-xl focus-visible:w-44 focus-visible:ring-amber-300 disabled:cursor-not-allowed"
          >
            {isEvaluating ? (
              <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
            ) : (
              <Activity className="h-5 w-5 shrink-0" />
            )}
            <span className="max-w-0 overflow-hidden text-sm font-semibold opacity-0 transition-[max-width,opacity,transform] duration-300 group-hover/chapter-score:ml-2 group-hover/chapter-score:max-w-28 group-hover/chapter-score:translate-x-0 group-hover/chapter-score:opacity-100 group-focus-visible/chapter-score:ml-2 group-focus-visible/chapter-score:max-w-28 group-focus-visible/chapter-score:translate-x-0 group-focus-visible/chapter-score:opacity-100">
              AI chấm điểm
            </span>
          </Button>
          </div>
        </div>
      )}
      {activeTab === "chapters" && chaptersDirty && (
        <div className="fixed bottom-6 left-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 animate-in slide-in-from-bottom-5 sm:w-auto">
          <div className="flex flex-wrap items-center justify-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-2xl sm:gap-4 sm:rounded-full sm:px-6">
            <span className="text-center text-sm font-medium">
              Có thay đổi chưa lưu.
            </span>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => addChapterAt(chapters.length)}
                disabled={savingChapters}
              >
                <Plus className="mr-1 h-4 w-4" />
                Thêm cuối danh sách
              </Button>
              <Button
                size="sm"
                className="bg-indigo-600 text-white hover:bg-indigo-700"
                onClick={saveChapters}
                disabled={savingChapters}
              >
                {savingChapters
                  ? <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  : <Save className="mr-1 h-4 w-4" />}
                Lưu danh sách chapter
              </Button>
            </div>
          </div>
        </div>
      )}
      {activeTab === "beats" && (
        <>
          <div className="fixed inset-x-2 bottom-2 z-40 grid grid-cols-2 items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur md:inset-x-auto md:bottom-6 md:right-8 md:flex md:gap-3 md:rounded-full md:p-3 md:pb-3">
            {dirtyBeatCount > 0 && (
              <div className="col-span-2 flex min-w-0 items-center gap-2 md:col-auto md:flex-initial">
                <span className="hidden text-sm font-medium text-slate-700 md:inline">
                  {dirtyBeatCount} thay đổi beats chưa lưu
                </span>
                <Button
                  size="sm"
                  className="h-11 min-w-0 flex-1 bg-indigo-600 text-white hover:bg-indigo-700 md:flex-initial"
                  onClick={() => void saveWorkflowBeats()}
                  disabled={savingBeats || isBatchDrafting}
                >
                  {savingBeats ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                  <span className="truncate md:hidden">Lưu ({dirtyBeatCount})</span>
                  <span className="hidden md:inline">Lưu thay đổi</span>
                </Button>
              </div>
            )}
            {shouldShowBeatGeneration && (
              <Button
                type="button"
                aria-label={generation?.status === "failed" ? "Tiếp tục sinh beats" : "Sinh beats cho tất cả chapter"}
                title={generation?.status === "failed" ? "Tiếp tục sinh beats" : "Sinh beats cho tất cả chapter"}
                disabled={isBatchDrafting || !outline?.confirmed || !outlineMatches || chaptersDirty || outlineDirty || startingBeats || generation?.status === "running"}
                onClick={startBeatGeneration}
                className="h-11 w-full shrink-0 gap-1.5 rounded-full border-0 bg-indigo-600 px-3 text-white shadow transition-colors hover:bg-indigo-700 focus-visible:ring-indigo-300 disabled:cursor-not-allowed md:w-auto md:px-4"
              >
                {startingBeats || generation?.status === "running"
                  ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                  : <Wand2 className="h-4 w-4 shrink-0" />}
                <span className="text-xs font-semibold md:text-sm">
                  {generation?.status === "failed" ? "Tiếp tục" : "Sinh beats"}
                </span>
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              aria-label="AI chấm điểm chapter"
              title="AI chấm điểm chapter"
              disabled={
                isBatchDrafting ||
                evaluatingBeats ||
                loadingWorkflowBeats ||
                !selectedBeatChapter?.id ||
                !beatsByChapter[selectedBeatChapter.id]?.length
              }
              onClick={() => void (selectedBeatChapter && evaluateBeats("chapter", selectedBeatChapter))}
              className={`h-11 w-full shrink-0 gap-1.5 rounded-full bg-amber-500 px-3 text-white hover:bg-amber-600 md:w-auto md:px-4 ${shouldShowBeatGeneration ? "" : "col-span-2"}`}
            >
              {evaluatingBeats ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              ) : (
                <Activity className="h-4 w-4 shrink-0" />
              )}
              <span className="text-xs font-semibold md:text-sm">Chấm điểm</span>
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={isChapterGenerationOpen}
        onOpenChange={(open) => {
          if (!creatingChapters) setIsChapterGenerationOpen(open);
        }}
      >
        <DialogContent
          showCloseButton={!creatingChapters}
          className="sm:max-w-[520px]"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-indigo-600" />
              Nhờ AI sinh danh sách chapter
            </DialogTitle>
            <DialogDescription>
              AI sẽ phân bổ mạch truyện thành danh sách chapter cho dự án. Chỉ bắt đầu khi bạn xác nhận.
            </DialogDescription>
          </DialogHeader>
          {chapterGenerationError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {chapterGenerationError}
            </div>
          )}
          {creatingChapters && (
            <div className="flex flex-col items-center justify-center py-8 text-indigo-600" aria-live="polite">
              <Loader2 className="mb-3 h-9 w-9 animate-spin" />
              <p className="animate-pulse font-medium">AI đang phân bổ cấu trúc truyện...</p>
            </div>
          )}
          <DialogFooter>
            {!creatingChapters && (
              <>
                <Button variant="outline" onClick={() => setIsChapterGenerationOpen(false)}>
                  Hủy
                </Button>
                <Button onClick={generateChapters}>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Xác nhận sinh chapter
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={chapterChangeTarget !== null}
        onOpenChange={(open) => {
          if (!open && generatingChapter === null && !analyzingChapterIdea) setChapterChangeTarget(null);
        }}
      >
        <DialogContent
          showCloseButton={generatingChapter === null && !analyzingChapterIdea}
          className="sm:max-w-[560px]"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              {chapterChangeTarget?.action === "edit"
                ? `AI sửa Chương ${chapterChangeTarget.index + 1}`
                : `AI chèn chapter tại vị trí ${chapterChangeTarget ? chapterChangeTarget.index + 1 : ""}`}
            </DialogTitle>
            <DialogDescription>
              {chapterChangeTarget?.action === "insert"
                ? "AI sẽ phân tích ý tưởng và đưa ra nhận xét trước. Chapter chỉ được tạo sau khi bạn xem kết quả và xác nhận."
                : "Nhập yêu cầu cụ thể cho AI Script Doctor. Nội dung chapter chỉ được cập nhật sau khi AI trả kết quả thành công."}
            </DialogDescription>
          </DialogHeader>
          {chapterChangeTarget?.action === "insert" ? (
            chapterIdeaAnalysis ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="outline" className="border-amber-300 bg-white text-amber-700">
                      Điểm khả thi: {chapterIdeaAnalysis.feasibility_score}/10
                    </Badge>
                    <span className="text-sm font-bold text-amber-800">Nhận xét từ AI</span>
                  </div>
                  <p className="text-sm leading-relaxed text-slate-700">{chapterIdeaAnalysis.critique}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-800">Chọn phương án để tạo chapter:</p>
                  {chapterIdeaAnalysis.suggested_prompt && (
                    <button
                      type="button"
                      aria-pressed={chapterPrompt === chapterIdeaAnalysis.suggested_prompt}
                      disabled={generatingChapter !== null}
                      onClick={() => setChapterPrompt(chapterIdeaAnalysis.suggested_prompt)}
                      className={`w-full rounded-lg border p-3 text-left disabled:opacity-50 ${
                        chapterPrompt === chapterIdeaAnalysis.suggested_prompt
                          ? "border-indigo-400 bg-indigo-50"
                          : "border-indigo-200 bg-indigo-50/30 hover:bg-indigo-50"
                      }`}
                    >
                      <span className="mb-1 block text-xs font-bold uppercase text-indigo-700">Đề xuất của AI</span>
                      <span className="block whitespace-pre-wrap text-sm text-slate-700">{chapterIdeaAnalysis.suggested_prompt}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    aria-pressed={chapterPrompt === chapterIdeaText}
                    disabled={generatingChapter !== null}
                    onClick={() => setChapterPrompt(chapterIdeaText)}
                    className={`w-full rounded-lg border p-3 text-left disabled:opacity-50 ${
                      chapterPrompt === chapterIdeaText
                        ? "border-slate-400 bg-slate-100"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span className="mb-1 block text-xs font-bold uppercase text-slate-600">Ý tưởng ban đầu của bạn</span>
                    <span className="block whitespace-pre-wrap text-sm text-slate-700">{chapterIdeaText}</span>
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={generatingChapter !== null}
                  onClick={() => {
                    setChapterIdeaAnalysis(null);
                    setChapterPrompt("");
                    setChapterChangeError(null);
                  }}
                >
                  Sửa ý tưởng
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="chapter-idea-prompt">Ý tưởng chapter</Label>
                <Textarea
                  id="chapter-idea-prompt"
                  autoFocus
                  value={chapterIdeaText}
                  onChange={(event) => setChapterIdeaText(event.target.value)}
                  disabled={analyzingChapterIdea}
                  placeholder="Mô tả ý tưởng chapter bạn muốn thêm..."
                  className="min-h-28"
                />
                {!chapterIdeaText.trim() && (
                  <p className="text-xs text-slate-500">Nhập ý tưởng để AI phân tích trước khi tạo chapter.</p>
                )}
              </div>
            )
          ) : (
            <div className="space-y-2">
              <Label htmlFor="chapter-ai-prompt">Yêu cầu cho AI</Label>
              <Textarea
                id="chapter-ai-prompt"
                autoFocus
                value={chapterPrompt}
                onChange={(event) => setChapterPrompt(event.target.value)}
                disabled={generatingChapter !== null}
                placeholder="Ví dụ: làm rõ hiểu lầm giữa hai nhân vật trước bước ngoặt..."
                className="min-h-28"
              />
              {!chapterPrompt.trim() && (
                <p className="text-xs text-slate-500">Nhập yêu cầu trước khi bắt đầu.</p>
              )}
            </div>
          )}
          {chapterChangeError && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {chapterChangeError}
            </div>
          )}
          {analyzingChapterIdea && (
            <div className="flex items-center gap-2 text-sm font-medium text-indigo-700" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" />
              AI đang phân tích ý tưởng chapter...
            </div>
          )}
          {generatingChapter !== null && (
            <div className="flex items-center gap-2 text-sm font-medium text-indigo-700" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" />
              AI đang tạo chapter...
            </div>
          )}
          <DialogFooter>
            {generatingChapter === null && !analyzingChapterIdea && (
              <>
                <Button variant="outline" onClick={() => setChapterChangeTarget(null)}>
                  Hủy
                </Button>
                {chapterChangeTarget?.action === "insert" && !chapterIdeaAnalysis ? (
                  <Button
                    onClick={() => void analyzeChapterIdea()}
                    disabled={!chapterIdeaText.trim()}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Activity className="mr-2 h-4 w-4" />
                    Phân tích ý tưởng
                  </Button>
                ) : (
                  <Button
                    onClick={() => void generateChapterChange()}
                    disabled={!chapterPrompt.trim() || chapterChangeTarget === null}
                    className={chapterChangeTarget?.action === "insert" ? "bg-indigo-600 hover:bg-indigo-700" : undefined}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {chapterChangeTarget?.action === "insert" ? "Xác nhận & chèn chapter" : "Xác nhận sửa"}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEvaluationOpen} onOpenChange={setIsEvaluationOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-amber-600" />
              Báo cáo đánh giá cấu trúc (Pacing)
            </DialogTitle>
          </DialogHeader>

          {isEvaluating ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Loader2 className="mb-4 h-10 w-10 animate-spin text-amber-500" />
              <p className="animate-pulse">AI Script Doctor đang phân tích toàn bộ mạch truyện...</p>
            </div>
          ) : evaluationError ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {evaluationError}
            </div>
          ) : evaluation ? (
            <div className="space-y-6 py-2">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-900">{evaluation.summary}</p>
                <p className="shrink-0 text-3xl font-black text-amber-600">{evaluation.overall_score}/10</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <section className="space-y-2">
                  <h3 className="text-sm font-bold text-green-700">Điểm sáng</h3>
                  {evaluation.strengths?.length ? (
                    <ul className="list-disc space-y-1 pl-4 text-sm text-slate-600">
                      {evaluation.strengths.map((strength, index) => <li key={index}>{strength}</li>)}
                    </ul>
                  ) : <p className="text-sm text-slate-500">Chưa có nhận xét.</p>}
                </section>
                <section className="space-y-2">
                  <h3 className="text-sm font-bold text-red-600">Điểm yếu / Lỗ hổng</h3>
                  {evaluation.weaknesses?.length ? (
                    <ul className="list-disc space-y-1 pl-4 text-sm text-slate-600">
                      {evaluation.weaknesses.map((weakness, index) => <li key={index}>{weakness}</li>)}
                    </ul>
                  ) : <p className="text-sm text-slate-500">Không phát hiện điểm yếu cụ thể.</p>}
                </section>
              </div>

              {evaluation.suggestions?.length > 0 && (
                <section className="space-y-3">
                  <h3 className="border-b pb-2 text-sm font-bold text-slate-800">Đề xuất sửa chữa</h3>
                  {evaluation.suggestions.map((suggestion, index) => (
                    <article key={`${suggestion.chapter_number}-${index}`} className="space-y-1 rounded-lg border bg-slate-50 p-3 text-sm">
                      <p className="font-bold text-indigo-700">Chương {suggestion.chapter_number}</p>
                      <p className="text-red-700"><span className="font-semibold">Vấn đề:</span> {suggestion.issue}</p>
                      <p className="text-green-800"><span className="font-semibold">Cách sửa:</span> {suggestion.fix}</p>
                    </article>
                  ))}
                </section>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={beatEvaluationOpen} onOpenChange={setBeatEvaluationOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-amber-600" />
              {beatEvaluationScope === "story"
                ? "AI chấm điểm nhịp beat toàn story"
                : `AI chấm điểm beat · Chương ${beatEvaluationChapter?.chapter_number}`}
            </DialogTitle>
          </DialogHeader>
          {evaluatingBeats ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500" aria-live="polite">
              <Loader2 className="mb-4 h-10 w-10 animate-spin text-amber-500" />
              <p className="animate-pulse">AI đang đối chiếu beats với mạch truyện...</p>
            </div>
          ) : beatEvaluationError ? (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {beatEvaluationError}
            </div>
          ) : beatEvaluation ? (
            <div className="space-y-6 py-2">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4">
                <div>
                  <Badge className="mb-2 bg-amber-100 text-amber-800 hover:bg-amber-100">
                    {beatEvaluationScope === "story" ? "TOÀN STORY" : `CHAPTER ${beatEvaluationChapter?.chapter_number}`}
                  </Badge>
                  <p className="text-sm font-medium leading-relaxed text-amber-950">{beatEvaluation.summary}</p>
                </div>
                <div className="shrink-0 rounded-xl bg-white px-4 py-2 text-center shadow-sm">
                  <p className="text-3xl font-black text-amber-600">{beatEvaluation.overall_score}<span className="text-base">/10</span></p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Điểm nhịp</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <section className="rounded-lg border border-green-100 bg-green-50/50 p-4">
                  <h3 className="mb-2 text-sm font-bold text-green-700">Điểm mạnh</h3>
                  {beatEvaluation.strengths.length ? (
                    <ul className="list-disc space-y-1.5 pl-4 text-sm text-slate-700">
                      {beatEvaluation.strengths.map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                  ) : <p className="text-sm text-slate-500">Chưa có nhận xét.</p>}
                </section>
                <section className="rounded-lg border border-rose-100 bg-rose-50/50 p-4">
                  <h3 className="mb-2 text-sm font-bold text-rose-700">Điểm cần cải thiện</h3>
                  {beatEvaluation.weaknesses.length ? (
                    <ul className="list-disc space-y-1.5 pl-4 text-sm text-slate-700">
                      {beatEvaluation.weaknesses.map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                  ) : <p className="text-sm text-slate-500">Không phát hiện vấn đề cụ thể.</p>}
                </section>
              </div>
              {beatEvaluation.suggestions.length > 0 && (
                <section className="space-y-3">
                  <h3 className="border-b pb-2 text-sm font-bold text-slate-800">Đề xuất chỉnh sửa</h3>
                  {beatEvaluation.suggestions.map((item, index) => (
                    <article key={`${item.beat_id ?? item.chapter_number}-${index}`} className="rounded-lg border bg-slate-50 p-3 text-sm">
                      <p className="mb-1 font-bold text-indigo-700">
                        {item.beat_id ? `${item.beat_id} · ` : ""}
                        {item.chapter_number ? `Chương ${item.chapter_number}` : "Mạch beats"}
                      </p>
                      <p className="text-rose-700"><span className="font-semibold">Vấn đề:</span> {item.issue}</p>
                      <p className="mt-1 text-green-800"><span className="font-semibold">Đề xuất:</span> {item.fix}</p>
                    </article>
                  ))}
                </section>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

    </main>
  );
}

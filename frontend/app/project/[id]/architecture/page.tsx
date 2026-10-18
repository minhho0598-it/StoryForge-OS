"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Layers, Save, X, Wand2, Map, Sparkles, Activity, ChevronDown, TriangleAlert, Pencil, Check } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import { createTemporaryId } from "@/lib/utils";
import StoryBibleVisual from "@/components/story-bible-visual";


/* ------------------------------------------------------------------ */
/* Helpers: immutable deep-set + small reusable field components       */
/* ------------------------------------------------------------------ */

// Immutably set a value at an arbitrary path (supports object keys and array indices)
function setDeep(obj: unknown, path: BibleFieldPath, value: unknown): unknown {
  if (path.length === 0) return value;
  const [key, ...rest] = path;
  const clone: Record<string, unknown> | unknown[] = Array.isArray(obj)
    ? [...obj]
    : { ...(obj && typeof obj === "object" ? obj : {}) };
  const current = Array.isArray(clone)
    ? typeof key === "number" ? clone[key] : undefined
    : typeof key === "string" ? clone[key] : undefined;
  const nextDefault = typeof rest[0] === "number" ? [] : {};
  const next = setDeep(current ?? nextDefault, rest, value);
  if (Array.isArray(clone) && typeof key === "number") {
    clone[key] = next;
  } else if (!Array.isArray(clone) && typeof key === "string") {
    clone[key] = next;
  }
  return clone;
}

function getDeep(obj: unknown, path: BibleFieldPath): unknown {
  let value = obj;
  for (const key of path) {
    if (Array.isArray(value) && typeof key === "number") {
      value = value[key];
    } else if (value && typeof value === "object" && typeof key === "string") {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return value;
}

type BibleFieldPath = (string | number)[];
type BibleFieldType = "string" | "number" | "boolean" | "string_array";
type BibleFieldEditRequest = {
  path: BibleFieldPath;
  label: string;
  value: unknown;
  fieldType: BibleFieldType;
  editorType: "text" | "textarea" | "array";
};
type EditableBibleField = {
  path: BibleFieldPath;
  label: string;
  field_type: BibleFieldType;
};
type BibleFieldEditContextValue = {
  openFieldEditor: (field: BibleFieldEditRequest) => void;
};

const BibleFieldEditContext = createContext<BibleFieldEditContextValue | null>(null);

const EDITABLE_BIBLE_FIELD_LABELS: Record<string, string> = {
  title: "Tiêu đề",
  core_premise: "Tiền đề",
  central_theme: "Chủ đề trung tâm",
  vibe: "Vibe / Tông truyện",
  story_engine: "Động cơ truyện",
  sub_themes: "Chủ đề phụ",
  emotional_promise: "Cảm xúc hứa hẹn",
  timeline_structure: "Cấu trúc thời gian",
  thematic_question: "Câu hỏi chủ đề",
  name: "Tên nhân vật",
  age: "Tuổi",
  role_in_story: "Vai trò trong truyện",
  motivation: "Động lực",
  relationship_to_protagonist: "Quan hệ với nhân vật chính",
  timeline_evolution: "Diễn tiến nhân vật",
  appearance: "Ngoại hình",
  habits: "Thói quen",
  living_situation: "Hoàn cảnh sống",
  career_and_financial_status: "Sự nghiệp và tài chính",
  fear: "Nỗi sợ",
  emotional_need: "Nhu cầu cảm xúc",
  external_pressure: "Áp lực bên ngoài",
  internal_conflict: "Xung đột nội tâm",
  secrets_or_insecurities: "Bí mật / Tự ti",
  strength: "Điểm mạnh",
  flaw: "Khuyết điểm",
  core_traits: "Đặc điểm cốt lõi",
  starting_belief: "Niềm tin ban đầu",
  false_belief: "Niềm tin sai lệch",
  truth_they_learn: "Sự thật nhận ra",
  ending_state: "Trạng thái kết thúc",
  setting: "Bối cảnh",
  primary_setting: "Bối cảnh chính",
  past_setting: "Bối cảnh quá khứ",
  location: "Địa điểm",
  daily_life: "Đời sống thường nhật",
  social_circles: "Các mối quan hệ xã hội",
  cultural_context: "Bối cảnh văn hoá",
  socio_economic_pressures: "Áp lực kinh tế - xã hội",
  central_conflict: "Xung đột trung tâm",
  micro_conflict_origin: "Nguồn gốc vi-xung đột",
  escalation_logic: "Logic leo thang",
  external_conflicts: "Xung đột bên ngoài",
  internal_conflicts: "Xung đột nội tâm",
  tone: "Tông giọng",
  pacing: "Nhịp độ",
  dialogue_style: "Phong cách hội thoại",
  suggested_type: "Ngôi kể đề xuất",
  reasoning: "Lý do đề xuất",
  system_instruction_string: "Chỉ dẫn ngôi kể",
  realism_rules: "Quy tắc hiện thực",
  romance_rules: "Quy tắc lãng mạn",
  show_dont_tell_rules: "Quy tắc show, don't tell",
  original_seed_title: "Tựa đề gốc",
  original_vibe: "Vibe gốc",
  keywords_integrated: "Từ khoá đã tích hợp",
  core_elements_that_must_not_change: "Yếu tố cốt lõi không được thay đổi",
  narrative_boundaries: "Ranh giới trần thuật",
  applicable: "Có áp dụng hướng dẫn thân mật",
  note: "Ghi chú",
  comfort_level: "Mức độ thoải mái",
  depiction_style: "Phong cách miêu tả",
  natural_intimacy_beats: "Nhịp thân mật tự nhiên",
  consent_and_pacing_rules: "Quy tắc đồng thuận và nhịp độ",
  between: "Nhân vật trong quan hệ",
  current_relationship: "Mối quan hệ hiện tại",
  past_relationship: "Mối quan hệ quá khứ",
  relationship_arc: "Hành trình mối quan hệ",
  bonding_mechanism: "Cơ chế gắn kết",
  source_of_tension: "Nguồn căng thẳng",
  unspoken_issue: "Vấn đề chưa nói ra",
  what_a_needs_from_b: "A cần gì từ B",
  what_b_needs_from_a: "B cần gì từ A",
  physical_intimacy_arc: "Hành trình thân mật thể xác",
  starting_emotional_state: "Trạng thái cảm xúc ban đầu",
  midpoint_shift: "Bước ngoặt giữa truyện",
  major_emotional_turn: "Bước ngoặt cảm xúc lớn",
  resolution_emotion: "Cảm xúc khi kết thúc",
};

const STRING_ARRAY_BIBLE_FIELDS = new Set([
  "sub_themes",
  "habits",
  "core_traits",
  "socio_economic_pressures",
  "external_conflicts",
  "internal_conflicts",
  "realism_rules",
  "romance_rules",
  "show_dont_tell_rules",
  "keywords_integrated",
  "core_elements_that_must_not_change",
  "narrative_boundaries",
  "natural_intimacy_beats",
  "consent_and_pacing_rules",
]);

const BOOLEAN_BIBLE_FIELDS = new Set(["applicable"]);

function getBibleFieldType(value: unknown, key?: string): BibleFieldType {
  if (Array.isArray(value) || STRING_ARRAY_BIBLE_FIELDS.has(key ?? "")) return "string_array";
  if (typeof value === "boolean" || BOOLEAN_BIBLE_FIELDS.has(key ?? "")) return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}

function getEditableBibleFields(storyBible: unknown): EditableBibleField[] {
  const fields: EditableBibleField[] = [];
  const visit = (value: unknown, path: BibleFieldPath) => {
    if (Array.isArray(value)) {
      const key = path[path.length - 1];
      if (typeof key === "string" && STRING_ARRAY_BIBLE_FIELDS.has(key)) {
        fields.push({
          path,
          label: getContextualBibleFieldLabel(storyBible, path, EDITABLE_BIBLE_FIELD_LABELS[key]),
          field_type: "string_array",
        });
        return;
      }
      value.forEach((item, index) => visit(item, [...path, index]));
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
        if (child && typeof child === "object") {
          visit(child, [...path, key]);
          return;
        }
        if (EDITABLE_BIBLE_FIELD_LABELS[key]) {
          fields.push({
            path: [...path, key],
            label: getContextualBibleFieldLabel(
              storyBible,
              [...path, key],
              EDITABLE_BIBLE_FIELD_LABELS[key],
            ),
            field_type: getBibleFieldType(child, key),
          });
        }
      });
      return;
    }
    const key = path[path.length - 1];
    const parentKey = path[path.length - 2];
    if (typeof parentKey === "string" && EDITABLE_BIBLE_FIELD_LABELS[parentKey]) {
      const label = parentKey === "between"
        ? `Nhân vật ${key === 0 ? "A" : "B"}`
        : EDITABLE_BIBLE_FIELD_LABELS[parentKey];
      fields.push({
        path,
        label: getContextualBibleFieldLabel(storyBible, path, label),
        field_type: getBibleFieldType(value, parentKey),
      });
    }
  };
  visit(storyBible, []);
  return fields;
}

function formatBibleFieldValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item ?? "")).join("\n");
  return value == null ? "" : String(value);
}

function getContextualBibleFieldLabel(storyBible: unknown, path: BibleFieldPath, label: string): string {
  if (path[0] === "characters" && typeof path[1] === "number") {
    const characterName = getDeep(storyBible, ["characters", path[1], "name"]);
    const character = typeof characterName === "string" && characterName.trim()
      ? ` (${characterName.trim()})`
      : "";
    return `Nhân vật ${path[1] + 1}${character} · ${label}`;
  }
  if (path[0] === "relationship_dynamics" && typeof path[1] === "number") {
    const pair = getDeep(storyBible, ["relationship_dynamics", path[1], "between"]);
    const pairLabel = Array.isArray(pair)
      ? pair.filter((name): name is string => typeof name === "string" && Boolean(name.trim())).join(" – ")
      : "";
    const relationship = pairLabel ? ` (${pairLabel})` : "";
    const fieldLabel = path[2] === "between" && typeof path[3] === "number"
      ? `Nhân vật ${path[3] === 0 ? "A" : "B"}`
      : label;
    return `Quan hệ ${path[1] + 1}${relationship} · ${fieldLabel}`;
  }
  return label;
}

function isCompatibleBibleFieldValue(value: unknown, fieldType: BibleFieldType): boolean {
  if (fieldType === "string") return typeof value === "string";
  if (fieldType === "number") return typeof value === "number" && Number.isFinite(value);
  if (fieldType === "boolean") return typeof value === "boolean";
  return Array.isArray(value) && value.every((item: unknown) => typeof item === "string");
}

type TextFieldProps = {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  type?: "text" | "number" | "checkbox";
  placeholder?: string;
  disabled?: boolean;
  fieldPath?: BibleFieldPath;
  fieldType?: BibleFieldType;
};

function TextField({ label, value, onChange, type = "text", placeholder, disabled, fieldPath, fieldType }: TextFieldProps) {
  const editContext = useContext(BibleFieldEditContext);
  const canOpenEditor = Boolean(fieldPath && editContext);
  const openEditor = () => {
    if (!fieldPath || !editContext) return;
    const fieldKey = fieldPath[fieldPath.length - 1];
    editContext?.openFieldEditor({
      path: fieldPath,
      label,
      value,
      fieldType: fieldType ?? getBibleFieldType(value, typeof fieldKey === "string" ? fieldKey : undefined),
      editorType: "text",
    });
  };
  const editButton = canOpenEditor && (
    <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={openEditor} disabled={disabled}>
      <Pencil className="mr-1 h-3 w-3" /> Chỉnh sửa
    </Button>
  );
  const input = (
    <Input
      type={type}
      value={typeof value === "string" || typeof value === "number" ? value : ""}
      checked={type === "checkbox" ? Boolean(value) : undefined}
      className={type === "checkbox" ? "h-4 w-4" : undefined}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={canOpenEditor && type !== "checkbox"}
      onClick={canOpenEditor ? (event) => {
        if (type === "checkbox") event.preventDefault();
        openEditor();
      } : undefined}
      onChange={(e) => {
        if (type !== "checkbox") onChange(e.target.value);
      }}
    />
  );
  return (
    <div className={type === "checkbox" ? "flex items-center gap-2" : "space-y-1"}>
      {type === "checkbox" ? (
        <>
          {input}
          <Label className="cursor-pointer">{label}</Label>
          {editButton}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <Label>{label}</Label>
            {editButton}
          </div>
          {input}
        </>
      )}
    </div>
  );
}

type TextAreaFieldProps = {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  fieldPath?: BibleFieldPath;
};

function TextAreaField({ label, value, onChange, rows = 3, placeholder, fieldPath }: TextAreaFieldProps) {
  const editContext = useContext(BibleFieldEditContext);
  const canOpenEditor = Boolean(fieldPath && editContext);
  const openEditor = () => {
    if (!fieldPath || !editContext) return;
    editContext?.openFieldEditor({
      path: fieldPath,
      label,
      value,
      fieldType: "string",
      editorType: "textarea",
    });
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {canOpenEditor && (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={openEditor}>
            <Pencil className="mr-1 h-3 w-3" /> Chỉnh sửa
          </Button>
        )}
      </div>
      <Textarea
        value={typeof value === "string" || typeof value === "number" ? value : ""}
        placeholder={placeholder}
        rows={rows}
        readOnly={canOpenEditor}
        onClick={canOpenEditor ? openEditor : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

type ArrayTextareaFieldProps = {
  label: string;
  value: unknown;
  onChange: (value: string[]) => void;
  rows?: number;
  placeholder?: string;
  fieldPath?: BibleFieldPath;
};

function ArrayTextareaField({ label, value, onChange, rows = 3, placeholder, fieldPath }: ArrayTextareaFieldProps) {
  const editContext = useContext(BibleFieldEditContext);
  const safeValue = Array.isArray(value) ? value.map((item) => String(item ?? "")) : [];
  const canOpenEditor = Boolean(fieldPath && editContext);
  const openEditor = () => {
    if (!fieldPath || !editContext) return;
    editContext?.openFieldEditor({
      path: fieldPath,
      label,
      value: safeValue,
      fieldType: "string_array",
      editorType: "array",
    });
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {canOpenEditor && (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={openEditor}>
            <Pencil className="mr-1 h-3 w-3" /> Chỉnh sửa
          </Button>
        )}
      </div>
      <Textarea
        value={safeValue.join("\n")}
        placeholder={placeholder}
        rows={rows}
        readOnly={canOpenEditor}
        onClick={canOpenEditor ? openEditor : undefined}
        onChange={(e) => onChange(e.target.value.split("\n"))}
      />
    </div>
  );
}

type BasicCharacter = {
  name?: string;
  age?: string | number;
  role_in_story?: string;
  motivation?: string;
  personality?: {
    strength?: string;
    flaw?: string;
  };
};

type BasicRelationship = {
  between?: string[];
  current_relationship?: string;
};

/* ------------------------------------------------------------------ */
/* Default shapes used when adding new characters / relationships      */
/* ------------------------------------------------------------------ */

const emptyCharacter = {
  name: "",
  age: "",
  role_in_story: "",
  relationship_to_protagonist: "",
  appearance: "",
  fear: "",
  motivation: "",
  emotional_need: "",
  living_situation: "",
  career_and_financial_status: "",
  external_pressure: "",
  internal_conflict: "",
  secrets_or_insecurities: "",
  habits: [] as string[],
  personality: { flaw: "", strength: "", core_traits: [] as string[] },
  character_arc: {
    starting_belief: "",
    false_belief: "",
    truth_they_learn: "",
    ending_state: "",
  },
};

const emptyRelationship = {
  between: ["", ""] as string[],
  current_relationship: "",
  relationship_arc: "",
  bonding_mechanism: "",
  source_of_tension: "",
  unspoken_issue: "",
  what_a_needs_from_b: "",
  what_b_needs_from_a: "",
  physical_intimacy_arc: "",
};

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
  "Khác (Chức năng phụ trợ)"
];

export default function ArchitecturePage() {
  const params = useParams();
  const projectId = params.id as string;

  // States
  const [bibleLoading, setBibleLoading] = useState(false);
  const [bibleData, setBibleData] = useState<any>(null);
  const [bibleStatus, setBibleStatus] = useState<"pending" | "done">("pending");
  const [bibleView, setBibleView] = useState<"visual" | "edit">("visual");
  
  const [pacingLoading, setPacingLoading] = useState(false);
  const [chapters, setChapters] = useState<any[]>([]);
  const [pacingStatus, setPacingStatus] = useState<"pending" | "done">("pending");

  // === THÊM STATE CHO CHARACTER ===
  const [isAiCharModalOpen, setIsAiCharModalOpen] = useState(false);
  const [aiCharPrompt, setAiCharPrompt] = useState("");
  const [isGeneratingChar, setIsGeneratingChar] = useState(false);

  // === THÊM STATE CHO RELATIONSHIP ===
  const [isAiRelModalOpen, setIsAiRelModalOpen] = useState(false);
  const [aiRelMode, setAiRelMode] = useState<"manual" | "automatic">("manual");
  const [aiRelPrompt, setAiRelPrompt] = useState("");
  const [aiRelCharacterAIndex, setAiRelCharacterAIndex] = useState("");
  const [aiRelCharacterBIndex, setAiRelCharacterBIndex] = useState("");
  const [aiRelCharacterADescription, setAiRelCharacterADescription] = useState("");
  const [aiRelCharacterBDescription, setAiRelCharacterBDescription] = useState("");
  const [isGeneratingRel, setIsGeneratingRel] = useState(false);
  const [visualSelectedRelationshipIndex, setVisualSelectedRelationshipIndex] = useState<number | null>(null);

  // STATE THEO DÕI THAY ĐỔI CHƯA LƯU (IS DIRTY)
  const [isBibleDirty, setIsBibleDirty] = useState(false);
  const [isPacingDirty, setIsPacingDirty] = useState(false);

  // === THÊM STATE CHO AI CHAPTER ===
  const [isAiChapModalOpen, setIsAiChapModalOpen] = useState(false);
  const [aiChapStep, setAiChapStep] = useState<1 | 2>(1); // 1: Input ý tưởng, 2: Nhận phản biện
  const [aiChapAction, setAiChapAction] = useState<"insert" | "edit">("insert");
  const [targetChapIndex, setTargetChapIndex] = useState(0);
  const [aiChapPrompt, setAiChapPrompt] = useState("");
  const [isGeneratingAiChap, setIsGeneratingAiChap] = useState(false);

  const [userOriginalPrompt, setUserOriginalPrompt] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysisData, setAiAnalysisData] = useState<any>(null); // Chứa critique và suggested_prompt

  const [isSavingBibleChanges, setIsSavingBibleChanges] = useState(false);
  const [isSavingPacingChanges, setIsSavingPacingChanges] = useState(false);
  const [isRegeneratingPovRecommendation, setIsRegeneratingPovRecommendation] = useState(false);
  const [bibleFieldEdit, setBibleFieldEdit] = useState<BibleFieldEditRequest | null>(null);
  const [bibleFieldEditStep, setBibleFieldEditStep] = useState<"choose" | "manual" | "ai" | "review">("choose");
  const [manualBibleFieldValue, setManualBibleFieldValue] = useState("");
  const [aiBibleFieldPrompt, setAiBibleFieldPrompt] = useState("");
  const [aiBibleFieldError, setAiBibleFieldError] = useState<string | null>(null);
  const [isGeneratingBibleFieldEdit, setIsGeneratingBibleFieldEdit] = useState(false);
  const [bibleFieldProposal, setBibleFieldProposal] = useState<{
    field_value: unknown;
    related_changes: { path: BibleFieldPath; label: string; value: unknown; reason: string }[];
  } | null>(null);
  const [selectedBibleRelatedChanges, setSelectedBibleRelatedChanges] = useState<string[]>([]);

  // Thêm state cho modal đánh giá
  const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalData, setEvalData] = useState<any>(null);

  const fetchChapters = async () => {
    apiClient.get<any[]>(`/api/projects/${projectId}/chapters`)
      .then((data) => {
        if (data.success && data.data.length > 0) {
          setChapters(data.data);
          setPacingStatus("done");
        }
      });
  };
  
  useEffect(() => {
    apiClient.get<any>(`/api/projects/${projectId}`)
      .then((data) => {
        if (data.success) {
          if (data.data.story_bible) {
            setBibleData(data.data.story_bible);
            setBibleStatus("done");
          }
        }
      });
    fetchChapters();
  }, [projectId]);

  // 1. HÀM LƯU RIÊNG CHO STORY BIBLE
  const handleSaveBible = async (dataToSave = bibleData) => {
    setIsSavingBibleChanges(true);
    try {
      await apiClient.put(`/api/projects/${projectId}/update-bible`, { story_bible: dataToSave });
      setIsBibleDirty(false); // Tắt cờ
    } catch (e) {
      alert("Lỗi khi lưu Story Bible");
    } finally {
      setIsSavingBibleChanges(false);
    }
  };

  // THÊM CHƯƠNG MỚI (Tại vị trí index)
  const addChapterAt = (index: number) => {
    const newChaps = [...chapters];
    // Chèn 1 object rỗng (chưa có ID) vào vị trí index
    newChaps.splice(index, 0, {
      temp_id: createTemporaryId(),
      chapter_number: 0, // Sẽ được đánh số lại ở hàm recalculate
      title: "Chương mới",
      timeline_period: "Hiện tại",
      pov_character: "Chưa xác định",
      main_event: "",
      primary_function: "Setup (Thiết lập cơ bản)" // Thay đổi mặc định cho chuẩn với hệ thống mới
    });
    
    // Đánh lại số thứ tự
    const renumberedChaps = newChaps.map((c, i) => ({ ...c, chapter_number: i + 1 }));
    
    setChapters(renumberedChaps);
    setIsPacingDirty(true);
  };

  // XÓA CHƯƠNG
  const removeChapter = (index: number) => {
    const confirm = window.confirm("Bạn có chắc muốn xóa chương này không? Dữ liệu bản nháp (nếu có) sẽ bị mất.");
    if (!confirm) return;
    
    const newChaps = [...chapters];
    newChaps.splice(index, 1);
    
    // Đánh lại số thứ tự
    const renumberedChaps = newChaps.map((c, i) => ({ ...c, chapter_number: i + 1 }));
    
    setChapters(renumberedChaps);
    setIsPacingDirty(true);
  };

  // CẬP NHẬT TRƯỜNG DỮ LIỆU CỦA CHƯƠNG
  const updateChapterField = (index: number, field: string, value: string) => {
    const newChaps = [...chapters];
    newChaps[index][field] = value;
    setChapters(newChaps);
    setIsPacingDirty(true);
  };

  // HÀM SAVE PACING MỚI (Gửi nguyên mảng)
  const handleSavePacing = async () => {
    setIsSavingPacingChanges(true);
    try {
      const chaptersToSave = chapters.map((chapter) => ({
        id: chapter.id ?? null,
        chapter_number: chapter.chapter_number,
        title: chapter.title ?? "",
        timeline_period: chapter.timeline_period ?? "",
        pov_character: Array.isArray(chapter.pov_character)
          ? chapter.pov_character.join(", ")
          : chapter.pov_character ?? "",
        main_event: chapter.main_event ?? "",
        primary_function: chapter.primary_function ?? "",
        emotional_beat: chapter.emotional_beat ?? "",
        relationship_beat: chapter.relationship_beat ?? "",
        chapter_hook: chapter.chapter_hook ?? "",
        continuity_note: chapter.continuity_note ?? "",
      }));
      await apiClient.put(`/api/projects/${projectId}/bulk-update-chapters`, { chapters: chaptersToSave });
      setEvalData(null);
      setIsPacingDirty(false);
      // Tải lại danh sách để lấy ID mới do Supabase cấp cho các chương vừa tạo
      fetchChapters(); 
    } catch (e) {
      alert("Lỗi khi lưu Pacing.");
    } finally {
      setIsSavingPacingChanges(false);
    }
  };

  // Hàm gọi API tạo Story Bible
  const generateBible = async () => {
    setBibleLoading(true);
    try {
      const result = await apiClient.post<any>(`/api/projects/${projectId}/generate-bible`);

      if (result.success) {
        setBibleData(result.data);
        setBibleStatus("done");
      } else {
        alert("Lỗi: " + result.detail);
      }
    } catch (error) {
      console.error(error);
      alert("Lỗi kết nối Backend.");
    } finally {
      setBibleLoading(false);
    }
  };

  // Hàm gọi API tạo Pacing (Tự động chẻ chapter vào DB)
  const generatePacing = async () => {
    setPacingLoading(true);
    try {
      const result = await apiClient.post<any>(`/api/projects/${projectId}/generate-pacing`);

      if (result.success) {
        alert(result.message);
        await fetchChapters(); // Tải dữ liệu thật từ Supabase
        setPacingStatus("done");
      } else {
        alert("Lỗi từ server: " + result.detail);
      }
    } catch (error) {
      console.error(error);
      alert("Lỗi tạo Pacing.");
    } finally {
      setPacingLoading(false);
    }
  };

  // 3. SỬA HÀM UPDATE DATA ĐỂ BẬT ĐÚNG CỜ
  const updateBible = (path: (string | number)[], value: any) => {
    setBibleData((prev: any) => setDeep(prev ?? {}, path, value));
    setIsBibleDirty(true); // Chỉ bật cờ Bible
  };

  const openBibleFieldEditor = (field: BibleFieldEditRequest) => {
    setBibleFieldEdit({
      ...field,
      label: getContextualBibleFieldLabel(bibleData, field.path, field.label),
    });
    setBibleFieldEditStep("choose");
    setManualBibleFieldValue(formatBibleFieldValue(field.value));
    setAiBibleFieldPrompt("");
    setAiBibleFieldError(null);
    setBibleFieldProposal(null);
    setSelectedBibleRelatedChanges([]);
  };

  const updateBibleFieldValues = (changes: { path: BibleFieldPath; value: unknown }[]) => {
    setBibleData((previous: any) => {
      let next = previous ?? {};
      for (const change of changes) {
        next = setDeep(next, change.path, change.value);
        if (change.path.join(".") === "narrative_rules.pov_recommendation.system_instruction_string") {
          next = setDeep(next, ["pov_instruction"], change.value);
        } else if (change.path.join(".") === "pov_instruction") {
          next = setDeep(next, ["narrative_rules", "pov_recommendation", "system_instruction_string"], change.value);
        }
      }
      return next;
    });
    setIsBibleDirty(true);
    setBibleFieldEdit(null);
  };

  const generateBibleFieldProposal = async () => {
    if (!bibleFieldEdit || !aiBibleFieldPrompt.trim()) {
      setAiBibleFieldError("Nhập yêu cầu chỉnh sửa cho AI.");
      return;
    }
    setIsGeneratingBibleFieldEdit(true);
    setAiBibleFieldError(null);
    try {
      const fields = getEditableBibleFields(bibleData ?? {});
      const targetPathKey = JSON.stringify(bibleFieldEdit.path);
      const editableFields = [
        ...fields.filter((field) => JSON.stringify(field.path) !== targetPathKey),
        {
          path: bibleFieldEdit.path,
          label: bibleFieldEdit.label,
          field_type: bibleFieldEdit.fieldType,
        },
      ];
      const result = await apiClient.post<{
        field_value: unknown;
        related_changes: { path: BibleFieldPath; label: string; value: unknown; reason: string }[];
      }>(`/api/projects/${projectId}/edit-bible-field`, {
        current_bible: bibleData ?? {},
        field_path: bibleFieldEdit.path,
        field_label: bibleFieldEdit.label,
        field_type: bibleFieldEdit.fieldType,
        user_prompt: aiBibleFieldPrompt.trim(),
        editable_fields: editableFields,
      });
      const proposal = result.data;
      const primaryValueValid = Boolean(
        proposal && isCompatibleBibleFieldValue(proposal.field_value, bibleFieldEdit.fieldType)
      );
      if (!proposal || !primaryValueValid || !Array.isArray(proposal.related_changes)) {
        throw new Error("AI không trả về đề xuất field hợp lệ.");
      }
      setBibleFieldProposal(proposal);
      setSelectedBibleRelatedChanges(proposal.related_changes.map((change) => JSON.stringify(change.path)));
      setBibleFieldEditStep("review");
    } catch (error) {
      setAiBibleFieldError(error instanceof Error ? error.message : "Không thể tạo đề xuất chỉnh sửa bằng AI.");
    } finally {
      setIsGeneratingBibleFieldEdit(false);
    }
  };

  const applyManualBibleFieldEdit = () => {
    if (!bibleFieldEdit) return;
    let value: unknown = manualBibleFieldValue;
    if (bibleFieldEdit.fieldType === "string_array") {
      value = manualBibleFieldValue.split("\n");
    } else if (bibleFieldEdit.fieldType === "number") {
      if (!manualBibleFieldValue.trim()) {
        setAiBibleFieldError("Nhập một giá trị số hợp lệ.");
        return;
      }
      value = Number(manualBibleFieldValue);
      if (!Number.isFinite(value)) {
        setAiBibleFieldError("Nhập một giá trị số hợp lệ.");
        return;
      }
    } else if (bibleFieldEdit.fieldType === "boolean") {
      value = manualBibleFieldValue === "true";
    }
    updateBibleFieldValues([{ path: bibleFieldEdit.path, value }]);
  };

  const applyBibleFieldProposal = () => {
    if (!bibleFieldEdit || !bibleFieldProposal) return;
    const selectedPathKeys = new Set(selectedBibleRelatedChanges);
    const acceptedRelatedChanges = bibleFieldProposal.related_changes
      .filter((change) => selectedPathKeys.has(JSON.stringify(change.path)))
      .map(({ path, value }) => ({ path, value }));
    updateBibleFieldValues([
      { path: bibleFieldEdit.path, value: bibleFieldProposal.field_value },
      ...acceptedRelatedChanges,
    ]);
  };

  const updatePovInstruction = (value: string) => {
    setBibleData((prev: any) => {
      const withRecommendation = setDeep(
        prev ?? {},
        ["narrative_rules", "pov_recommendation", "system_instruction_string"],
        value
      );
      return setDeep(withRecommendation, ["pov_instruction"], value);
    });
    setIsBibleDirty(true);
  };

  const regeneratePovRecommendation = async () => {
    const suggestedType = bibleData?.narrative_rules?.pov_recommendation?.suggested_type?.trim();
    if (!suggestedType) return alert("Vui lòng nhập loại ngôi kể trước.");

    setIsRegeneratingPovRecommendation(true);
    try {
      const result = await apiClient.post<any>(
        `/api/projects/${projectId}/regenerate-pov-recommendation`,
        { current_bible: bibleData, suggested_type: suggestedType }
      );
      const { reasoning, system_instruction_string: systemInstruction } = result.data || {};
      if (
        typeof reasoning !== "string" || !reasoning.trim() ||
        typeof systemInstruction !== "string" || !systemInstruction.trim()
      ) {
        throw new Error("AI không trả về đủ thông tin ngôi kể.");
      }

      setBibleData((prev: any) => ({
        ...prev,
        narrative_rules: {
          ...(prev?.narrative_rules || {}),
          pov_recommendation: {
            ...(prev?.narrative_rules?.pov_recommendation || {}),
            reasoning: reasoning.trim(),
            system_instruction_string: systemInstruction.trim(),
          },
        },
        pov_instruction: systemInstruction.trim(),
      }));
      setIsBibleDirty(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Lỗi tạo lại đề xuất ngôi kể.");
    } finally {
      setIsRegeneratingPovRecommendation(false);
    }
  };

  // Cập nhật mục tiêu chương (goal)
  const updateChapterGoal = (index: number, newGoal: string) => {
    const newChaps = [...chapters];
    newChaps[index].goal = newGoal;
    setChapters(newChaps);
    setIsPacingDirty(true); // Chỉ bật cờ Pacing
  };

  // 4. THÊM / XÓA NHÂN VẬT & QUAN HỆ
  const addCharacter = () => {
    const newData = {
      ...bibleData,
      characters: [...(bibleData?.characters || []), { ...emptyCharacter }],
    };
    setBibleData(newData);
    setIsBibleDirty(true);
  };

  // XÓA NHÂN VẬT
  const removeCharacter = (index: number) => {
    const newChars = [...(bibleData?.characters || [])];
    newChars.splice(index, 1);
    const newData = { ...bibleData, characters: newChars };
    setBibleData(newData);
    setIsBibleDirty(true);
  };

  // THÊM QUAN HỆ
  const addRelationship = () => {
    const newData = {
      ...bibleData,
      relationship_dynamics: [...(bibleData?.relationship_dynamics || []), { ...emptyRelationship }],
    };
    setBibleData(newData);
    setIsBibleDirty(true);
  };

  // XÓA QUAN HỆ
  const removeRelationship = (index: number) => {
    const newRels = [...(bibleData?.relationship_dynamics || [])];
    newRels.splice(index, 1);
    const newData = { ...bibleData, relationship_dynamics: newRels };
    setBibleData(newData);
    setIsBibleDirty(true);
  };

  // 5. HÀM GỌI API TẠO NHÂN VẬT & QUAN HỆ BẰNG AI
  const generateAiCharacter = async () => {
    if (!aiCharPrompt.trim()) return alert("Vui lòng nhập mô tả nhân vật!");
    
    setIsGeneratingChar(true);
    try {
      const result = await apiClient.post<any>(`/api/projects/${projectId}/generate-character`, {
          user_prompt: aiCharPrompt,
          current_bible: bibleData // Đưa Bible hiện tại lên làm context
        });
      
      if (result.success) {
        // Chèn nhân vật mới vào list và tự động Bật cờ Dirty
        const newData = {
          ...bibleData,
          characters: [...(bibleData?.characters || []), result.data],
        };
        setBibleData(newData);
        setIsBibleDirty(true);
        
        // Đóng modal và reset
        setIsAiCharModalOpen(false);
        setAiCharPrompt("");
      } else {
        alert("Lỗi tạo nhân vật: " + result.detail);
      }
    } catch (e) {
      alert("Mất kết nối Backend.");
    } finally {
      setIsGeneratingChar(false);
    }
  };

  // 6. HÀM GỌI API TẠO QUAN HỆ BẰNG AI
  const generateAiRelationship = async () => {
    if (aiRelMode === "manual" && !aiRelPrompt.trim()) {
      return alert("Vui lòng nhập mô tả mối quan hệ!");
    }

    const characterAIndex = Number(aiRelCharacterAIndex);
    const characterBIndex = Number(aiRelCharacterBIndex);
    if (
      aiRelMode === "automatic" &&
      (!aiRelCharacterAIndex || !aiRelCharacterBIndex || characterAIndex === characterBIndex)
    ) {
      return alert("Vui lòng chọn hai nhân vật khác nhau!");
    }
    
    setIsGeneratingRel(true);
    try {
      const requestData = aiRelMode === "manual"
        ? {
            mode: "manual",
            user_prompt: aiRelPrompt.trim(),
            current_bible: bibleData,
          }
        : {
            mode: "automatic",
            user_prompt: "",
            current_bible: bibleData,
            character_a_index: characterAIndex,
            character_b_index: characterBIndex,
            character_a_description: aiRelCharacterADescription.trim(),
            character_b_description: aiRelCharacterBDescription.trim(),
          };
      const result = await apiClient.post<any>(`/api/projects/${projectId}/generate-relationship`, {
        ...requestData,
      });
      
      if (result.success) {
        // Chèn vào list và bật cờ Dirty
        const generatedRelationship = aiRelMode === "automatic"
          ? {
              ...result.data,
              between: [
                bibleData?.characters?.[characterAIndex]?.name || result.data.between?.[0] || "",
                bibleData?.characters?.[characterBIndex]?.name || result.data.between?.[1] || "",
              ],
            }
          : result.data;
        const nextRelationships = [...(bibleData?.relationship_dynamics || []), generatedRelationship];
        const newData = {
          ...bibleData,
          relationship_dynamics: nextRelationships,
        };
        setBibleData(newData);
        setIsBibleDirty(true);
        setVisualSelectedRelationshipIndex(nextRelationships.length - 1);
        
        // Đóng modal và reset
        setIsAiRelModalOpen(false);
        setAiRelMode("manual");
        setAiRelPrompt("");
        setAiRelCharacterAIndex("");
        setAiRelCharacterBIndex("");
        setAiRelCharacterADescription("");
        setAiRelCharacterBDescription("");
      } else {
        alert("Lỗi tạo quan hệ: " + result.detail);
      }
    } catch (e) {
      alert("Mất kết nối Backend.");
    } finally {
      setIsGeneratingRel(false);
    }
  };

  const openAiRelationshipModal = (characterAIndex?: number, characterBIndex?: number) => {
    const hasCharacterPair = characterAIndex !== undefined && characterBIndex !== undefined;
    setAiRelMode(hasCharacterPair ? "automatic" : "manual");
    setAiRelPrompt("");
    setAiRelCharacterAIndex(hasCharacterPair ? String(characterAIndex) : "");
    setAiRelCharacterBIndex(hasCharacterPair ? String(characterBIndex) : "");
    setAiRelCharacterADescription("");
    setAiRelCharacterBDescription("");
    setVisualSelectedRelationshipIndex(null);
    setIsAiRelModalOpen(true);
  };

  // 7. HÀM MỞ MODAL AI CHAPTER (DÙNG CHO CẢ INSERT VÀ EDIT)
  const openAiChapModal = (action: "insert" | "edit", index: number) => {
    setAiChapAction(action);
    setTargetChapIndex(index);
    setUserOriginalPrompt("");
    setAiChapStep(1);
    setAiAnalysisData(null);
    setIsAiChapModalOpen(true);
  };

  // 8. HÀM GỌI API PHÂN TÍCH Ý TƯỞNG CHƯƠNG (BƯỚC 1)
  const analyzeAiChapterIdea = async () => {
    if (!userOriginalPrompt.trim()) return alert("Vui lòng nhập ý tưởng!");
    setIsAnalyzing(true);
    try {
      const result = await apiClient.post<any>(`/api/projects/${projectId}/analyze-chapter-idea`, {
          action_type: aiChapAction,
          target_index: targetChapIndex,
          user_prompt: userOriginalPrompt,
          current_chapters: chapters
        });
      if (result.success) {
        setAiAnalysisData(result.data);
        setAiChapStep(2); // Chuyển sang màn Review
      } else alert("Lỗi phân tích: " + result.detail);
    } catch (e) { alert("Mất kết nối Backend."); } 
    finally { setIsAnalyzing(false); }
  };

  // 9. HÀM GỌI API TẠO CHƯƠNG CUỐI CÙNG (BƯỚC 2)
  const generateFinalAiChapters = async (finalPromptToUse: string) => {
    if (!finalPromptToUse || finalPromptToUse.trim() === "") {
      return;
    }

    setIsGeneratingAiChap(true);
    try {
      const result = await apiClient.post<any>(`/api/projects/${projectId}/generate-dynamic-chapters`, {
          action_type: aiChapAction,
          target_index: targetChapIndex,
          user_prompt: finalPromptToUse,
          current_chapters: chapters
        });
      
      if (result.success) {
        // Nhận về một MẢNG chứa 1 hoặc nhiều chapters
        const newGeneratedChapters = result.data.map((c: any) => ({
          ...c,
          temp_id: createTemporaryId(),
          status: "Drafting Pending"
        }));
        
        const newChaps = [...chapters];
        
        if (aiChapAction === "insert") {
          // Nếu chèn, xả mảng vào vị trí đó
          newChaps.splice(targetChapIndex, 0, ...newGeneratedChapters);
        } else {
          // Nếu edit, thay thế 1 chương cũ bằng 1 (hoặc N) chương mới
          // Giữ lại id thật của DB cho phần tử đầu tiên (nếu có) để không bị mất kết nối
          const originalId = newChaps[targetChapIndex].id;
          if (originalId) newGeneratedChapters[0].id = originalId;
          
          newChaps.splice(targetChapIndex, 1, ...newGeneratedChapters);
        }
        
        // Đánh lại số thứ tự
        const renumberedChaps = newChaps.map((c, i) => ({ ...c, chapter_number: i + 1 }));
        setChapters(renumberedChaps);
        setIsPacingDirty(true);
        setIsAiChapModalOpen(false);
      } else alert("Lỗi tạo chương: " + result.detail);
    } catch (e) { alert("Mất kết nối Backend."); } 
    finally { setIsGeneratingAiChap(false); }
  };

  // 10. HÀM GỌI API ĐÁNH GIÁ PACING (AI EVALUATE)
  const evaluatePacing = async () => {
    // Ý TƯỞNG 1: CACHING & BẮT LỖI DIRTY
    if (isPacingDirty) {
      alert("Bạn có thay đổi chưa lưu! Vui lòng ấn nút [Lưu Pacing] ở góc dưới màn hình trước để AI phân tích trên cấu trúc mới nhất nhé.");
      return;
    }
    
    setIsEvalModalOpen(true); // Luôn mở modal
    if (evalData) return;     // Nếu đã có cache thì DỪNG LẠI, không gọi API nữa (Chống spam)

    setIsEvaluating(true);
    try {
      const result = await apiClient.post<any>(`/api/projects/${projectId}/evaluate-pacing`);
      if (result.success) setEvalData(result.data);
    } catch (e) {
      alert("Lỗi kết nối AI Đánh giá.");
      setIsEvalModalOpen(false);
    } finally {
      setIsEvaluating(false);
    }
  };

  return (
    <div className="bg-slate-50 p-6 pb-24 relative"> 
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Story Bible & DNA Truyện</h1>
            <p className="text-slate-500">ID Dự án: <span className="font-mono text-xs">{projectId}</span></p>
          </div>
        </div>

        {/* Story Bible */}
        <Tabs defaultValue="bible" className="w-full">
          <TabsContent value="bible">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-white border-b pb-4 flex flex-row items-center justify-between">
                <CardTitle>Hồ Sơ Thế Giới & Nhân Vật</CardTitle>
                <div className="flex items-center gap-2">
                  {bibleStatus === "pending" && (
                    <Button onClick={generateBible} disabled={bibleLoading}>
                      {bibleLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "AI Sinh Story Bible"}
                    </Button>
                  )}
                  <div className="flex rounded-md border border-slate-200 bg-slate-100 p-1" aria-label="Chế độ hiển thị Story Bible">
                    <Button size="sm" variant={bibleView === "visual" ? "default" : "ghost"} onClick={() => setBibleView("visual")}>
                      Graph
                    </Button>
                    <Button size="sm" variant={bibleView === "edit" ? "default" : "ghost"} onClick={() => setBibleView("edit")}>
                      Chỉnh sửa
                    </Button>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-0">
                {bibleView === "visual" ? (
                  <StoryBibleVisual
                    bibleData={bibleData || {}}
                    onChange={updateBible}
                    selectedRelationshipIndex={visualSelectedRelationshipIndex}
                    onCreateRelationship={(sourceIndex, targetIndex) => {
                      openAiRelationshipModal(sourceIndex, targetIndex);
                    }}
                    onDeleteRelationship={(index) => {
                      const nextRelationships = [...(bibleData?.relationship_dynamics || [])];
                      nextRelationships.splice(index, 1);
                      updateBible(["relationship_dynamics"], nextRelationships);
                    }}
                  />
                ) : (
                <>
                <BibleFieldEditContext.Provider value={{ openFieldEditor: openBibleFieldEditor }}>
                <div className="space-y-8 px-6 py-6">
                      <section className="space-y-4">
                        <div>
                          <h3 className="font-semibold text-slate-900">Cốt lõi câu chuyện</h3>
                          <p className="text-sm text-slate-500">Các thông tin nền tảng cần thiết để định hình truyện.</p>
                        </div>
                        <TextField
                          label="Tiêu đề"
                          value={bibleData?.story_identity?.title}
                          fieldPath={["story_identity", "title"]}
                          onChange={(v: string) => updateBible(["story_identity", "title"], v)}
                        />
                        <TextAreaField
                          label="Tiền đề"
                          value={bibleData?.story_identity?.core_premise}
                          fieldPath={["story_identity", "core_premise"]}
                          onChange={(v: string) => updateBible(["story_identity", "core_premise"], v)}
                          rows={4}
                        />
                        <TextAreaField
                          label="Chủ đề trung tâm"
                          value={bibleData?.story_identity?.central_theme}
                          fieldPath={["story_identity", "central_theme"]}
                          onChange={(v: string) => updateBible(["story_identity", "central_theme"], v)}
                          rows={2}
                        />
                        <TextAreaField
                          label="Ngôi kể"
                          placeholder="Ví dụ: Ngôi thứ nhất. Nhân vật Hoàng Nam xưng Tôi."
                          value={
                            bibleData?.narrative_rules?.pov_recommendation?.system_instruction_string ??
                            bibleData?.pov_instruction
                          }
                          fieldPath={["narrative_rules", "pov_recommendation", "system_instruction_string"]}
                          onChange={updatePovInstruction}
                          rows={2}
                        />
                      </section>

                      <Separator />

                      <section className="space-y-4">
                        <div>
                          <h3 className="font-semibold text-slate-900">Nhân vật</h3>
                          <p className="text-sm text-slate-500">Thông tin cốt lõi của từng nhân vật.</p>
                        </div>
                        {(bibleData?.characters || []).map((char: BasicCharacter, index: number) => (
                          <div key={index} className="space-y-4 rounded-md border bg-slate-50 p-4">
                            <div className="flex items-start gap-4">
                              <div className="grid flex-1 grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
                                <TextField
                                  label="Tên nhân vật"
                                  value={char.name}
                                  fieldPath={["characters", index, "name"]}
                                  onChange={(v: string) => updateBible(["characters", index, "name"], v)}
                                />
                                <TextField
                                  label="Tuổi"
                                  value={char.age}
                                  fieldPath={["characters", index, "age"]}
                                  onChange={(v: string) => updateBible(["characters", index, "age"], v)}
                                />
                              </div>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="mt-5"
                                onClick={() => removeCharacter(index)}
                              >
                                Xoá
                              </Button>
                            </div>
                            <TextField
                              label="Vai trò trong truyện"
                              value={char.role_in_story}
                              fieldPath={["characters", index, "role_in_story"]}
                              onChange={(v: string) => updateBible(["characters", index, "role_in_story"], v)}
                            />
                            <TextAreaField
                              label="Động lực"
                              value={char.motivation}
                              fieldPath={["characters", index, "motivation"]}
                              onChange={(v: string) => updateBible(["characters", index, "motivation"], v)}
                              rows={2}
                            />
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <TextField
                                label="Điểm mạnh cốt lõi"
                                value={char.personality?.strength}
                                fieldPath={["characters", index, "personality", "strength"]}
                                onChange={(v: string) =>
                                  updateBible(["characters", index, "personality", "strength"], v)
                                }
                              />
                              <TextField
                                label="Khuyết điểm cốt lõi"
                                value={char.personality?.flaw}
                                fieldPath={["characters", index, "personality", "flaw"]}
                                onChange={(v: string) =>
                                  updateBible(["characters", index, "personality", "flaw"], v)
                                }
                              />
                            </div>
                          </div>
                        ))}
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <Button variant="outline" className="flex-1" onClick={addCharacter}>
                            + Thêm thủ công
                          </Button>
                          <Button
                            className="flex-1 border-indigo-200 bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                            onClick={() => setIsAiCharModalOpen(true)}
                          >
                            <Wand2 className="mr-2 h-4 w-4" /> AI Sinh Nhân Vật
                          </Button>
                        </div>
                      </section>

                      <Separator />

                      <section className="space-y-4">
                        <div>
                          <h3 className="font-semibold text-slate-900">Quan hệ hiện tại</h3>
                          <p className="text-sm text-slate-500">Mối quan hệ hiện tại giữa từng cặp nhân vật.</p>
                        </div>
                        {(bibleData?.relationship_dynamics || []).map((rel: BasicRelationship, index: number) => (
                          <div key={index} className="space-y-4 rounded-md border bg-slate-50 p-4">
                            <div className="flex justify-end">
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => removeRelationship(index)}
                              >
                                Xoá
                              </Button>
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <TextField
                                label="Nhân vật A"
                                value={rel.between?.[0]}
                                fieldPath={["relationship_dynamics", index, "between", 0]}
                                onChange={(v: string) =>
                                  updateBible(["relationship_dynamics", index, "between", 0], v)
                                }
                              />
                              <TextField
                                label="Nhân vật B"
                                value={rel.between?.[1]}
                                fieldPath={["relationship_dynamics", index, "between", 1]}
                                onChange={(v: string) =>
                                  updateBible(["relationship_dynamics", index, "between", 1], v)
                                }
                              />
                            </div>
                            <TextAreaField
                              label="Mối quan hệ hiện tại"
                              value={rel.current_relationship}
                              fieldPath={["relationship_dynamics", index, "current_relationship"]}
                              onChange={(v: string) =>
                                updateBible(["relationship_dynamics", index, "current_relationship"], v)
                              }
                              rows={2}
                            />
                          </div>
                        ))}
                        <div className="flex flex-col gap-3 sm:flex-row">
                          <Button variant="outline" className="flex-1" onClick={addRelationship}>
                            + Thêm thủ công
                          </Button>
                          <Button
                            className="flex-1 border-indigo-200 bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                            onClick={() => openAiRelationshipModal()}
                          >
                            <Wand2 className="mr-2 h-4 w-4" /> AI Sinh Quan Hệ
                          </Button>
                        </div>
                      </section>

                </div>

                <div className="border-t border-slate-200 bg-slate-50/70 px-6 py-5">
                  <div className="mb-3 flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <h3 className="font-semibold text-slate-800">Nâng cao</h3>
                      <p className="text-sm text-slate-600">
                        Các thông tin chi tiết được nhóm theo chủ đề. Mở từng mục khi cần chỉnh sửa; thay đổi có thể ảnh hưởng đến tính nhất quán của Story Bible.
                      </p>
                    </div>
                  </div>
                <Accordion multiple={true} className="w-full">
                  {/* 1. NHẬN DIỆN & CỐT LÕI */}
                  <AccordionItem value="item-1" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Nhận diện & Cốt lõi (Story Identity)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <TextField
                        label="Vibe / Tông truyện"
                        value={bibleData?.story_identity?.vibe}
                        fieldPath={["story_identity", "vibe"]}
                        onChange={(v: any) => updateBible(["story_identity", "vibe"], v)}
                      />
                      <TextAreaField
                        label="Động cơ truyện (Story Engine)"
                        value={bibleData?.story_identity?.story_engine}
                        fieldPath={["story_identity", "story_engine"]}
                        onChange={(v: any) => updateBible(["story_identity", "story_engine"], v)}
                        rows={3}
                      />
                      <ArrayTextareaField
                        label="Chủ đề phụ (Sub Themes)"
                        value={bibleData?.story_identity?.sub_themes}
                        fieldPath={["story_identity", "sub_themes"]}
                        onChange={(v: any) => updateBible(["story_identity", "sub_themes"], v)}
                      />
                      <TextAreaField
                        label="Cảm xúc hứa hẹn (Emotional Promise)"
                        value={bibleData?.story_identity?.emotional_promise}
                        fieldPath={["story_identity", "emotional_promise"]}
                        onChange={(v: any) => updateBible(["story_identity", "emotional_promise"], v)}
                        rows={2}
                      />
                      <TextField
                        label="Cấu trúc Thời gian (Timeline Structure)"
                        value={bibleData?.story_identity?.timeline_structure}
                        fieldPath={["story_identity", "timeline_structure"]}
                        onChange={(v: any) => updateBible(["story_identity", "timeline_structure"], v)}
                      />
                      <TextAreaField
                        label="Câu hỏi cảm xúc mà câu chuyện muốn đặt ra (Thematic Question)"
                        value={bibleData?.story_identity?.thematic_question}
                        fieldPath={["story_identity", "thematic_question"]}
                        onChange={(v: any) => updateBible(["story_identity", "thematic_question"], v)}
                        rows={2}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* 2. NHÂN VẬT */}
                  <AccordionItem value="item-2" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Hệ thống Nhân vật
                    </AccordionTrigger>
                    <AccordionContent className="space-y-6 pt-2">
                      {(bibleData?.characters || []).map((char: any, index: number) => (
                        <div key={index} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                              {index + 1}
                            </span>
                            <div className="min-w-0">
                              <h4 className="truncate font-semibold text-slate-900">
                                {typeof char.name === "string" && char.name.trim()
                                  ? char.name.trim()
                                  : `Nhân vật ${index + 1}`}
                              </h4>
                              <p className="text-xs text-slate-500">Thông tin chi tiết nhân vật</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <TextField
                              label="Quan hệ với nhân vật chính"
                              value={char.relationship_to_protagonist}
                              fieldPath={["characters", index, "relationship_to_protagonist"]}
                              onChange={(v: any) =>
                                updateBible(["characters", index, "relationship_to_protagonist"], v)
                              }
                            />
                          </div>

                          <TextAreaField
                            label="Sự thay đổi qua thời gian (Timeline Evolution)"
                            placeholder="Mô tả sự thay đổi của nhân vật từ quá khứ đến hiện tại (nếu có)"
                            value={char.timeline_evolution}
                            fieldPath={["characters", index, "timeline_evolution"]}
                            onChange={(v: any) => updateBible(["characters", index, "timeline_evolution"], v)}
                            rows={2}
                          />

                          <TextAreaField
                            label="Ngoại hình (Appearance)"
                            value={char.appearance}
                            fieldPath={["characters", index, "appearance"]}
                            onChange={(v: any) => updateBible(["characters", index, "appearance"], v)}
                            rows={2}
                          />

                          <ArrayTextareaField
                            label="Thói quen (Habits)"
                            value={char.habits}
                            fieldPath={["characters", index, "habits"]}
                            onChange={(v: any) => updateBible(["characters", index, "habits"], v)}
                          />

                          <div className="grid grid-cols-2 gap-4">
                            <TextField
                              label="Hoàn cảnh sống"
                              value={char.living_situation}
                              fieldPath={["characters", index, "living_situation"]}
                              onChange={(v: any) => updateBible(["characters", index, "living_situation"], v)}
                            />
                            <TextField
                              label="Sự nghiệp & tài chính"
                              value={char.career_and_financial_status}
                              fieldPath={["characters", index, "career_and_financial_status"]}
                              onChange={(v: any) =>
                                updateBible(["characters", index, "career_and_financial_status"], v)
                              }
                            />
                          </div>

                          <TextAreaField
                            label="Nỗi sợ (Fear)"
                            value={char.fear}
                            fieldPath={["characters", index, "fear"]}
                            onChange={(v: any) => updateBible(["characters", index, "fear"], v)}
                            rows={2}
                          />
                          <TextAreaField
                            label="Nhu cầu cảm xúc (Emotional Need)"
                            value={char.emotional_need}
                            fieldPath={["characters", index, "emotional_need"]}
                            onChange={(v: any) => updateBible(["characters", index, "emotional_need"], v)}
                            rows={2}
                          />
                          <TextAreaField
                            label="Áp lực bên ngoài (External Pressure)"
                            value={char.external_pressure}
                            fieldPath={["characters", index, "external_pressure"]}
                            onChange={(v: any) => updateBible(["characters", index, "external_pressure"], v)}
                            rows={2}
                          />
                          <TextAreaField
                            label="Xung đột nội tâm (Internal Conflict)"
                            value={char.internal_conflict}
                            fieldPath={["characters", index, "internal_conflict"]}
                            onChange={(v: any) => updateBible(["characters", index, "internal_conflict"], v)}
                            rows={2}
                          />
                          <TextAreaField
                            label="Bí mật / Tự ti (Secrets or Insecurities)"
                            value={char.secrets_or_insecurities}
                            fieldPath={["characters", index, "secrets_or_insecurities"]}
                            onChange={(v: any) =>
                              updateBible(["characters", index, "secrets_or_insecurities"], v)
                            }
                            rows={2}
                          />

                          <Separator />
                          <p className="text-sm font-medium text-slate-700">Tính cách (Personality)</p>
                          <ArrayTextareaField
                            label="Đặc điểm cốt lõi (Core Traits)"
                            value={char.personality?.core_traits}
                            fieldPath={["characters", index, "personality", "core_traits"]}
                            onChange={(v: any[]) =>
                              updateBible(["characters", index, "personality", "core_traits"], v)
                            }
                          />

                          <Separator />
                          <p className="text-sm font-medium text-slate-700">
                            Hành trình nhân vật (Character Arc)
                          </p>
                          <TextAreaField
                            label="Niềm tin ban đầu (Starting Belief)"
                            value={char.character_arc?.starting_belief}
                            fieldPath={["characters", index, "character_arc", "starting_belief"]}
                            onChange={(v: any) =>
                              updateBible(["characters", index, "character_arc", "starting_belief"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="Niềm tin sai lệch (False Belief)"
                            value={char.character_arc?.false_belief}
                            fieldPath={["characters", index, "character_arc", "false_belief"]}
                            onChange={(v: any) =>
                              updateBible(["characters", index, "character_arc", "false_belief"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="Sự thật nhận ra (Truth They Learn)"
                            value={char.character_arc?.truth_they_learn}
                            fieldPath={["characters", index, "character_arc", "truth_they_learn"]}
                            onChange={(v: any) =>
                              updateBible(["characters", index, "character_arc", "truth_they_learn"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="Trạng thái kết thúc (Ending State)"
                            value={char.character_arc?.ending_state}
                            fieldPath={["characters", index, "character_arc", "ending_state"]}
                            onChange={(v: any) =>
                              updateBible(["characters", index, "character_arc", "ending_state"], v)
                            }
                            rows={2}
                          />
                        </div>
                      ))}

                    </AccordionContent>
                  </AccordionItem>

                  {/* 3. BỐI CẢNH THẾ GIỚI */}
                  <AccordionItem value="item-3" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Bối cảnh Thế giới (World Building)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <TextAreaField
                        label="Bối cảnh (Setting)"
                        value={bibleData?.world_building?.setting}
                        fieldPath={["world_building", "setting"]}
                        onChange={(v: any) => updateBible(["world_building", "setting"], v)}
                        rows={3}
                      />
                      <TextAreaField
                        label="Bối cảnh Chính (Hiện tại)"
                        value={bibleData?.world_building?.primary_setting || bibleData?.world_building?.setting}
                        fieldPath={["world_building", "primary_setting"]}
                        onChange={(v: any) => updateBible(["world_building", "primary_setting"], v)}
                        rows={2}
                      />
                      <TextAreaField
                        label="Bối cảnh Quá khứ (Nếu có Time-jump)"
                        value={bibleData?.world_building?.past_setting}
                        fieldPath={["world_building", "past_setting"]}
                        onChange={(v: any) => updateBible(["world_building", "past_setting"], v)}
                        rows={2}
                      />
                      <TextField
                        label="Địa điểm (Location)"
                        value={bibleData?.world_building?.location}
                        fieldPath={["world_building", "location"]}
                        onChange={(v: any) => updateBible(["world_building", "location"], v)}
                      />
                      <TextAreaField
                        label="Đời sống thường nhật (Daily Life)"
                        value={bibleData?.world_building?.daily_life}
                        fieldPath={["world_building", "daily_life"]}
                        onChange={(v: any) => updateBible(["world_building", "daily_life"], v)}
                        rows={2}
                      />
                      <TextAreaField
                        label="Các mối quan hệ xã hội (Social Circles)"
                        value={bibleData?.world_building?.social_circles}
                        fieldPath={["world_building", "social_circles"]}
                        onChange={(v: any) => updateBible(["world_building", "social_circles"], v)}
                        rows={2}
                      />
                      <TextAreaField
                        label="Bối cảnh văn hoá (Cultural Context)"
                        value={bibleData?.world_building?.cultural_context}
                        fieldPath={["world_building", "cultural_context"]}
                        onChange={(v: any) => updateBible(["world_building", "cultural_context"], v)}
                        rows={2}
                      />
                      <ArrayTextareaField
                        label="Áp lực kinh tế - xã hội (Socio-economic Pressures)"
                        value={bibleData?.world_building?.socio_economic_pressures}
                        fieldPath={["world_building", "socio_economic_pressures"]}
                        onChange={(v: any) => updateBible(["world_building", "socio_economic_pressures"], v)}

                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* 4. HỆ THỐNG XUNG ĐỘT */}
                  <AccordionItem value="item-4" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Hệ thống Xung đột (Conflict System)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <TextAreaField
                        label="Xung đột trung tâm (Central Conflict)"
                        value={bibleData?.conflict_system?.central_conflict}
                        fieldPath={["conflict_system", "central_conflict"]}
                        onChange={(v: any) => updateBible(["conflict_system", "central_conflict"], v)}
                        rows={3}
                      />
                      <TextAreaField
                        label="Nguồn gốc vi-xung đột (Micro-conflict Origin)"
                        value={bibleData?.conflict_system?.micro_conflict_origin}
                        fieldPath={["conflict_system", "micro_conflict_origin"]}
                        onChange={(v: any) => updateBible(["conflict_system", "micro_conflict_origin"], v)}
                        rows={2}
                      />
                      <TextAreaField
                        label="Logic leo thang (Escalation Logic)"
                        value={bibleData?.conflict_system?.escalation_logic}
                        fieldPath={["conflict_system", "escalation_logic"]}
                        onChange={(v: any) => updateBible(["conflict_system", "escalation_logic"], v)}
                        rows={3}
                      />
                      <ArrayTextareaField
                        label="Xung đột bên ngoài (External Conflicts)"
                        value={bibleData?.conflict_system?.external_conflicts}
                        fieldPath={["conflict_system", "external_conflicts"]}
                        onChange={(v: any) => updateBible(["conflict_system", "external_conflicts"], v)}
                      />
                      <ArrayTextareaField
                        label="Xung đột nội tâm (Internal Conflicts)"
                        value={bibleData?.conflict_system?.internal_conflicts}
                        fieldPath={["conflict_system", "internal_conflicts"]}
                        onChange={(v: any) => updateBible(["conflict_system", "internal_conflicts"], v)}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* 5. QUY TẮC TRẦN THUẬT */}
                  <AccordionItem value="item-5" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Quy tắc Trần thuật (Narrative Rules)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-4">
                        <TextField
                          label="Tông giọng (Tone)"
                          value={bibleData?.narrative_rules?.tone}
                          fieldPath={["narrative_rules", "tone"]}
                          onChange={(v: any) => updateBible(["narrative_rules", "tone"], v)}
                        />
                        <TextField
                          label="Nhịp độ (Pacing)"
                          value={bibleData?.narrative_rules?.pacing}
                          fieldPath={["narrative_rules", "pacing"]}
                          onChange={(v: any) => updateBible(["narrative_rules", "pacing"], v)}
                        />
                      </div>
                      <TextAreaField
                        label="Phong cách hội thoại (Dialogue Style)"
                        value={bibleData?.narrative_rules?.dialogue_style}
                        fieldPath={["narrative_rules", "dialogue_style"]}
                        onChange={(v: any) => updateBible(["narrative_rules", "dialogue_style"], v)}
                        rows={2}
                      />
                      <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                          <div className="flex-1">
                            <TextField
                              label="Ngôi kể đề xuất (Suggested Type)"
                              value={bibleData?.narrative_rules?.pov_recommendation?.suggested_type}
                              fieldPath={["narrative_rules", "pov_recommendation", "suggested_type"]}
                              onChange={(v: string) => updateBible(["narrative_rules", "pov_recommendation", "suggested_type"], v)}
                              placeholder="Ví dụ: Ngôi thứ nhất (Single POV)"
                              disabled={isRegeneratingPovRecommendation}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={regeneratePovRecommendation}
                            disabled={
                              isRegeneratingPovRecommendation ||
                              !bibleData?.narrative_rules?.pov_recommendation?.suggested_type?.trim()
                            }
                          >
                            {isRegeneratingPovRecommendation
                              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              : <Wand2 className="mr-2 h-4 w-4" />}
                            Làm mới bằng AI
                          </Button>
                        </div>
                        <TextAreaField
                          label="Lý do đề xuất (Reasoning)"
                          value={bibleData?.narrative_rules?.pov_recommendation?.reasoning}
                          fieldPath={["narrative_rules", "pov_recommendation", "reasoning"]}
                          onChange={(v: string) => updateBible(["narrative_rules", "pov_recommendation", "reasoning"], v)}
                          rows={3}
                        />
                      </div>
                      <ArrayTextareaField
                        label="Quy tắc hiện thực (Realism Rules)"
                        value={bibleData?.narrative_rules?.realism_rules}
                        fieldPath={["narrative_rules", "realism_rules"]}
                        onChange={(v: any) => updateBible(["narrative_rules", "realism_rules"], v)}
                      />
                      <ArrayTextareaField
                        label="Quy tắc lãng mạn (Romance Rules)"
                        value={bibleData?.narrative_rules?.romance_rules}
                        fieldPath={["narrative_rules", "romance_rules"]}
                        onChange={(v: any) => updateBible(["narrative_rules", "romance_rules"], v)}
                      />
                      <ArrayTextareaField
                        label="Show, don't tell"
                        value={bibleData?.narrative_rules?.show_dont_tell_rules}
                        fieldPath={["narrative_rules", "show_dont_tell_rules"]}
                        onChange={(v: any) => updateBible(["narrative_rules", "show_dont_tell_rules"], v)}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* 6. TÍNH LIÊN TỤC & RANH GIỚI */}
                  <AccordionItem value="item-6" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Tính Liên tục & Ranh giới
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <div className="grid grid-cols-2 gap-4">
                        <TextField
                          label="Tựa đề gốc (Original Seed Title)"
                          value={bibleData?.story_continuity?.original_seed_title}
                          fieldPath={["story_continuity", "original_seed_title"]}
                          onChange={(v: any) => updateBible(["story_continuity", "original_seed_title"], v)}
                        />
                        <TextField
                          label="Vibe gốc (Original Vibe)"
                          value={bibleData?.story_continuity?.original_vibe}
                          fieldPath={["story_continuity", "original_vibe"]}
                          onChange={(v: any) => updateBible(["story_continuity", "original_vibe"], v)}
                        />
                      </div>
                      <ArrayTextareaField
                        label="Từ khoá đã tích hợp (Keywords Integrated)"
                        value={bibleData?.story_continuity?.keywords_integrated}
                        fieldPath={["story_continuity", "keywords_integrated"]}
                        onChange={(v: any) => updateBible(["story_continuity", "keywords_integrated"], v)}
                      />
                      <ArrayTextareaField
                        label="Yếu tố cốt lõi không được thay đổi"
                        value={bibleData?.story_continuity?.core_elements_that_must_not_change}
                        fieldPath={["story_continuity", "core_elements_that_must_not_change"]}
                        onChange={(v: any) =>
                          updateBible(["story_continuity", "core_elements_that_must_not_change"], v)
                        }
                      />
                      <ArrayTextareaField
                        label="Ranh giới trần thuật (Narrative Boundaries)"
                        value={bibleData?.narrative_boundaries}
                        fieldPath={["narrative_boundaries"]}
                        onChange={(v: any) => updateBible(["narrative_boundaries"], v)}
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* 7. HƯỚNG DẪN THÂN MẬT */}
                  <AccordionItem value="item-7" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Hướng dẫn Thân mật (Intimacy Guidance)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <TextField
                        label="Có áp dụng hướng dẫn thân mật"
                        type="checkbox"
                        value={bibleData?.intimacy_guidance?.applicable}
                        fieldPath={["intimacy_guidance", "applicable"]}
                        fieldType="boolean"
                        onChange={() => {}}
                      />
                      <TextAreaField
                        label="Ghi chú (Note)"
                        value={bibleData?.intimacy_guidance?.note}
                        fieldPath={["intimacy_guidance", "note"]}
                        onChange={(v: any) => updateBible(["intimacy_guidance", "note"], v)}
                        rows={2}
                      />
                      <TextAreaField
                        label="Mức độ thoải mái (Comfort Level)"
                        value={bibleData?.intimacy_guidance?.comfort_level}
                        fieldPath={["intimacy_guidance", "comfort_level"]}
                        onChange={(v: any) => updateBible(["intimacy_guidance", "comfort_level"], v)}
                        rows={2}
                      />
                      <TextAreaField
                        label="Phong cách miêu tả (Depiction Style)"
                        value={bibleData?.intimacy_guidance?.depiction_style}
                        fieldPath={["intimacy_guidance", "depiction_style"]}
                        onChange={(v: any) => updateBible(["intimacy_guidance", "depiction_style"], v)}
                        rows={2}
                      />
                      <ArrayTextareaField
                        label="Nhịp thân mật tự nhiên (Natural Intimacy Beats)"
                        value={bibleData?.intimacy_guidance?.natural_intimacy_beats}
                        fieldPath={["intimacy_guidance", "natural_intimacy_beats"]}
                        onChange={(v: any) => updateBible(["intimacy_guidance", "natural_intimacy_beats"], v)}
                      />
                      <ArrayTextareaField
                        label="Quy tắc đồng thuận & nhịp độ (Consent & Pacing Rules)"
                        value={bibleData?.intimacy_guidance?.consent_and_pacing_rules}
                        fieldPath={["intimacy_guidance", "consent_and_pacing_rules"]}
                        onChange={(v: any) =>
                          updateBible(["intimacy_guidance", "consent_and_pacing_rules"], v)
                        }
                      />
                    </AccordionContent>
                  </AccordionItem>

                  {/* 8. MỐI QUAN HỆ */}
                  <AccordionItem value="item-8" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Động lực Mối quan hệ (Relationship Dynamics)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-6 pt-2">
                      {(bibleData?.relationship_dynamics || []).map((rel: any, index: number) => (
                        <div key={index} className="p-4 bg-slate-50 border rounded-md space-y-3 relative">
                          <TextField
                            label="Mối quan hệ Quá khứ (Nếu có)"
                            value={rel.past_relationship}
                            fieldPath={["relationship_dynamics", index, "past_relationship"]}
                            onChange={(v: any) => updateBible(["relationship_dynamics", index, "past_relationship"], v)}
                          />
                          <TextAreaField
                            label="Hành trình mối quan hệ (Relationship Arc)"
                            value={rel.relationship_arc}
                            fieldPath={["relationship_dynamics", index, "relationship_arc"]}
                            onChange={(v: any) =>
                              updateBible(["relationship_dynamics", index, "relationship_arc"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="Cơ chế gắn kết (Bonding Mechanism)"
                            value={rel.bonding_mechanism}
                            fieldPath={["relationship_dynamics", index, "bonding_mechanism"]}
                            onChange={(v: any) =>
                              updateBible(["relationship_dynamics", index, "bonding_mechanism"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="Nguồn căng thẳng (Source of Tension)"
                            value={rel.source_of_tension}
                            fieldPath={["relationship_dynamics", index, "source_of_tension"]}
                            onChange={(v: any) =>
                              updateBible(["relationship_dynamics", index, "source_of_tension"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="Vấn đề chưa nói ra (Unspoken Issue)"
                            value={rel.unspoken_issue}
                            fieldPath={["relationship_dynamics", index, "unspoken_issue"]}
                            onChange={(v: any) =>
                              updateBible(["relationship_dynamics", index, "unspoken_issue"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="A cần gì từ B"
                            value={rel.what_a_needs_from_b}
                            fieldPath={["relationship_dynamics", index, "what_a_needs_from_b"]}
                            onChange={(v: any) =>
                              updateBible(["relationship_dynamics", index, "what_a_needs_from_b"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="B cần gì từ A"
                            value={rel.what_b_needs_from_a}
                            fieldPath={["relationship_dynamics", index, "what_b_needs_from_a"]}
                            onChange={(v: any) =>
                              updateBible(["relationship_dynamics", index, "what_b_needs_from_a"], v)
                            }
                            rows={2}
                          />
                          <TextAreaField
                            label="Hành trình thân mật thể xác (Physical Intimacy Arc)"
                            value={rel.physical_intimacy_arc}
                            fieldPath={["relationship_dynamics", index, "physical_intimacy_arc"]}
                            onChange={(v: any) =>
                              updateBible(["relationship_dynamics", index, "physical_intimacy_arc"], v)
                            }
                            rows={2}
                          />
                        </div>
                      ))}

                    </AccordionContent>
                  </AccordionItem>

                  {/* 9. KIẾN TRÚC CẢM XÚC */}
                  <AccordionItem value="item-9" className="px-6">
                    <AccordionTrigger className="font-semibold text-slate-800">
                      Kiến trúc Cảm xúc (Emotional Architecture)
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                      <TextAreaField
                        label="Trạng thái cảm xúc ban đầu (Starting Emotional State)"
                        value={bibleData?.emotional_architecture?.starting_emotional_state}
                        fieldPath={["emotional_architecture", "starting_emotional_state"]}
                        onChange={(v: any) =>
                          updateBible(["emotional_architecture", "starting_emotional_state"], v)
                        }
                        rows={2}
                      />
                      <TextAreaField
                        label="Bước ngoặt giữa truyện (Midpoint Shift)"
                        value={bibleData?.emotional_architecture?.midpoint_shift}
                        fieldPath={["emotional_architecture", "midpoint_shift"]}
                        onChange={(v: any) => updateBible(["emotional_architecture", "midpoint_shift"], v)}
                        rows={2}
                      />
                      <TextAreaField
                        label="Bước ngoặt cảm xúc lớn (Major Emotional Turn)"
                        value={bibleData?.emotional_architecture?.major_emotional_turn}
                        fieldPath={["emotional_architecture", "major_emotional_turn"]}
                        onChange={(v: any) =>
                          updateBible(["emotional_architecture", "major_emotional_turn"], v)
                        }
                        rows={2}
                      />
                      <TextAreaField
                        label="Cảm xúc khi kết thúc (Resolution Emotion)"
                        value={bibleData?.emotional_architecture?.resolution_emotion}
                        fieldPath={["emotional_architecture", "resolution_emotion"]}
                        onChange={(v: any) => updateBible(["emotional_architecture", "resolution_emotion"], v)}
                        rows={2}
                      />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                </div>
                </BibleFieldEditContext.Provider>
                </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: PACING */}
          {/* TAB 2: PACING (TIMELINE EDITOR) */}
          <TabsContent value="pacing">
            <Card className="border-slate-200 shadow-sm min-h-[50vh] flex flex-col">
              
              <CardHeader className="rounded-t-lg border-b pb-4 flex flex-row items-center justify-between">
                {/* ========================================================== */}
                {/* FLOATING ACTION BUTTONS (DÀNH RIÊNG CHO TAB PACING) */}
                {/* ========================================================== */}
                {pacingStatus === "done" && !isPacingDirty && !isBibleDirty && (
                  // Thêm items-end để khi nút dài ra, nó sẽ đẩy về bên trái và giữ cố định lề phải
                  <div className="fixed bottom-6 right-8 flex flex-col items-end gap-3 z-40 animate-in fade-in slide-in-from-bottom-5">
                    
                    {/* Nút Đánh giá */}
                    <Button 
                      onClick={evaluatePacing} 
                      className="group relative flex items-center justify-start rounded-full shadow-lg p-0 h-12 w-12 hover:w-[190px] bg-white border border-amber-200 text-amber-600 hover:bg-amber-50 font-bold transition-all duration-300 overflow-hidden"
                    >
                      {/* Vùng chứa Icon luôn cố định 48px ở đầu */}
                      <div className="flex items-center justify-center min-w-[3rem] h-full">
                        <Activity className="h-5 w-5" /> 
                      </div>
                      {/* Vùng chữ (Mặc định ẩn, hiện ra khi hover) */}
                      <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-100">
                        Đánh giá Pacing
                      </span>
                    </Button>

                    {/* Nút AI Tạo Cấu Trúc */}
                    <Button 
                      onClick={generatePacing} 
                      disabled={pacingLoading} 
                      className="group relative flex items-center justify-start rounded-full shadow-lg p-0 h-12 w-12 hover:w-[210px] bg-indigo-600 text-white hover:bg-indigo-700 font-bold transition-all duration-300 overflow-hidden"
                    >
                      <div className="flex items-center justify-center min-w-[3rem] h-full">
                        {pacingLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
                      </div>
                      <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-100">
                        {chapters.length > 0 ? "AI Tạo cấu trúc khác" : "AI Tạo cấu trúc"}
                      </span>
                    </Button>

                  </div>
                )}
              </CardHeader>
              
              <CardContent className="flex-1 p-6 bg-slate-50 relative">
                
                {/* TRẠNG THÁI 1: ĐANG LOADING (Gọi AI) */}
                {pacingLoading && (
                  <div className="absolute inset-0 bg-white/80 z-20 flex flex-col items-center justify-center text-indigo-600 backdrop-blur-sm rounded-b-lg">
                    <Loader2 className="h-10 w-10 animate-spin mb-4" />
                    <p className="font-medium animate-pulse">Trí tuệ nhân tạo đang phân bổ cấu trúc truyện...</p>
                  </div>
                )}

                {/* TRẠNG THÁI 2: TRỐNG TRƠN (Chưa có chương nào) */}
                {!pacingLoading && chapters.length === 0 ? (
                  <div className="h-full min-h-[40vh] flex flex-col items-center justify-center text-slate-400 space-y-4">
                    <Layers className="h-16 w-16 text-slate-200" />
                    <p>Dự án chưa có khung chương nào.</p>
                    <div className="flex gap-4">
                      <Button variant="outline" onClick={() => addChapterAt(0)}>
                        + Tự viết chương đầu tiên
                      </Button>
                      <Button onClick={generatePacing} className="bg-indigo-600 hover:bg-indigo-700">
                        <Wand2 className="mr-2 h-4 w-4" /> Nhờ AI chẻ chương
                      </Button>
                    </div>
                  </div>
                ) : (

                /* TRẠNG THÁI 3: HIỂN THỊ DANH SÁCH EDITOR */
                <div className="space-y-6 pb-10">

                  {/* ====== TÓM TẮT MẠCH TRUYỆN (MINIMAP) ====== */}
                  {chapters.length > 0 && (
                    <div className="mb-8 p-5 bg-white border border-slate-200 rounded-xl shadow-sm">
                      <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center uppercase tracking-wider">
                        <Map className="w-4 h-4 mr-2 text-indigo-500"/> Toàn cảnh mạch truyện
                      </h3>
                      <div className="flex gap-3 overflow-x-auto pb-3 pt-1 px-1 scrollbar-thin scrollbar-thumb-slate-300">
                        {chapters.map((c, i) => (
                          <div key={c.id || c.temp_id} className="min-w-[220px] max-w-[220px] border border-slate-150 rounded-lg p-3 bg-slate-50 flex-shrink-0 hover:border-indigo-300 transition-colors cursor-default relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-400 opacity-70"></div>
                            <p className="text-[10px] font-black text-indigo-600 mb-1">CHƯƠNG {c.chapter_number}</p>
                            <p className="font-bold text-sm text-slate-800 line-clamp-1">{c.title || "Chưa có tên"}</p>
                            <p className="text-xs text-slate-500 mt-1 truncate">{c.pov_character}</p>
                            <Badge variant="outline" className="mt-2 text-[9px] bg-white text-slate-600 border-slate-200">
                              {c.primary_function ? c.primary_function.split('(')[0].trim() : "Chưa phân loại"}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Nút thêm chương ở đỉnh */}
                  <div className="flex justify-center gap-3 -mb-2">
                      <Button variant="outline" size="sm" className="rounded-full h-8 px-4 mb-6 text-xs text-slate-600 hover:bg-slate-100 shadow-sm" onClick={() => addChapterAt(0)}>
                        + Chèn thủ công
                      </Button>
                      <Button variant="default" size="sm" className="rounded-full h-8 px-4 mb-6 text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 shadow-sm" onClick={() => openAiChapModal("insert", 0)}>
                        <Sparkles className="w-3 h-3 mr-1" /> AI Chèn Mở Đầu
                      </Button>
                  </div>

                  {chapters.map((chap, idx) => (
                    <div key={chap.id || chap.temp_id}  className="relative">
                      
                      {/* THE CARD */}
                      <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm flex flex-col gap-4 hover:border-indigo-300 transition-colors group">
                        
                        {/* THANH CÔNG CỤ HOVER (Nằm góc trên phải) */}
                        <div className="absolute -top-3 -right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <Button variant="secondary" size="sm" className="h-8 rounded-full shadow-md bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50" onClick={() => openAiChapModal("edit", idx)}>
                            <Sparkles className="h-3 w-3 mr-1" /> AI Sửa
                          </Button>
                          <Button variant="destructive" size="icon" className="h-8 w-8 rounded-full shadow-md" onClick={() => removeChapter(idx)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* HEADER CHƯƠNG */}
                        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                          <div className="flex items-end gap-3">
                            <div className="font-black text-slate-800 text-xl whitespace-nowrap bg-slate-100 px-3 py-1 rounded-md">
                              Chương {chap.chapter_number}
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-slate-400 uppercase tracking-widest ml-1">Tiêu đề</Label>
                              <Input 
                                className="h-9 font-bold text-slate-700 w-[200px] sm:w-[250px] border-slate-200 focus-visible:ring-indigo-500" 
                                value={chap.title || ""} 
                                onChange={(e) => updateChapterField(idx, "title", e.target.value)}
                                placeholder="Nhập tiêu đề..."
                              />
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3 w-full md:w-auto bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <div className="space-y-1">
                              <Label className="text-[10px] text-amber-600 uppercase tracking-widest ml-1">Mốc thời gian</Label>
                              <Input 
                                className="h-8 text-xs font-semibold text-amber-800 bg-amber-50/50 border-amber-200 w-[130px]" 
                                value={chap.timeline_period || ""} 
                                onChange={(e) => updateChapterField(idx, "timeline_period", e.target.value)}
                                placeholder="Ví dụ: Hiện tại"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] text-indigo-600 uppercase tracking-widest ml-1">Góc nhìn (POV)</Label>
                              <Input 
                                className="h-8 text-xs font-semibold text-indigo-800 bg-indigo-50/50 border-indigo-200 w-[130px]" 
                                value={Array.isArray(chap.pov_character) ? chap.pov_character.join(", ") : chap.pov_character || ""} 
                                onChange={(e) => updateChapterField(idx, "pov_character", e.target.value)}
                                placeholder="Nhân vật..."
                              />
                            </div>
                          </div>
                        </div>
                        
                        <Separator className="bg-slate-100" />

                        {/* NỘI DUNG CHƯƠNG */}
                        <div className="flex flex-col gap-5">
                          <div className="space-y-2 w-full md:w-[350px]">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">🎯 Chức năng (Primary Function)</Label>
                            <Select value={chap.primary_function || ""} onValueChange={(v) => updateChapterField(idx, "primary_function", v)}>
                              <SelectTrigger className="h-10 bg-slate-50 border-slate-200 focus:ring-indigo-500 font-medium text-slate-700"><SelectValue placeholder="Chọn chức năng..." /></SelectTrigger>
                              <SelectContent className="max-h-[350px] min-w-[300px]">
                                {PRIMARY_FUNCTIONS.map((func) => <SelectItem key={func} value={func} className="py-2.5">{func}</SelectItem>)}
                                {chap.primary_function && !PRIMARY_FUNCTIONS.includes(chap.primary_function) && (
                                  <SelectItem value={chap.primary_function} className="italic text-amber-600 py-2.5">{chap.primary_function} (Cũ)</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">🎬 Sự kiện chính (Main Event)</Label>
                            <Textarea className="resize-y min-h-[90px] text-sm leading-relaxed bg-white" value={chap.main_event || ""} onChange={(e) => updateChapterField(idx, "main_event", e.target.value)} placeholder="Mô tả sự kiện cụ thể diễn ra..." />
                          </div>

                          {/* ACCORDION THÔNG TIN MỞ RỘNG (4 TRƯỜNG MỚI) */}
                          <Accordion multiple={false} className="w-full border rounded-lg bg-slate-50">
                            <AccordionItem value="advanced" className="border-none">
                              <AccordionTrigger className="px-4 py-3 text-xs font-semibold text-slate-600 hover:no-underline hover:text-indigo-600">
                                Hiển thị Cấu trúc Mở rộng (Cảm xúc, Hook, Ghi chú...)
                              </AccordionTrigger>
                              <AccordionContent className="px-4 pb-4 pt-2">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase text-indigo-500 font-bold">Biến chuyển Cảm xúc</Label>
                                    <Textarea className="text-xs min-h-[60px]" value={chap.emotional_beat || ""} onChange={(e) => updateChapterField(idx, "emotional_beat", e.target.value)} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase text-pink-500 font-bold">Biến chuyển Quan hệ</Label>
                                    <Textarea className="text-xs min-h-[60px]" value={chap.relationship_beat || ""} onChange={(e) => updateChapterField(idx, "relationship_beat", e.target.value)} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase text-amber-500 font-bold">Điểm neo (Chapter Hook)</Label>
                                    <Textarea className="text-xs min-h-[60px]" value={chap.chapter_hook || ""} onChange={(e) => updateChapterField(idx, "chapter_hook", e.target.value)} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] uppercase text-slate-500 font-bold">Lưu ý cho chương sau</Label>
                                    <Textarea className="text-xs min-h-[60px]" value={chap.continuity_note || ""} onChange={(e) => updateChapterField(idx, "continuity_note", e.target.value)} />
                                  </div>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      </div>

                      {/* Nút thêm chương chèn ở giữa */}
                      <div className="flex justify-center gap-3 -mb-3 mt-5 opacity-0 hover:opacity-100 transition-opacity">
                          <Button variant="outline" size="sm" className="rounded-full h-8 px-4 text-xs font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 shadow-sm z-10 relative" onClick={() => addChapterAt(idx + 1)}>
                            + Chèn thủ công
                          </Button>
                          <Button variant="default" size="sm" className="rounded-full h-8 px-4 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 shadow-sm z-10 relative" onClick={() => openAiChapModal("insert", idx + 1)}>
                            <Sparkles className="w-3 h-3 mr-1" /> AI Chèn Vào Đây
                          </Button>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

      </div>

      {/* THANH CÔNG CỤ FLOATING KHI CÓ THAY ĐỔI CHƯA LƯU */}
      {(isBibleDirty || isPacingDirty) && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-5">
          <div className="bg-slate-900 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-4">
            
            {/* Hiển thị thông báo theo loại dữ liệu đang sửa */}
            <span className="font-medium">
              {isBibleDirty && isPacingDirty ? "Bạn đang sửa cả Bible và Pacing!" :
               isBibleDirty ? "Story Bible có thay đổi chưa lưu!" : 
               "Khung chương (Pacing) có thay đổi chưa lưu!"}
            </span>
            
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                <X className="h-4 w-4 mr-1" /> Hủy bỏ
              </Button>

              {/* Nút lưu Bible */}
              {isBibleDirty && (
                <Button size="sm" className="bg-blue-500 hover:bg-blue-600 text-white" onClick={() => handleSaveBible()} disabled={isSavingBibleChanges}>
                  {isSavingBibleChanges ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Lưu Bible
                </Button>
              )}

              {/* Nút lưu Pacing */}
              {isPacingDirty && (
                <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={handleSavePacing} disabled={isSavingPacingChanges}>
                  {isSavingPacingChanges ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                  Lưu Pacing
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={Boolean(bibleFieldEdit)}
        onOpenChange={(open) => {
          if (!open && !isGeneratingBibleFieldEdit) setBibleFieldEdit(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[680px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-indigo-600" />
              Chỉnh sửa: {bibleFieldEdit?.label}
            </DialogTitle>
            <DialogDescription>
              Chọn cách chỉnh sửa field trong Story Bible. Các thay đổi chỉ nằm trong bản nháp đến khi bạn lưu Bible.
            </DialogDescription>
          </DialogHeader>

          {bibleFieldEditStep === "choose" && (
            <div className="grid gap-3 py-3 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-auto min-h-28 flex-col items-start gap-2 whitespace-normal p-4 text-left"
                onClick={() => {
                  setManualBibleFieldValue(formatBibleFieldValue(bibleFieldEdit?.value));
                  setAiBibleFieldError(null);
                  setBibleFieldEditStep("manual");
                }}
              >
                <span className="font-semibold">Chỉnh sửa thủ công</span>
                <span className="text-xs font-normal text-slate-500">
                  Tự nhập giá trị cho field đang chọn.
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto min-h-28 flex-col items-start gap-2 whitespace-normal border-indigo-200 p-4 text-left hover:bg-indigo-50"
                onClick={() => {
                  setAiBibleFieldError(null);
                  setBibleFieldEditStep("ai");
                }}
              >
                <span className="font-semibold text-indigo-700">
                  <Wand2 className="mr-1 inline h-4 w-4" /> Chỉnh sửa tự động nhờ AI
                </span>
                <span className="text-xs font-normal text-slate-500">
                  AI đề xuất giá trị mới và nhắc các field liên quan cần đồng bộ.
                </span>
              </Button>
            </div>
          )}

          {bibleFieldEditStep === "manual" && bibleFieldEdit && (
            <div className="space-y-3 py-2">
              <Label htmlFor="manual-bible-field-value">Giá trị mới</Label>
              {bibleFieldEdit.fieldType === "boolean" ? (
                <Select value={manualBibleFieldValue} onValueChange={(value) => setManualBibleFieldValue(value ?? "false")}>
                  <SelectTrigger id="manual-bible-field-value" className="w-full">
                    <SelectValue placeholder="Chọn giá trị" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Có</SelectItem>
                    <SelectItem value="false">Không</SelectItem>
                  </SelectContent>
                </Select>
              ) : bibleFieldEdit.fieldType === "number" ? (
                <Input
                  id="manual-bible-field-value"
                  type="number"
                  value={manualBibleFieldValue}
                  onChange={(event) => setManualBibleFieldValue(event.target.value)}
                />
              ) : bibleFieldEdit.editorType === "text" && bibleFieldEdit.fieldType === "string" ? (
                <Input
                  id="manual-bible-field-value"
                  value={manualBibleFieldValue}
                  onChange={(event) => setManualBibleFieldValue(event.target.value)}
                />
              ) : (
                <Textarea
                  id="manual-bible-field-value"
                  rows={bibleFieldEdit.editorType === "array" ? 6 : 4}
                  value={manualBibleFieldValue}
                  onChange={(event) => setManualBibleFieldValue(event.target.value)}
                  placeholder={bibleFieldEdit.fieldType === "string_array" ? "Mỗi dòng là một mục" : undefined}
                />
              )}
              {bibleFieldEdit.fieldType === "string_array" && (
                <p className="text-xs text-slate-500">Mỗi dòng sẽ trở thành một mục trong danh sách.</p>
              )}
              {aiBibleFieldError && <p role="alert" className="text-sm text-red-600">{aiBibleFieldError}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setBibleFieldEditStep("choose")}>Quay lại</Button>
                <Button onClick={applyManualBibleFieldEdit}>Áp dụng vào bản nháp</Button>
              </DialogFooter>
            </div>
          )}

          {bibleFieldEditStep === "ai" && (
            <div className="space-y-3 py-2">
              <Label htmlFor="ai-bible-field-prompt">Bạn muốn thay đổi field này như thế nào?</Label>
              <Textarea
                id="ai-bible-field-prompt"
                rows={5}
                value={aiBibleFieldPrompt}
                onChange={(event) => setAiBibleFieldPrompt(event.target.value)}
                placeholder="Mô tả thay đổi mong muốn và những điều cần giữ nguyên..."
                disabled={isGeneratingBibleFieldEdit}
              />
              {aiBibleFieldError && <p role="alert" className="text-sm text-red-600">{aiBibleFieldError}</p>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setBibleFieldEditStep("choose")} disabled={isGeneratingBibleFieldEdit}>
                  Quay lại
                </Button>
                <Button onClick={generateBibleFieldProposal} disabled={isGeneratingBibleFieldEdit || !aiBibleFieldPrompt.trim()}>
                  {isGeneratingBibleFieldEdit
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    : <Wand2 className="mr-2 h-4 w-4" />}
                  Tạo đề xuất
                </Button>
              </DialogFooter>
            </div>
          )}

          {bibleFieldEditStep === "review" && bibleFieldEdit && bibleFieldProposal && (
            <div className="space-y-4 py-2">
              <p className="text-sm font-medium text-slate-800">Field được chọn</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border bg-slate-50 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Hiện tại</p>
                  <p className="whitespace-pre-wrap text-sm">{formatBibleFieldValue(bibleFieldEdit.value) || "(trống)"}</p>
                </div>
                <div className="rounded-md border border-indigo-200 bg-indigo-50/50 p-3">
                  <p className="mb-1 text-xs font-semibold uppercase text-indigo-700">Đề xuất</p>
                  <p className="whitespace-pre-wrap text-sm">{formatBibleFieldValue(bibleFieldProposal.field_value) || "(trống)"}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <p className="font-medium text-slate-800">Field liên quan có thể bị ảnh hưởng</p>
                  <p className="text-xs text-slate-500">Bỏ chọn các thay đổi bạn không muốn áp dụng.</p>
                </div>
                {bibleFieldProposal.related_changes.length === 0 ? (
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                    AI không đề xuất thay đổi field liên quan nào.
                  </p>
                ) : (
                  bibleFieldProposal.related_changes.map((change) => {
                    const changeKey = JSON.stringify(change.path);
                    const checked = selectedBibleRelatedChanges.includes(changeKey);
                    return (
                      <label key={changeKey} className="flex cursor-pointer gap-3 rounded-md border p-3 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 shrink-0"
                          checked={checked}
                          onChange={(event) => setSelectedBibleRelatedChanges((previous) =>
                            event.target.checked
                              ? [...previous, changeKey]
                              : previous.filter((path) => path !== changeKey)
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{change.label}</span>
                          <span className="mt-1 block text-xs text-slate-500">{change.reason}</span>
                          <span className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                            <span className="whitespace-pre-wrap text-slate-500">
                              Hiện tại: {formatBibleFieldValue(getDeep(bibleData, change.path)) || "(trống)"}
                            </span>
                            <span className="whitespace-pre-wrap font-medium text-indigo-700">
                              Đề xuất: {formatBibleFieldValue(change.value) || "(trống)"}
                            </span>
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setBibleFieldEditStep("ai")}>Quay lại</Button>
                <Button onClick={applyBibleFieldProposal}>
                  <Check className="mr-2 h-4 w-4" /> Áp dụng đề xuất đã chọn
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL AI SINH NHÂN VẬT */}
      <Dialog open={isAiCharModalOpen} onOpenChange={setIsAiCharModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>AI Sinh Nhân Vật Mới</DialogTitle>
            <DialogDescription>
              Hãy miêu tả sơ bộ về nhân vật bạn muốn thêm (vai trò, tính cách...). AI sẽ tự động điền 20 trường thông tin phù hợp với cốt truyện.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Textarea 
              placeholder="VD: Một ông chủ quán cà phê trầm tính, từng trải, luôn cho nam chính những lời khuyên hữu ích..."
              value={aiCharPrompt}
              onChange={(e) => setAiCharPrompt(e.target.value)}
              className="resize-none h-32"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiCharModalOpen(false)}>Hủy</Button>
            <Button onClick={generateAiCharacter} disabled={isGeneratingChar || !aiCharPrompt} className="bg-indigo-600 hover:bg-indigo-700">
              {isGeneratingChar ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Wand2 className="h-4 w-4 mr-2"/>}
              Tạo Nhân Vật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL AI SINH MỐI QUAN HỆ */}
      <Dialog open={isAiRelModalOpen} onOpenChange={setIsAiRelModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>AI Sinh Mối Quan Hệ</DialogTitle>
            <DialogDescription>
              Chọn cách tạo: mô tả quan hệ mong muốn hoặc để AI suy luận từ hồ sơ hai nhân vật và Story Bible.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 rounded-md border bg-slate-100 p-1" aria-label="Chế độ tạo mối quan hệ">
              <Button
                type="button"
                size="sm"
                variant={aiRelMode === "manual" ? "default" : "ghost"}
                onClick={() => setAiRelMode("manual")}
              >
                Mô tả quan hệ
              </Button>
              <Button
                type="button"
                size="sm"
                variant={aiRelMode === "automatic" ? "default" : "ghost"}
                onClick={() => setAiRelMode("automatic")}
              >
                Tự động
              </Button>
            </div>

            {aiRelMode === "manual" ? (
              <Textarea
                placeholder="VD: Quan hệ giữa Minh và ông chủ quán. Minh coi ông như người cha, nhưng ông chủ lại giấu một bí mật liên quan đến gia đình Minh..."
                value={aiRelPrompt}
                onChange={(e) => setAiRelPrompt(e.target.value)}
                className="resize-none h-32"
              />
            ) : (
              <div className="grid gap-4">
                {(bibleData?.characters || []).length < 2 ? (
                  <p className="text-sm text-amber-700">
                    Cần có ít nhất hai nhân vật trong Story Bible để tạo quan hệ tự động.
                  </p>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="relationship-character-a">Nhân vật A</Label>
                    <Select value={aiRelCharacterAIndex} onValueChange={(value) => setAiRelCharacterAIndex(value ?? "")}>
                      <SelectTrigger id="relationship-character-a" className="w-full">
                        <SelectValue placeholder="Chọn nhân vật">
                          {aiRelCharacterAIndex === ""
                            ? undefined
                            : bibleData?.characters?.[Number(aiRelCharacterAIndex)]?.name?.trim() || `Nhân vật ${Number(aiRelCharacterAIndex) + 1}`}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(bibleData?.characters || []).map((character: { name?: string }, index: number) => (
                          <SelectItem key={index} value={String(index)} disabled={String(index) === aiRelCharacterBIndex}>
                            {character.name?.trim() || `Nhân vật ${index + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="relationship-character-b">Nhân vật B</Label>
                    <Select value={aiRelCharacterBIndex} onValueChange={(value) => setAiRelCharacterBIndex(value ?? "")}>
                      <SelectTrigger id="relationship-character-b" className="w-full">
                        <SelectValue placeholder="Chọn nhân vật">
                          {aiRelCharacterBIndex === ""
                            ? undefined
                            : bibleData?.characters?.[Number(aiRelCharacterBIndex)]?.name?.trim() || `Nhân vật ${Number(aiRelCharacterBIndex) + 1}`}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {(bibleData?.characters || []).map((character: { name?: string }, index: number) => (
                          <SelectItem key={index} value={String(index)} disabled={String(index) === aiRelCharacterAIndex}>
                            {character.name?.trim() || `Nhân vật ${index + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <TextAreaField
                  label="Mô tả bổ sung cho nhân vật A (không bắt buộc)"
                  value={aiRelCharacterADescription}
                  onChange={setAiRelCharacterADescription}
                  rows={2}
                  placeholder="Góc nhìn hoặc thông tin chưa có trong hồ sơ..."
                />
                <TextAreaField
                  label="Mô tả bổ sung cho nhân vật B (không bắt buộc)"
                  value={aiRelCharacterBDescription}
                  onChange={setAiRelCharacterBDescription}
                  rows={2}
                  placeholder="Góc nhìn hoặc thông tin chưa có trong hồ sơ..."
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAiRelModalOpen(false)}>Hủy</Button>
            <Button
              onClick={generateAiRelationship}
              disabled={
                isGeneratingRel ||
                (aiRelMode === "manual" && !aiRelPrompt.trim()) ||
                (aiRelMode === "automatic" && (
                  !aiRelCharacterAIndex ||
                  !aiRelCharacterBIndex ||
                  aiRelCharacterAIndex === aiRelCharacterBIndex ||
                  (bibleData?.characters || []).length < 2
                ))
              }
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {isGeneratingRel ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Wand2 className="h-4 w-4 mr-2"/>}
              {aiRelMode === "manual" ? "Tạo từ mô tả" : "Sinh tự động"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL AI CHÈN/SỬA CHƯƠNG (2-STEP WIZARD) */}
      <Dialog open={isAiChapModalOpen} onOpenChange={setIsAiChapModalOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              {aiChapAction === "insert" 
                ? `AI Tạo Chương Mới (Vị trí ${targetChapIndex + 1})` 
                : `AI Sửa Chương ${targetChapIndex + 1}`}
            </DialogTitle>
          </DialogHeader>

          {aiChapStep === 1 ? (
            // BƯỚC 1: NHẬP Ý TƯỞNG
            <div className="grid gap-4 py-4">
              <p className="text-sm text-slate-500">
                Hãy viết một ý tưởng bất kỳ. Đừng lo về Logic, AI Script Doctor sẽ đánh giá và điều chỉnh giúp bạn.
              </p>
              <Textarea 
                placeholder="VD: Hai người đi du lịch, bị kẹt vì mưa bão, phải ngủ chung một phòng..."
                value={userOriginalPrompt}
                onChange={(e) => setUserOriginalPrompt(e.target.value)}
                className="resize-none h-32"
              />
              <div className="flex justify-end mt-2">
                <Button onClick={analyzeAiChapterIdea} disabled={isAnalyzing || !userOriginalPrompt} className="bg-indigo-600 hover:bg-indigo-700">
                  {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin mr-2"/> : <Activity className="h-4 w-4 mr-2"/>}
                  Phân Tích Khả Thi
                </Button>
              </div>
            </div>
          ) : (
            // BƯỚC 2: PHẢN BIỆN & CHỌN LỰA
            <div className="py-2 space-y-4">
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="bg-white text-amber-700 border-amber-300">Điểm Logic: {aiAnalysisData?.feasibility_score}</Badge>
                  <span className="font-bold text-sm text-amber-800">Góp ý từ Cố vấn AI:</span>
                </div>
                <p className="text-sm text-slate-700 italic">"{aiAnalysisData?.critique}"</p>
              </div>

              <div className="space-y-3 mt-4">
                <p className="text-sm font-semibold text-slate-800">Bạn muốn dùng phương án nào để sinh kịch bản?</p>
                
                {/* Lựa chọn 1: Dùng prompt xịn của AI */}
                <div className="border border-indigo-200 bg-indigo-50/30 p-3 rounded-lg hover:bg-indigo-50 cursor-pointer" onClick={() => generateFinalAiChapters(aiAnalysisData?.suggested_prompt)}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-indigo-700 uppercase">✨ Đề xuất của AI (Khuyên dùng)</span>
                  </div>
                  <p className="text-xs text-slate-600">{aiAnalysisData?.suggested_prompt}</p>
                </div>

                {/* Lựa chọn 2: Cố chấp dùng prompt gốc */}
                <div className="border border-slate-200 p-3 rounded-lg hover:bg-slate-50 cursor-pointer" onClick={() => generateFinalAiChapters(userOriginalPrompt)}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-slate-500 uppercase">Ý tưởng gốc của bạn</span>
                  </div>
                  <p className="text-xs text-slate-400">{userOriginalPrompt}</p>
                </div>
              </div>
              
              {isGeneratingAiChap && (
                <div className="flex items-center justify-center text-indigo-600 mt-4 text-sm font-medium">
                  <Loader2 className="h-4 w-4 animate-spin mr-2"/> Đang vung bút vẽ kịch bản...
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL ĐÁNH GIÁ PACING */}
      <Dialog open={isEvalModalOpen} onOpenChange={setIsEvalModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-amber-600"/> Báo cáo Đánh giá Cấu trúc (Pacing)</DialogTitle>
          </DialogHeader>
          
          {isEvaluating ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-500">
              <Loader2 className="h-10 w-10 animate-spin mb-4 text-amber-500" />
              <p className="animate-pulse">AI Script Doctor đang đọc và phân tích kịch bản...</p>
            </div>
          ) : evalData ? (
            <div className="space-y-6 py-4">
              <div className="flex items-center justify-between bg-amber-50 p-4 rounded-lg border border-amber-200">
                <div className="text-sm font-medium text-amber-800">{evalData.summary}</div>
                <div className="text-3xl font-black text-amber-600 ml-4">{evalData.overall_score}/10</div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-green-600">✅ Điểm sáng</h4>
                  <ul className="text-xs space-y-1 list-disc pl-4 text-slate-600">
                    {evalData.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-red-500">⚠️ Điểm yếu / Lỗ hổng</h4>
                  <ul className="text-xs space-y-1 list-disc pl-4 text-slate-600">
                    {evalData.weaknesses.map((w: string, i: number) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              </div>

              {evalData.suggestions.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-slate-800 border-b pb-2">Đề xuất sửa chữa</h4>
                  {evalData.suggestions.map((s: any, i: number) => (
                    <div key={i} className="bg-slate-50 p-3 rounded border text-sm">
                      <p className="font-bold text-indigo-600">{s.chapter}</p>
                      <p className="text-red-600 mt-1"><span className="font-semibold">Vấn đề:</span> {s.issue}</p>
                      <p className="text-green-700 mt-1"><span className="font-semibold">Cách sửa:</span> {s.fix}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      
    </div>
  );
}
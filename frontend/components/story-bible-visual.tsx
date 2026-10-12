"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import type { Connection, Edge, Node, NodeProps } from "@xyflow/react";
import { Network, Trash2, UserRound } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type StoryCharacter = {
  name?: string;
  age?: string | number;
  role_in_story?: string;
  relationship_to_protagonist?: string;
  appearance?: string;
  fear?: string;
  motivation?: string;
  emotional_need?: string;
  internal_conflict?: string;
  external_pressure?: string;
  habits?: string[];
  personality?: { strength?: string; flaw?: string; core_traits?: string[]; [key: string]: unknown };
  character_arc?: {
    starting_belief?: string;
    false_belief?: string;
    truth_they_learn?: string;
    ending_state?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type StoryRelationship = {
  between?: string[];
  current_relationship?: string;
  past_relationship?: string;
  relationship_arc?: string;
  bonding_mechanism?: string;
  source_of_tension?: string;
  unspoken_issue?: string;
  what_a_needs_from_b?: string;
  what_b_needs_from_a?: string;
  physical_intimacy_arc?: string;
  [key: string]: unknown;
};

type StoryBible = {
  characters?: StoryCharacter[];
  relationship_dynamics?: StoryRelationship[];
  story_identity?: Record<string, unknown>;
  world_building?: Record<string, unknown>;
  conflict_system?: Record<string, unknown>;
  narrative_rules?: Record<string, unknown>;
  story_continuity?: Record<string, unknown>;
  narrative_boundaries?: unknown;
  intimacy_guidance?: Record<string, unknown>;
  emotional_architecture?: Record<string, unknown>;
  [key: string]: unknown;
};

const EMPTY_CHARACTERS: StoryCharacter[] = [];
const EMPTY_RELATIONSHIPS: StoryRelationship[] = [];

type StoryBibleVisualProps = {
  bibleData: StoryBible;
  onChange: (path: (string | number)[], value: unknown) => void;
  selectedRelationshipIndex: number | null;
  onCreateRelationship: (sourceIndex: number, targetIndex: number) => void;
  onDeleteRelationship: (index: number) => void;
};

type StoryNodeData = {
  character: StoryCharacter;
  index: number;
};

type StoryEdgeData = {
  relationship: StoryRelationship;
  index: number;
};

type Selection = { kind: "character" | "relationship"; index: number } | null;

const CHARACTER_NODE_TYPES = { character: CharacterNode };
const KEY_LABELS: Record<string, string> = {
  applicable: "Có áp dụng",
  central_theme: "Chủ đề trung tâm",
  core_premise: "Tiền đề",
  emotional_promise: "Lời hứa cảm xúc",
  setting: "Bối cảnh",
  primary_setting: "Bối cảnh chính",
  past_setting: "Bối cảnh quá khứ",
  central_conflict: "Xung đột trung tâm",
  external_conflicts: "Xung đột bên ngoài",
  internal_conflicts: "Xung đột nội tâm",
  tone: "Tông giọng",
  pacing: "Nhịp độ",
  dialogue_style: "Phong cách hội thoại",
  original_seed_title: "Tựa đề gốc",
  original_vibe: "Vibe gốc",
  core_elements_that_must_not_change: "Yếu tố cốt lõi",
  narrative_boundaries: "Ranh giới trần thuật",
  comfort_level: "Mức độ thoải mái",
  depiction_style: "Phong cách miêu tả",
  starting_emotional_state: "Trạng thái ban đầu",
  midpoint_shift: "Bước ngoặt giữa truyện",
  major_emotional_turn: "Bước ngoặt cảm xúc lớn",
  resolution_emotion: "Cảm xúc kết thúc",
};

function humanizeKey(key: string) {
  return KEY_LABELS[key] || key.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function compactRelationshipLabel(value: string, maxLength = 34) {
  const normalized = value.replaceAll(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const shortened = normalized.slice(0, maxLength - 1);
  const wordBoundary = shortened.lastIndexOf(" ");
  const label = wordBoundary > maxLength / 2 ? shortened.slice(0, wordBoundary) : shortened;
  return `${label.trimEnd()}…`;
}

function CharacterNode({ data, selected }: NodeProps<Node<StoryNodeData>>) {
  const name = data.character.name?.trim() || `Nhân vật ${data.index + 1}`;
  const role = data.character.role_in_story?.trim();

  return (
    <div className="relative w-[190px]">
      <div
        className={`relative rounded-md border bg-white px-4 py-3 shadow-sm transition-colors ${
          selected ? "border-emerald-600 ring-2 ring-emerald-100" : "border-slate-300 hover:border-emerald-500"
        }`}
      >
        <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-emerald-600" />
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-emerald-50 text-emerald-800">
            <UserRound className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-900">{name}</span>
            <span className="mt-1 block truncate text-xs text-slate-500">
              {role || "Chưa có vai trò"}
            </span>
          </span>
        </div>
        <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-white !bg-emerald-600" />
      </div>
    </div>
  );
}

function SummaryValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return <span>{value ? "Có" : "Không"}</span>;
  if (typeof value === "string" || typeof value === "number") {
    return <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{String(value)}</p>;
  }
  if (Array.isArray(value)) {
    const visibleItems = value.filter((item) => item !== null && item !== undefined && item !== "");
    if (visibleItems.length === 0) return null;
    return (
      <ul className="space-y-1 text-xs leading-relaxed text-slate-600">
        {visibleItems.map((item, index) => (
          <li key={index} className="break-words">
            {typeof item === "object" && item !== null ? <SummaryValue value={item} /> : String(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, entryValue]) => {
      if (Array.isArray(entryValue)) return entryValue.length > 0;
      if (entryValue && typeof entryValue === "object") return Object.keys(entryValue).length > 0;
      return entryValue !== null && entryValue !== undefined && entryValue !== "";
    });
    if (entries.length === 0) return null;
    return (
      <div className="space-y-2">
        {entries.map(([key, entryValue]) => (
          <div key={key} className="space-y-0.5">
            <p className="text-[11px] font-medium text-slate-500">{humanizeKey(key)}</p>
            <SummaryValue value={entryValue} />
          </div>
        ))}
      </div>
    );
  }
  return null;
}

function TextEditor({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string | number | undefined;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const id = label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-slate-600">{label}</Label>
      {multiline ? (
        <Textarea id={id} value={value ?? ""} onChange={(event) => onChange(event.target.value)} rows={3} />
      ) : (
        <Input id={id} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  );
}

function StoryBibleInspector({
  bibleData,
  selection,
  onChange,
  onDeleteRelationship,
}: {
  bibleData: StoryBible;
  selection: Selection;
  onChange: StoryBibleVisualProps["onChange"];
  onDeleteRelationship: (index: number) => void;
}) {
  const characters = bibleData.characters || EMPTY_CHARACTERS;
  const relationships = bibleData.relationship_dynamics || EMPTY_RELATIONSHIPS;
  const selectedCharacter = selection?.kind === "character" ? characters[selection.index] : null;
  const selectedRelationship = selection?.kind === "relationship" ? relationships[selection.index] : null;

  const groups = [
    ["identity", "Nhận diện & Cốt lõi", bibleData?.story_identity],
    ["world", "Bối cảnh Thế giới", bibleData?.world_building],
    ["conflict", "Hệ thống Xung đột", bibleData?.conflict_system],
    ["narrative", "Quy tắc Trần thuật", bibleData?.narrative_rules],
    ["continuity", "Tính Liên tục & Ranh giới", {
      ...bibleData?.story_continuity,
      narrative_boundaries: bibleData?.narrative_boundaries,
    }],
    ["intimacy", "Hướng dẫn Thân mật", bibleData?.intimacy_guidance],
    ["relationships", "Mối quan hệ", relationships],
    ["emotion", "Kiến trúc Cảm xúc", bibleData?.emotional_architecture],
  ] as const;

  const updateCharacter = (path: string[], value: string | string[]) => {
    if (!selection || selection.kind !== "character") return;
    onChange(["characters", selection.index, ...path], value);
  };

  const updateRelationship = (path: (string | number)[], value: string) => {
    if (!selection || selection.kind !== "relationship") return;
    onChange(["relationship_dynamics", selection.index, ...path], value);
  };

  return (
    <aside className="flex min-h-[560px] min-w-0 flex-col border-t border-slate-200 bg-white lg:min-h-0 lg:border-l lg:border-t-0">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase text-slate-500">Thông tin Story Bible</p>
        {selectedCharacter ? (
          <h3 className="mt-1 truncate text-base font-semibold text-slate-900">
            {selectedCharacter.name || `Nhân vật ${selection!.index + 1}`}
          </h3>
        ) : selectedRelationship ? (
          <h3 className="mt-1 truncate text-base font-semibold text-slate-900">
            {(selectedRelationship.between || []).filter(Boolean).join(" × ") || "Quan hệ chưa đặt tên"}
          </h3>
        ) : (
          <h3 className="mt-1 text-base font-semibold text-slate-900">Chọn một nhân vật hoặc quan hệ</h3>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {selectedCharacter && (
          <div className="space-y-4">
            <div className="space-y-3">
              <TextEditor label="Tên nhân vật" value={selectedCharacter.name} onChange={(value) => updateCharacter(["name"], value)} />
              <div className="grid grid-cols-2 gap-3">
                <TextEditor label="Tuổi" value={selectedCharacter.age} onChange={(value) => updateCharacter(["age"], value)} />
                <TextEditor label="Vai trò" value={selectedCharacter.role_in_story} onChange={(value) => updateCharacter(["role_in_story"], value)} />
              </div>
              <TextEditor label="Quan hệ với nhân vật chính" value={selectedCharacter.relationship_to_protagonist} onChange={(value) => updateCharacter(["relationship_to_protagonist"], value)} />
              <TextEditor label="Ngoại hình" value={selectedCharacter.appearance} onChange={(value) => updateCharacter(["appearance"], value)} multiline />
            </div>

            <Accordion multiple={true} className="border-t border-slate-200">
              <AccordionItem value="character-drive">
                <AccordionTrigger className="text-xs font-semibold">Động lực & xung đột</AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <TextEditor label="Động lực" value={selectedCharacter.motivation} onChange={(value) => updateCharacter(["motivation"], value)} multiline />
                  <TextEditor label="Nỗi sợ" value={selectedCharacter.fear} onChange={(value) => updateCharacter(["fear"], value)} multiline />
                  <TextEditor label="Nhu cầu cảm xúc" value={selectedCharacter.emotional_need} onChange={(value) => updateCharacter(["emotional_need"], value)} multiline />
                  <TextEditor label="Xung đột nội tâm" value={selectedCharacter.internal_conflict} onChange={(value) => updateCharacter(["internal_conflict"], value)} multiline />
                  <TextEditor label="Áp lực bên ngoài" value={selectedCharacter.external_pressure} onChange={(value) => updateCharacter(["external_pressure"], value)} multiline />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="character-arc">
                <AccordionTrigger className="text-xs font-semibold">Hành trình nhân vật</AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <TextEditor label="Niềm tin ban đầu" value={selectedCharacter.character_arc?.starting_belief} onChange={(value) => updateCharacter(["character_arc", "starting_belief"], value)} multiline />
                  <TextEditor label="Niềm tin sai lệch" value={selectedCharacter.character_arc?.false_belief} onChange={(value) => updateCharacter(["character_arc", "false_belief"], value)} multiline />
                  <TextEditor label="Sự thật nhận ra" value={selectedCharacter.character_arc?.truth_they_learn} onChange={(value) => updateCharacter(["character_arc", "truth_they_learn"], value)} multiline />
                  <TextEditor label="Trạng thái kết thúc" value={selectedCharacter.character_arc?.ending_state} onChange={(value) => updateCharacter(["character_arc", "ending_state"], value)} multiline />
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="character-personality">
                <AccordionTrigger className="text-xs font-semibold">Tính cách</AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <TextEditor label="Điểm mạnh" value={selectedCharacter.personality?.strength} onChange={(value) => updateCharacter(["personality", "strength"], value)} />
                  <TextEditor label="Khuyết điểm" value={selectedCharacter.personality?.flaw} onChange={(value) => updateCharacter(["personality", "flaw"], value)} />
                  <TextEditor label="Thói quen (mỗi dòng một mục)" value={Array.isArray(selectedCharacter.habits) ? selectedCharacter.habits.join("\n") : ""} onChange={(value) => updateCharacter(["habits"], value.split("\n"))} multiline />
                  <TextEditor label="Đặc điểm cốt lõi (mỗi dòng một mục)" value={Array.isArray(selectedCharacter.personality?.core_traits) ? selectedCharacter.personality.core_traits.join("\n") : ""} onChange={(value) => updateCharacter(["personality", "core_traits"], value.split("\n"))} multiline />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        )}

        {selectedRelationship && (
          <div className="space-y-3">
            {[0, 1].map((endpointIndex) => (
              <div key={endpointIndex} className="space-y-1.5">
                <Label className="text-xs text-slate-600">Nhân vật {endpointIndex === 0 ? "A" : "B"}</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={selectedRelationship.between?.[endpointIndex] || ""}
                  onChange={(event) => updateRelationship(["between", endpointIndex], event.target.value)}
                >
                  <option value="">Chọn nhân vật</option>
                  {characters.map((character, index) => (
                    <option key={index} value={character.name || ""} disabled={!character.name}>
                      {character.name || `Nhân vật ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <TextEditor label="Quan hệ hiện tại" value={selectedRelationship.current_relationship} onChange={(value) => updateRelationship(["current_relationship"], value)} />
            <TextEditor label="Quan hệ quá khứ" value={selectedRelationship.past_relationship} onChange={(value) => updateRelationship(["past_relationship"], value)} />
            <TextEditor label="Hành trình quan hệ" value={selectedRelationship.relationship_arc} onChange={(value) => updateRelationship(["relationship_arc"], value)} multiline />
            <TextEditor label="Cơ chế gắn kết" value={selectedRelationship.bonding_mechanism} onChange={(value) => updateRelationship(["bonding_mechanism"], value)} multiline />
            <TextEditor label="Nguồn căng thẳng" value={selectedRelationship.source_of_tension} onChange={(value) => updateRelationship(["source_of_tension"], value)} multiline />
            <TextEditor label="Vấn đề chưa nói ra" value={selectedRelationship.unspoken_issue} onChange={(value) => updateRelationship(["unspoken_issue"], value)} multiline />
            <TextEditor label="A cần gì từ B" value={selectedRelationship.what_a_needs_from_b} onChange={(value) => updateRelationship(["what_a_needs_from_b"], value)} multiline />
            <TextEditor label="B cần gì từ A" value={selectedRelationship.what_b_needs_from_a} onChange={(value) => updateRelationship(["what_b_needs_from_a"], value)} multiline />
            <TextEditor label="Hành trình thân mật" value={selectedRelationship.physical_intimacy_arc} onChange={(value) => updateRelationship(["physical_intimacy_arc"], value)} multiline />
            <Button variant="outline" className="w-full text-red-700 hover:bg-red-50 hover:text-red-800" onClick={() => onDeleteRelationship(selection!.index)}>
              <Trash2 className="mr-2 h-4 w-4" /> Xóa quan hệ
            </Button>
          </div>
        )}

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase text-slate-500">Các lớp DNA khác</p>
          <Accordion multiple={true} className="border-t border-slate-200">
            {groups.map(([value, title, content]) => (
              <AccordionItem key={value} value={value}>
                <AccordionTrigger className="text-xs font-semibold">{title}</AccordionTrigger>
                <AccordionContent className="pt-2">
                  {content && typeof content === "object" && Object.keys(content).length > 0 ? (
                    <SummaryValue value={content} />
                  ) : (
                    <p className="text-xs text-slate-400">Chưa có thông tin.</p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </aside>
  );
}

export default function StoryBibleVisual({
  bibleData,
  onChange,
  selectedRelationshipIndex,
  onCreateRelationship,
  onDeleteRelationship,
}: StoryBibleVisualProps) {
  const characters = bibleData.characters || EMPTY_CHARACTERS;
  const relationships = bibleData.relationship_dynamics || EMPTY_RELATIONSHIPS;
  const [selection, setSelection] = useState<Selection>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<StoryNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<StoryEdgeData>>([]);

  useEffect(() => {
    if (selectedRelationshipIndex !== null) {
      setSelection({ kind: "relationship", index: selectedRelationshipIndex });
    }
  }, [selectedRelationshipIndex]);

  const resolution = useMemo(() => {
    const indexesByName = new Map<string, number[]>();
    characters.forEach((character, index) => {
      const normalizedName = typeof character.name === "string" ? character.name.trim().toLocaleLowerCase() : "";
      if (!normalizedName) return;
      indexesByName.set(normalizedName, [...(indexesByName.get(normalizedName) || []), index]);
    });
    return indexesByName;
  }, [characters]);

  useEffect(() => {
    setNodes((previousNodes) => {
      const oldPositions = new Map(previousNodes.map((node) => [node.id, node.position]));
      const count = characters.length;
      const radius = Math.min(280, Math.max(95, 72 * count));
      return characters.map((character, index) => {
        const id = `character-${index}`;
        const angle = (2 * Math.PI * index) / Math.max(1, count) - Math.PI / 2;
        return {
          id,
          type: "character",
          position: oldPositions.get(id) || {
            x: 330 + Math.cos(angle) * radius,
            y: 270 + Math.sin(angle) * radius,
          },
          data: { character, index },
          selected: selection?.kind === "character" && selection.index === index,
        };
      });
    });
  }, [characters, selection, setNodes]);

  useEffect(() => {
    const nextEdges: Edge<StoryEdgeData>[] = [];
    relationships.forEach((relationship, index) => {
      const between = Array.isArray(relationship?.between) ? relationship.between : [];
      const names = between.slice(0, 2).map((name) => typeof name === "string" ? name.trim().toLocaleLowerCase() : "");
      const sourceIndexes = resolution.get(names[0]) || [];
      const targetIndexes = resolution.get(names[1]) || [];
      if (sourceIndexes.length !== 1 || targetIndexes.length !== 1 || sourceIndexes[0] === targetIndexes[0]) return;
      const fullLabel = relationship.current_relationship?.trim() || relationship.past_relationship?.trim() || "Quan hệ";

      nextEdges.push({
        id: `relationship-${index}`,
        source: `character-${sourceIndexes[0]}`,
        target: `character-${targetIndexes[0]}`,
        type: "smoothstep",
        label: compactRelationshipLabel(fullLabel),
        labelStyle: { fill: "#475569", fontSize: 11, fontWeight: 500 },
        labelBgStyle: { fill: "#ffffff", fillOpacity: 0.96 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#718096" },
        style: { stroke: "#718096", strokeWidth: 1.5 },
        data: { relationship, index },
        selected: selection?.kind === "relationship" && selection.index === index,
      });
    });
    setEdges(nextEdges);
  }, [relationships, resolution, selection, setEdges]);

  const unresolvedRelationships = relationships
    .map((relationship, index) => ({ relationship, index }))
    .filter(({ relationship }) => {
      const between = Array.isArray(relationship?.between) ? relationship.between : [];
      const names = between.slice(0, 2).map((name) => typeof name === "string" ? name.trim().toLocaleLowerCase() : "");
      const sourceIndexes = resolution.get(names[0]) || [];
      const targetIndexes = resolution.get(names[1]) || [];
      return sourceIndexes.length !== 1 || targetIndexes.length !== 1 || sourceIndexes[0] === targetIndexes[0];
    });

  const handleConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const sourceIndex = Number(connection.source.replace("character-", ""));
    const targetIndex = Number(connection.target.replace("character-", ""));
    if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex)) return;
    setSelection(null);
    onCreateRelationship(sourceIndex, targetIndex);
  };

  const selectRelationship = (edge: Edge<StoryEdgeData>) => {
    const index = edge.data?.index;
    if (typeof index === "number") setSelection({ kind: "relationship", index });
  };

  const deleteRelationship = (index: number) => {
    if (!window.confirm("Bạn có chắc muốn xóa mối quan hệ này không?")) return;
    setSelection(null);
    onDeleteRelationship(index);
  };

  return (
    <div className="grid min-w-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_350px]">
      <section className="min-w-0 bg-[#f7f8f6] p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Mạng lưới nhân vật</h3>
            <p className="text-xs text-slate-500">{characters.length} nhân vật · {relationships.length} mối quan hệ</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Network className="h-4 w-4 text-emerald-700" />
            Kéo nối hai nút để mở AI tạo quan hệ
          </div>
        </div>

        {characters.length > 0 ? (
          <div className="h-[520px] min-w-0 overflow-hidden rounded-md border border-slate-200 bg-white sm:h-[640px]">
            <ReactFlow<Node<StoryNodeData>, Edge<StoryEdgeData>>
              nodes={nodes}
              edges={edges}
              nodeTypes={CHARACTER_NODE_TYPES}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={handleConnect}
              onNodeClick={(_, node) => setSelection({ kind: "character", index: node.data.index })}
              onEdgeClick={(_, edge) => selectRelationship(edge)}
              onPaneClick={() => setSelection(null)}
              fitView
              fitViewOptions={{ padding: 0.24 }}
              minZoom={0.3}
              maxZoom={1.5}
              deleteKeyCode={null}
              nodesDraggable
              nodesConnectable
              elementsSelectable
            >
              <Background color="#d8ded9" gap={22} size={1} variant={BackgroundVariant.Dots} />
              <Controls position="bottom-left" showInteractive={false} />
            </ReactFlow>
          </div>
        ) : (
          <div className="flex h-[520px] flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-white px-6 text-center sm:h-[640px]">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-emerald-50 text-emerald-800">
              <UserRound className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-sm font-semibold text-slate-800">Chưa có nhân vật để hiển thị</h3>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">Thêm nhân vật trong chế độ Chỉnh sửa, sau đó quay lại đây để kết nối các mối quan hệ.</p>
          </div>
        )}

        {unresolvedRelationships.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-900">Quan hệ chưa thể nối trên graph</p>
            <p className="mt-1 text-xs text-amber-800">Kiểm tra tên nhân vật bị thiếu, trùng hoặc chưa có trong hồ sơ.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {unresolvedRelationships.map(({ relationship, index }) => (
                <Button
                  key={index}
                  size="sm"
                  variant="outline"
                  className="h-7 max-w-full border-amber-300 bg-white text-xs text-amber-900"
                  onClick={() => setSelection({ kind: "relationship", index })}
                >
                  {(relationship.between || []).filter(Boolean).join(" × ") || `Quan hệ ${index + 1}`}
                </Button>
              ))}
            </div>
          </div>
        )}
      </section>

      <StoryBibleInspector
        bibleData={bibleData}
        selection={selection}
        onChange={onChange}
        onDeleteRelationship={deleteRelationship}
      />
    </div>
  );
}
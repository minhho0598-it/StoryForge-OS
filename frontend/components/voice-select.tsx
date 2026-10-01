"use client";

import { useEffect, useState } from "react";
import { apiClient, ApiError } from "@/lib/api-client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type VoiceOption = {
  id: string;
  label: string;
};

type VoiceSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
};

export function VoiceSelect({ value, onValueChange, className }: VoiceSelectProps) {
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;

    apiClient
      .get<VoiceOption[]>("/api/voices")
      .then((response) => {
        if (active) setVoices(response.data);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof ApiError ? err.message : "Không tải được danh sách giọng đọc.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [retryCount]);

  const selectedVoiceAvailable = voices.some((voice) => voice.id === value);

  return (
    <div className="space-y-1.5">
      <Select
        value={value}
        onValueChange={(selectedValue) => {
          if (selectedValue !== null) onValueChange(selectedValue);
        }}
        disabled={loading || voices.length === 0}
      >
        <SelectTrigger className={className}>
          <SelectValue placeholder={loading ? "Đang tải danh sách giọng..." : "Chọn giọng đọc"} />
        </SelectTrigger>
        <SelectContent className="max-h-[min(70vh,var(--available-height))] min-w-[min(24rem,calc(100vw-2rem))]">
          {value && !selectedVoiceAvailable && <SelectItem value={value}>{value} (đã lưu)</SelectItem>}
          {voices.map((voice) => (
            <SelectItem key={voice.id} value={voice.id}>
              {voice.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <div className="flex items-center gap-2 text-xs text-red-600">
          <span>{error}</span>
          <button
            type="button"
            className="shrink-0 underline underline-offset-2"
            onClick={() => {
              setError(null);
              setLoading(true);
              setRetryCount((count) => count + 1);
            }}
          >
            Thử lại
          </button>
        </div>
      ) : !loading && voices.length === 0 ? (
        <p className="text-xs text-slate-500">API chưa có giọng đọc nào.</p>
      ) : null}
    </div>
  );
}
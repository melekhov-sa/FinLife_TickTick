"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Clock, ListChecks, AlignLeft, RotateCcw } from "lucide-react";
import { clsx } from "clsx";
import { SidePanel } from "@/components/primitives/SidePanel";
import { TimeInput } from "@/components/primitives/TimeInput";
import { EventTaskTemplates } from "./EventTaskTemplates";
import { useUpdateEventTemplate } from "@/hooks/useEvents";
import type { CompletionMode } from "@/types/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EventTemplate {
  event_id: number;
  title: string;
  description: string | null;
  category_emoji: string | null;
  category_title: string | null;
  completion_mode: CompletionMode;
  default_start_time: string | null;
  default_end_time: string | null;
  freq_label: string;
  freq: string | null;
  by_weekday: string | null;
}

const WEEKDAY_LABELS: Record<string, string> = {
  MO: "Пн", TU: "Вт", WE: "Ср", TH: "Чт", FR: "Пт", SA: "Сб", SU: "Вс",
};
const WEEKDAY_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

interface Props {
  template: EventTemplate;
  onClose: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COMPLETION_MODE_LABELS: Record<CompletionMode, string> = {
  end_of_day: "Конец дня",
  at_event_end: "После окончания",
  manual: "Вручную",
};

const COMPLETION_MODE_OPTIONS: { value: CompletionMode; label: string; description: string }[] = [
  { value: "end_of_day", label: "Конец дня", description: "Событие считается выполненным в конце дня" },
  { value: "at_event_end", label: "После окончания", description: "По истечении времени окончания события" },
  { value: "manual", label: "Вручную", description: "Только по явному подтверждению" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export function EventTemplatePanel({ template, onClose }: Props) {
  const [title, setTitle] = useState(template.title);
  const [desc, setDesc] = useState(template.description ?? "");
  const [startTime, setStartTime] = useState(template.default_start_time ?? "");
  const [endTime, setEndTime] = useState(template.default_end_time ?? "");
  const [completionMode, setCompletionMode] = useState<CompletionMode>(template.completion_mode);
  const [titleFocused, setTitleFocused] = useState(false);

  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { mutate: update } = useUpdateEventTemplate();

  useEffect(() => {
    setTitle(template.title);
    setDesc(template.description ?? "");
    setStartTime(template.default_start_time ?? "");
    setEndTime(template.default_end_time ?? "");
    setCompletionMode(template.completion_mode);
  }, [template.event_id]);

  const debounceSave = useCallback(
    (field: string, value: string | null) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        update({ eventId: template.event_id, data: { [field]: value || null } });
      }, 800);
    },
    [template.event_id, update],
  );

  function saveTitle() {
    const trimmed = title.trim();
    if (!trimmed) { setTitle(template.title); return; }
    if (trimmed !== template.title) {
      update({ eventId: template.event_id, data: { title: trimmed } });
    }
  }

  function saveTime(field: "default_start_time" | "default_end_time", value: string) {
    update({ eventId: template.event_id, data: { [field]: value || null } });
  }

  function saveCompletionMode(mode: CompletionMode) {
    setCompletionMode(mode);
    update({ eventId: template.event_id, data: { completion_mode: mode } });
  }

  return (
    <SidePanel
      open
      onClose={onClose}
      ariaLabel="Редактор шаблона события"
      header={
        <>
          <div className="flex items-center gap-2.5">
            {template.category_emoji && (
              <span className="text-base">{template.category_emoji}</span>
            )}
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
              {template.category_title ?? "Шаблон события"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/[0.06] transition-colors"
            style={{ color: "var(--t-faint)" }}
          >
            <X size={15} />
          </button>
        </>
      }
    >
      <div className="p-5 space-y-5">
        {/* Title */}
        <div>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setTitleFocused(true)}
            onBlur={() => { setTitleFocused(false); saveTitle(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); titleRef.current?.blur(); }
              if (e.key === "Escape") { setTitle(template.title); titleRef.current?.blur(); }
            }}
            className={clsx(
              "w-full text-[18px] font-semibold bg-transparent outline-none leading-snug",
              "border-b transition-colors pb-1",
              titleFocused
                ? "border-[color-mix(in_srgb,var(--app-accent)_50%,transparent)]"
                : "border-transparent hover:border-white/[0.08]",
            )}
            style={{ color: "var(--t-primary)", letterSpacing: "-0.02em" }}
          />
          <p className="mt-1 text-[11px]" style={{ color: "var(--t-faint)" }}>
            {template.freq === "WEEKLY" && template.by_weekday
              ? "еженедельно"
              : template.freq_label}
          </p>
          {template.freq === "WEEKLY" && template.by_weekday && (() => {
            const days = template.by_weekday
              .split(",")
              .map((d) => d.trim().toUpperCase())
              .sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b));
            return (
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {WEEKDAY_ORDER.map((code) => {
                  const active = days.includes(code);
                  return (
                    <span
                      key={code}
                      className="px-2 py-0.5 rounded-md text-[11px] font-medium"
                      style={{
                        background: active ? "var(--app-accent)" : "var(--app-border)",
                        color: active ? "#fff" : "var(--t-faint)",
                        opacity: active ? 1 : 0.5,
                      }}
                    >
                      {WEEKDAY_LABELS[code]}
                    </span>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Time defaults */}
        <div className="flex items-start gap-3">
          <Clock size={15} className="mt-0.5 shrink-0" style={{ color: "var(--t-faint)" }} />
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
              Время по умолчанию
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <div>
                <p className="text-[10px] mb-1" style={{ color: "var(--t-faint)" }}>Начало</p>
                <TimeInput
                  value={startTime}
                  onChange={(v) => {
                    setStartTime(v);
                    saveTime("default_start_time", v);
                  }}
                  size="sm"
                  className="w-[120px]"
                />
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: "var(--t-faint)" }}>Окончание</p>
                <TimeInput
                  value={endTime}
                  onChange={(v) => {
                    setEndTime(v);
                    saveTime("default_end_time", v);
                  }}
                  size="sm"
                  className="w-[120px]"
                />
              </div>
              {(startTime || endTime) && (
                <button
                  onClick={() => {
                    setStartTime("");
                    setEndTime("");
                    update({ eventId: template.event_id, data: { default_start_time: null, default_end_time: null } });
                  }}
                  className="mt-5 p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
                  title="Сбросить время"
                >
                  <RotateCcw size={12} style={{ color: "var(--t-faint)" }} />
                </button>
              )}
            </div>
            <p className="mt-1.5 text-[11px]" style={{ color: "var(--t-faint)" }}>
              Будет применяться ко всем новым вхождениям этого события
            </p>
          </div>
        </div>

        {/* Completion mode */}
        <div className="flex items-start gap-3">
          <div
            className="w-[15px] h-[15px] rounded-full border-2 mt-0.5 shrink-0"
            style={{ borderColor: "var(--t-faint)" }}
          />
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
              Авто-завершение
            </p>
            <div className="flex flex-col gap-1">
              {COMPLETION_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => saveCompletionMode(opt.value)}
                  className={clsx(
                    "flex items-start gap-2.5 px-3 py-2 rounded-xl border text-left transition-colors",
                    completionMode === opt.value
                      ? "bg-[var(--app-accent-light)] border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)]"
                      : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]",
                  )}
                >
                  <div
                    className={clsx(
                      "w-3.5 h-3.5 rounded-full border-2 mt-0.5 shrink-0 transition-colors",
                      completionMode === opt.value
                        ? "border-[var(--app-accent)] bg-[var(--app-accent)]"
                        : "border-white/20",
                    )}
                  />
                  <div>
                    <p
                      className="text-[12px] font-medium"
                      style={{ color: completionMode === opt.value ? "var(--t-primary)" : "var(--t-secondary)" }}
                    >
                      {opt.label}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>
                      {opt.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Task templates */}
        <div className="flex items-start gap-3">
          <ListChecks size={15} className="mt-0.5 shrink-0" style={{ color: "var(--t-faint)" }} />
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
              Задачи к событию
            </p>
            <EventTaskTemplates eventId={template.event_id} />
          </div>
        </div>

        {/* Description */}
        <div className="flex items-start gap-3">
          <AlignLeft size={15} className="mt-2.5 shrink-0" style={{ color: "var(--t-faint)" }} />
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
              Описание
            </p>
            <textarea
              value={desc}
              onChange={(e) => { setDesc(e.target.value); debounceSave("description", e.target.value); }}
              placeholder="Добавить описание..."
              rows={3}
              className="w-full px-3 py-2.5 text-[14px] rounded-xl bg-white/[0.04] border border-white/[0.07] focus:outline-none focus:border-[var(--app-accent)] transition-colors resize-none placeholder-white/25"
              style={{ color: "var(--t-secondary)" }}
            />
          </div>
        </div>
      </div>
    </SidePanel>
  );
}

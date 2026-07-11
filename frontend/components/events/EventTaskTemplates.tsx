"use client";

import { useState } from "react";
import { Plus, Trash2, Bell, BellOff, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";
import {
  useEventTaskTemplates,
  useCreateEventTaskTemplate,
  useDeleteEventTaskTemplate,
  type CreateTemplateData,
} from "@/hooks/useEventTaskTemplates";
import type { EventTaskTemplateItem } from "@/types/api";
import { Popover } from "@/components/primitives/Popover";
import { Button } from "@/components/primitives/Button";

// ── Labels ────────────────────────────────────────────────────────────────────

const REMINDER_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Нет", value: null },
  { label: "За 1 час", value: 60 },
  { label: "За 3 часа", value: 180 },
  { label: "За 1 день", value: 1440 },
  { label: "За 2 дня", value: 2880 },
];

const AUTO_COMPLETE_OPTIONS: { label: string; value: "end_of_day" | "at_event_end" | null }[] = [
  { label: "Вручную", value: null },
  { label: "После события", value: "at_event_end" },
  { label: "Конец дня", value: "end_of_day" },
];

function reminderLabel(minutes: number | null): string {
  if (minutes === null) return "Без напоминания";
  const opt = REMINDER_OPTIONS.find((o) => o.value === minutes);
  return opt?.label ?? `За ${minutes} мин`;
}

function daysBeforeLabel(n: number): string {
  if (n === 0) return "в день события";
  if (n === 1) return "за 1 день";
  if (n < 5) return `за ${n} дня`;
  return `за ${n} дней`;
}

function daysAfterLabel(n: number, minutesAfterEnd: number | null): string {
  if (minutesAfterEnd !== null) {
    if (minutesAfterEnd === 0) return "сразу после окончания";
    if (minutesAfterEnd < 60) return `через ${minutesAfterEnd} мин после`;
    const h = Math.floor(minutesAfterEnd / 60);
    const m = minutesAfterEnd % 60;
    return m === 0 ? `через ${h} ч после` : `через ${h} ч ${m} мин после`;
  }
  if (n === 0) return "в день события";
  if (n === 1) return "через 1 день";
  if (n < 5) return `через ${n} дня`;
  return `через ${n} дней`;
}

function autoCompleteLabel(mode: EventTaskTemplateItem["auto_complete_mode"]): string {
  if (mode === "at_event_end") return "Авто: после события";
  if (mode === "end_of_day") return "Авто: конец дня";
  return "";
}

// ── Chip helpers ──────────────────────────────────────────────────────────────

function Chips<T>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={clsx(
            "px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors",
            opt.value === value
              ? "bg-[var(--app-accent)] border-[var(--app-accent)] text-white"
              : "bg-white/[0.04] border-white/[0.08] text-white/55 hover:bg-white/[0.07]",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Add form ──────────────────────────────────────────────────────────────────

interface AddFormProps {
  onSave: (data: CreateTemplateData) => void;
  onCancel: () => void;
  saving: boolean;
}

type Direction = "before" | "after";
type AfterMode = "days" | "minutes";

function AddForm({ onSave, onCancel, saving }: AddFormProps) {
  const [title, setTitle] = useState("");
  const [direction, setDirection] = useState<Direction>("before");

  // Before fields
  const [daysBefore, setDaysBefore] = useState("1");
  const [autoCompleteMode, setAutoCompleteMode] = useState<"end_of_day" | "at_event_end" | null>(null);

  // After fields
  const [afterMode, setAfterMode] = useState<AfterMode>("minutes");
  const [daysAfter, setDaysAfter] = useState("1");
  const [minutesAfter, setMinutesAfter] = useState("10");

  const [reminder, setReminder] = useState<number | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;

    if (direction === "before") {
      const d = parseInt(daysBefore, 10);
      if (isNaN(d) || d < 0) return;
      onSave({
        title: t,
        days_before: d,
        reminder_offset_minutes: reminder,
        is_after_event: false,
        minutes_after_end: null,
        auto_complete_mode: autoCompleteMode,
      });
    } else {
      if (afterMode === "minutes") {
        const mins = parseInt(minutesAfter, 10);
        if (isNaN(mins) || mins < 0) return;
        onSave({
          title: t,
          days_before: 0,
          reminder_offset_minutes: reminder,
          is_after_event: true,
          minutes_after_end: mins,
          auto_complete_mode: null,
        });
      } else {
        const d = parseInt(daysAfter, 10);
        if (isNaN(d) || d < 0) return;
        onSave({
          title: t,
          days_before: d,
          reminder_offset_minutes: reminder,
          is_after_event: true,
          minutes_after_end: null,
          auto_complete_mode: null,
        });
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 p-3 rounded-xl border border-[color-mix(in_srgb,var(--app-accent)_25%,transparent)] bg-[var(--app-accent-light)] space-y-2.5"
    >
      {/* Title */}
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название задачи"
        className="w-full px-3 h-9 text-[13px] rounded-lg border border-white/[0.08] bg-white/[0.05] text-white/85 placeholder-white/25 focus:outline-none focus:border-[var(--app-accent)]"
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
      />

      {/* Direction toggle */}
      <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
        <button
          type="button"
          onClick={() => setDirection("before")}
          className={clsx(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-colors",
            direction === "before"
              ? "bg-[var(--app-accent)] text-white"
              : "bg-white/[0.03] text-white/45 hover:bg-white/[0.06]",
          )}
        >
          <ArrowLeft size={10} />
          До события
        </button>
        <button
          type="button"
          onClick={() => setDirection("after")}
          className={clsx(
            "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-colors",
            direction === "after"
              ? "bg-[var(--app-accent)] text-white"
              : "bg-white/[0.03] text-white/45 hover:bg-white/[0.06]",
          )}
        >
          После события
          <ArrowRight size={10} />
        </button>
      </div>

      {/* Before: days input + auto-complete */}
      {direction === "before" && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium" style={{ color: "var(--t-faint)" }}>за</span>
            <input
              type="number"
              min={0}
              max={365}
              value={daysBefore}
              onChange={(e) => setDaysBefore(e.target.value)}
              className="w-14 px-2 h-8 text-[13px] text-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-white/85 focus:outline-none focus:border-[var(--app-accent)]"
            />
            <span className="text-[11px] font-medium" style={{ color: "var(--t-faint)" }}>дней до события</span>
          </div>

          <div>
            <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--t-faint)" }}>
              Авто-выполнение
            </p>
            <Chips
              options={AUTO_COMPLETE_OPTIONS}
              value={autoCompleteMode}
              onChange={setAutoCompleteMode}
            />
          </div>
        </>
      )}

      {/* After: mode + offset */}
      {direction === "after" && (
        <>
          <div className="flex rounded-lg overflow-hidden border border-white/[0.08]">
            <button
              type="button"
              onClick={() => setAfterMode("minutes")}
              className={clsx(
                "flex-1 py-1.5 text-[11px] font-medium transition-colors",
                afterMode === "minutes"
                  ? "bg-[var(--app-accent-light)] text-[var(--app-accent-ink)]"
                  : "bg-white/[0.03] text-white/45 hover:bg-white/[0.06]",
              )}
            >
              Минуты после окончания
            </button>
            <button
              type="button"
              onClick={() => setAfterMode("days")}
              className={clsx(
                "flex-1 py-1.5 text-[11px] font-medium transition-colors",
                afterMode === "days"
                  ? "bg-[var(--app-accent-light)] text-[var(--app-accent-ink)]"
                  : "bg-white/[0.03] text-white/45 hover:bg-white/[0.06]",
              )}
            >
              Дни после события
            </button>
          </div>

          {afterMode === "minutes" ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium" style={{ color: "var(--t-faint)" }}>через</span>
              <input
                type="number"
                min={0}
                max={1440}
                value={minutesAfter}
                onChange={(e) => setMinutesAfter(e.target.value)}
                className="w-16 px-2 h-8 text-[13px] text-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-white/85 focus:outline-none focus:border-[var(--app-accent)]"
              />
              <span className="text-[11px] font-medium" style={{ color: "var(--t-faint)" }}>
                мин после окончания
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium" style={{ color: "var(--t-faint)" }}>через</span>
              <input
                type="number"
                min={0}
                max={365}
                value={daysAfter}
                onChange={(e) => setDaysAfter(e.target.value)}
                className="w-14 px-2 h-8 text-[13px] text-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-white/85 focus:outline-none focus:border-[var(--app-accent)]"
              />
              <span className="text-[11px] font-medium" style={{ color: "var(--t-faint)" }}>дней после события</span>
            </div>
          )}
        </>
      )}

      {/* Reminder */}
      <div>
        <p className="text-[11px] font-medium mb-1.5" style={{ color: "var(--t-faint)" }}>Уведомление</p>
        <Chips options={REMINDER_OPTIONS} value={reminder} onChange={setReminder} />
      </div>

      <div className="flex gap-2 pt-0.5">
        <Button type="submit" size="sm" variant="primary" loading={saving} disabled={!title.trim()}>
          Добавить
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </form>
  );
}

// ── Template row ──────────────────────────────────────────────────────────────

function TemplateRow({
  tpl,
  onDelete,
}: {
  tpl: EventTaskTemplateItem;
  onDelete: (id: number, archiveTasks: boolean) => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  const timing = tpl.is_after_event
    ? daysAfterLabel(tpl.days_before, tpl.minutes_after_end)
    : daysBeforeLabel(tpl.days_before);

  const acLabel = !tpl.is_after_event ? autoCompleteLabel(tpl.auto_complete_mode) : "";

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] group">
      {/* Direction icon */}
      <div className="shrink-0" style={{ color: tpl.is_after_event ? "rgb(167 139 250 / 0.6)" : "rgb(99 102 241 / 0.6)" }}>
        {tpl.is_after_event ? <ArrowRight size={11} /> : <ArrowLeft size={11} />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium truncate" style={{ color: "var(--t-secondary)" }}>
          {tpl.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>
            {timing}
          </span>
          {tpl.reminder_offset_minutes !== null && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-400/80">
              <Bell size={9} />
              {reminderLabel(tpl.reminder_offset_minutes)}
            </span>
          )}
          {tpl.reminder_offset_minutes === null && (
            <span className="inline-flex items-center gap-0.5 text-[11px]" style={{ color: "var(--t-faint)" }}>
              <BellOff size={9} />
            </span>
          )}
          {acLabel && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-400/70">
              <CheckCircle2 size={9} />
              {acLabel}
            </span>
          )}
        </div>
      </div>

      <Popover
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        side="left"
        align="center"
        className="min-w-[220px] p-3"
        trigger={
          <button
            className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 hover:text-red-400"
            style={{ color: "var(--t-faint)" }}
          >
            <Trash2 size={12} />
          </button>
        }
      >
        <p className="text-[13px] font-medium mb-1" style={{ color: "var(--t-primary)" }}>
          Удалить шаблон?
        </p>
        <p className="text-[11px] mb-3" style={{ color: "var(--t-faint)" }}>
          Что сделать с уже созданными задачами?
        </p>
        <div className="flex flex-col gap-1.5">
          <Button size="sm" variant="secondary" fullWidth onClick={() => { onDelete(tpl.id, false); setDeleteOpen(false); }}>
            Оставить задачи
          </Button>
          <Button size="sm" variant="destructive" fullWidth onClick={() => { onDelete(tpl.id, true); setDeleteOpen(false); }}>
            Архивировать задачи
          </Button>
        </div>
      </Popover>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  eventId: number;
}

export function EventTaskTemplates({ eventId }: Props) {
  const { data: templates, isLoading } = useEventTaskTemplates(eventId);
  const { mutate: create, isPending: creating } = useCreateEventTaskTemplate(eventId);
  const { mutate: remove } = useDeleteEventTaskTemplate(eventId);

  const [showAdd, setShowAdd] = useState(false);

  function handleSave(data: CreateTemplateData) {
    create(data, { onSuccess: () => setShowAdd(false) });
  }

  function handleDelete(id: number, archiveTasks: boolean) {
    remove({ id, archiveTasks });
  }

  const beforeTemplates = (templates ?? []).filter((t) => !t.is_after_event);
  const afterTemplates = (templates ?? []).filter((t) => t.is_after_event);

  return (
    <div className="space-y-1.5">
      {isLoading && (
        <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Загрузка...</p>
      )}

      {beforeTemplates.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider font-semibold px-0.5" style={{ color: "var(--t-faint)" }}>
            До события
          </p>
          {beforeTemplates.map((tpl) => (
            <TemplateRow key={tpl.id} tpl={tpl} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {afterTemplates.length > 0 && (
        <div className="space-y-1.5" style={{ marginTop: beforeTemplates.length > 0 ? "10px" : undefined }}>
          <p className="text-[10px] uppercase tracking-wider font-semibold px-0.5" style={{ color: "var(--t-faint)" }}>
            После события
          </p>
          {afterTemplates.map((tpl) => (
            <TemplateRow key={tpl.id} tpl={tpl} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {!showAdd && (
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 w-full px-2.5 py-1.5 rounded-xl text-[12px] font-medium border border-dashed border-white/[0.10] hover:border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)] hover:bg-[var(--app-accent-weak)]0/[0.04] transition-colors"
          style={{ color: "var(--t-faint)" }}
        >
          <Plus size={12} />
          Добавить задачу к событию
        </button>
      )}

      {showAdd && (
        <AddForm
          onSave={handleSave}
          onCancel={() => setShowAdd(false)}
          saving={creating}
        />
      )}
    </div>
  );
}

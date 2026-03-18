"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import type { WorkCategoryItem } from "@/types/api";
import { Select } from "@/components/ui/Select";
import { BottomSheet } from "@/components/ui/BottomSheet";

interface Props {
  onClose: () => void;
}

const inputCls =
  "w-full px-3 h-10 text-base md:text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors [color-scheme:dark]";
const labelCls =
  "block text-[11px] md:text-xs font-medium text-white/50 uppercase tracking-wider mb-1";

const REPEAT_OPTIONS = [
  { value: "", label: "Не повторяется" },
  { value: "daily", label: "Ежедневно" },
  { value: "weekly", label: "Еженедельно" },
  { value: "custom", label: "Настроить…", disabled: true },
];

const REMINDER_OPTIONS = [
  { value: "", label: "Нет" },
  { value: "10", label: "За 10 минут" },
  { value: "60", label: "За 1 час" },
  { value: "1440", label: "За 1 день" },
];

export function CreateEventModal({ onClose }: Props) {
  const qc = useQueryClient();

  // ── Core fields ──────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [startDate, setStartDate] = useState("");

  // ── Toggles ──────────────────────────────────────────────────
  const [hasTime, setHasTime] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState("");

  // ── Extra (collapsible) ──────────────────────────────────────
  const [showExtra, setShowExtra] = useState(false);
  const [repeat, setRepeat] = useState("");
  const [reminder, setReminder] = useState("");
  const [description, setDescription] = useState("");

  // ── UI state ─────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const { data: categories } = useQuery<WorkCategoryItem[]>({
    queryKey: ["work-categories"],
    queryFn: () =>
      fetch("/api/v2/work-categories", { credentials: "include" }).then((r) =>
        r.json(),
      ),
    staleTime: 5 * 60_000,
  });

  // ── Auto-resize textarea ─────────────────────────────────────
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [description]);

  // ── Validation + Submit ──────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Введите название события");
      return;
    }
    if (!categoryId) {
      setError("Выберите категорию");
      return;
    }
    if (!startDate) {
      setError("Укажите дату");
      return;
    }
    if (hasTime && !startTime) {
      setError("Укажите время или отключите переключатель");
      return;
    }
    if (hasEndDate && !endDate) {
      setError("Укажите дату окончания или отключите переключатель");
      return;
    }
    if (hasEndDate && endDate && endDate < startDate) {
      setError("Дата окончания не может быть раньше даты начала");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        start_date: startDate,
        start_time: hasTime && startTime ? startTime : null,
        end_date: hasEndDate && endDate ? endDate : null,
        description: description.trim() || null,
        category_id: categoryId || null,
      };

      // Repeat: send freq for backend (daily/weekly)
      if (repeat && repeat !== "custom") {
        body.freq = repeat;
        body.start_date_rule = startDate;
      }

      // Reminder offset
      if (reminder) {
        body.reminder_offset = Number(reminder);
      }

      const res = await fetch("/api/v2/events", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Ошибка при создании события");
        return;
      }
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle component ─────────────────────────────────────────
  function Toggle({
    checked,
    onChange,
    label,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
  }) {
    return (
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="flex items-center gap-2.5 py-1.5 group"
      >
        <div
          className={clsx(
            "w-9 h-5 rounded-full transition-colors relative shrink-0",
            checked ? "bg-indigo-500" : "bg-white/[0.1]",
          )}
        >
          <div
            className={clsx(
              "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
              checked ? "translate-x-4" : "translate-x-0.5",
            )}
          />
        </div>
        <span
          className="text-[13px] font-medium"
          style={{ color: checked ? "var(--t-primary)" : "var(--t-muted)" }}
        >
          {label}
        </span>
      </button>
    );
  }

  // ── Footer ───────────────────────────────────────────────────
  const footer = (
    <div className="flex gap-2.5">
      <button
        type="submit"
        disabled={saving}
        className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
      >
        {saving ? "Создаём…" : "Создать"}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2.5 text-sm font-medium rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/60 hover:bg-white/[0.08] transition-colors hidden md:block"
      >
        Отмена
      </button>
    </div>
  );

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Создать событие"
      footer={footer}
      onSubmit={handleSubmit}
    >
      {/* ── Название * ── */}
      <div>
        <label className={labelCls}>Название *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название события"
          className={inputCls}
          autoFocus
        />
      </div>

      {/* ── Категория * ── */}
      {categories && categories.length > 0 && (
        <div>
          <label className={labelCls}>Категория *</label>
          <Select
            value={categoryId}
            onChange={(v) => setCategoryId(v ? Number(v) : "")}
            placeholder="Выберите категорию"
            options={categories.map((c) => ({
              value: String(c.category_id),
              label: c.title,
              emoji: c.emoji ?? undefined,
            }))}
          />
        </div>
      )}

      {/* ── Дата * ── */}
      <div>
        <label className={labelCls}>Дата *</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* ── Переключатель: время ── */}
      <div>
        <Toggle
          checked={hasTime}
          onChange={(v) => {
            setHasTime(v);
            if (!v) setStartTime("");
          }}
          label="Указать время"
        />
        {hasTime && (
          <div className="mt-2">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={inputCls}
            />
          </div>
        )}
      </div>

      {/* ── Переключатель: несколько дней ── */}
      <div>
        <Toggle
          checked={hasEndDate}
          onChange={(v) => {
            setHasEndDate(v);
            if (!v) setEndDate("");
          }}
          label="Длится несколько дней"
        />
        {hasEndDate && (
          <div className="mt-2">
            <label className={labelCls}>Дата окончания</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate || undefined}
              className={inputCls}
            />
          </div>
        )}
      </div>

      {/* ── Дополнительно (collapsible) ── */}
      <div>
        <button
          type="button"
          onClick={() => setShowExtra((v) => !v)}
          className="flex items-center gap-1.5 py-1 text-[12px] font-medium transition-colors hover:text-white/60"
          style={{ color: "var(--t-faint)" }}
        >
          <ChevronDown
            size={14}
            className={clsx(
              "transition-transform",
              showExtra && "rotate-180",
            )}
          />
          Дополнительно
        </button>

        {showExtra && (
          <div className="mt-2.5 space-y-3.5 pl-0.5">
            {/* Повторение */}
            <div>
              <label className={labelCls}>Повторение</label>
              <select
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                className={inputCls}
              >
                {REPEAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} disabled={o.disabled}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Уведомление */}
            <div>
              <label className={labelCls}>Уведомление</label>
              <select
                value={reminder}
                onChange={(e) => setReminder(e.target.value)}
                className={inputCls}
              >
                {REMINDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Описание */}
            <div>
              <label className={labelCls}>Описание</label>
              <textarea
                ref={descRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Необязательно"
                rows={2}
                className="w-full px-3 py-2.5 text-base md:text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors resize-none"
                style={{ minHeight: 56, maxHeight: 160 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <p className="text-[13px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          {error}
        </p>
      )}
    </BottomSheet>
  );
}

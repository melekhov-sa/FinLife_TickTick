"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkCategoryItem } from "@/types/api";
import { Select } from "@/components/ui/Select";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { DateInput } from "@/components/primitives/DateInput";
import { api } from "@/lib/api";
import { CreateHabitRequestSchema } from "@/schemas/api.generated";
import {
  validateWithSchema, mergeErrors, parseBackendErrors,
  inputErrorBorder, errTextCls, type FieldErrors,
} from "@/lib/formErrors";

interface Props {
  onClose: () => void;
}

const inputCls = "w-full px-3 h-9 text-base md:text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors [color-scheme:dark]";
const labelCls = "block text-[11px] md:text-xs font-medium text-white/72 uppercase tracking-wider mb-1.5";

const FREQ_OPTIONS = [
  { value: "DAILY",   label: "Каждый день" },
  { value: "WEEKLY",  label: "Еженедельно" },
  { value: "MONTHLY", label: "Ежемесячно" },
  { value: "YEARLY",  label: "Ежегодно" },
];

const WEEKDAYS = [
  { value: "0", label: "Пн" },
  { value: "1", label: "Вт" },
  { value: "2", label: "Ср" },
  { value: "3", label: "Чт" },
  { value: "4", label: "Пт" },
  { value: "5", label: "Сб" },
  { value: "6", label: "Вс" },
];

const LEVELS = [
  { value: 1, label: "Просто" },
  { value: 2, label: "Средне" },
  { value: 3, label: "Сложно" },
];

export function CreateHabitModal({ onClose }: Props) {
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [freq, setFreq] = useState("DAILY");
  const [weekdays, setWeekdays] = useState<string[]>([]);
  const [byMonthday, setByMonthday] = useState("");
  const [level, setLevel] = useState(1);
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [interval, setInterval] = useState(1);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [activeUntil, setActiveUntil] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const { data: categories } = useQuery<WorkCategoryItem[]>({
    queryKey: ["work-categories"],
    queryFn: () => api.get<WorkCategoryItem[]>("/api/v2/work-categories"),
    staleTime: 5 * 60_000,
  });

  function toggleWeekday(v: string) {
    setWeekdays((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
    clearFieldError("by_weekday");
  }

  function clearFieldError(field: string) {
    if (fieldErrors[field]) setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  }

  function buildPayload() {
    return {
      title: title.trim(),
      freq,
      interval,
      by_weekday: freq === "WEEKLY" ? weekdays.join(",") : null,
      by_monthday: freq === "MONTHLY" ? Number(byMonthday) || null : null,
      level,
      category_id: categoryId || null,
      note: note.trim() || null,
      start_date: startDate || null,
      active_until: activeUntil || null,
      reminder_time: reminderTime || null,
    };
  }

  function validate(): boolean {
    const payload = buildPayload();

    // Layer 1: Zod schema (from backend contract)
    const zodErrs = validateWithSchema(CreateHabitRequestSchema, payload);

    // Layer 2: Business rules
    const custom: FieldErrors = {};
    if (!payload.title) custom.title = "Введите название привычки";
    if (interval < 1) custom.interval = "Интервал должен быть не менее 1";
    if (freq === "WEEKLY" && weekdays.length === 0) custom.by_weekday = "Выберите хотя бы один день недели";
    if (freq === "MONTHLY" && !byMonthday) custom.by_monthday = "Укажите день месяца";
    if (freq === "MONTHLY" && byMonthday) {
      const day = Number(byMonthday);
      if (day < 1 || day > 31) custom.by_monthday = "День месяца должен быть от 1 до 31";
    }

    const merged = mergeErrors(zodErrs, custom);
    setFieldErrors(merged);
    setError(null);
    return Object.keys(merged).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setError(null);
    try {
      await api.post("/api/v2/habits", buildPayload());
      qc.invalidateQueries({ queryKey: ["habits"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      const match = msg.match(/API error (\d+): ([\s\S]*)/);
      if (match) {
        try {
          const parsed = parseBackendErrors(parseInt(match[1]), JSON.parse(match[2]));
          if (parsed.fieldErrors) { setFieldErrors(parsed.fieldErrors); return; }
          setError(parsed.message ?? "Ошибка при создании привычки");
        } catch { setError("Ошибка при создании привычки"); }
      } else {
        setError("Не удалось подключиться к серверу");
      }
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div className="flex gap-2.5">
      <button
        type="submit"
        disabled={saving}
        className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
      >
        {saving ? "Создаём…" : "Создать привычку"}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2.5 text-sm font-medium rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/68 hover:text-white/65 hover:bg-white/[0.08] transition-colors hidden md:block"
      >
        Отмена
      </button>
    </div>
  );

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Создать привычку"
      footer={footer}
      onSubmit={handleSubmit}
    >
      {/* Title */}
      <div>
        <label className={labelCls}>Название *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); clearFieldError("title"); }}
          placeholder="Название привычки"
          className={`${inputCls} h-10 ${fieldErrors.title ? inputErrorBorder : ""}`}
          autoFocus
        />
        {fieldErrors.title && <p className={errTextCls}>{fieldErrors.title}</p>}
      </div>

      {/* Category */}
      {categories && categories.length > 0 && (
        <div>
          <label className={labelCls}>Категория</label>
          <Select
            value={categoryId}
            onChange={(v) => setCategoryId(v ? Number(v) : "")}
            placeholder="— без категории —"
            options={[
              { value: "", label: "— без категории —" },
              ...categories.map((c) => ({ value: String(c.category_id), label: c.title, emoji: c.emoji ?? undefined })),
            ]}
          />
        </div>
      )}

      {/* Frequency */}
      <div>
        <label className={labelCls}>Повторение *</label>
        <div className="flex gap-1.5">
          {FREQ_OPTIONS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { setFreq(f.value); clearFieldError("by_weekday"); clearFieldError("by_monthday"); }}
              className={`flex-1 py-2 text-[11px] md:text-xs font-medium rounded-xl border transition-colors ${
                freq === f.value
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-white/[0.03] border-white/[0.08] text-white/72 hover:text-white/65 hover:bg-white/[0.05]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Interval */}
      <div>
        <label className={labelCls}>Интервал (каждые N)</label>
        <input
          type="number"
          min="1"
          value={interval}
          onChange={(e) => { setInterval(Math.max(1, Number(e.target.value))); clearFieldError("interval"); }}
          className={`${inputCls} ${fieldErrors.interval ? inputErrorBorder : ""}`}
        />
        {fieldErrors.interval && <p className={errTextCls}>{fieldErrors.interval}</p>}
      </div>

      {/* Weekday picker */}
      {freq === "WEEKLY" && (
        <div>
          <label className={labelCls}>Дни недели *</label>
          <div className="flex gap-1.5 flex-wrap">
            {WEEKDAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => toggleWeekday(d.value)}
                className={`px-3 py-1.5 text-[11px] md:text-xs font-medium rounded-xl border transition-colors ${
                  weekdays.includes(d.value)
                    ? "bg-indigo-600 border-indigo-500 text-white"
                    : `bg-white/[0.03] ${fieldErrors.by_weekday ? "border-red-500/50" : "border-white/[0.08]"} text-white/72 hover:text-white/65 hover:bg-white/[0.05]`
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          {fieldErrors.by_weekday && <p className={errTextCls}>{fieldErrors.by_weekday}</p>}
        </div>
      )}

      {/* Month day */}
      {freq === "MONTHLY" && (
        <div>
          <label className={labelCls}>День месяца (1–31) *</label>
          <input
            type="number"
            min="1"
            max="31"
            value={byMonthday}
            onChange={(e) => { setByMonthday(e.target.value); clearFieldError("by_monthday"); }}
            className={`${inputCls} ${fieldErrors.by_monthday ? inputErrorBorder : ""}`}
          />
          {fieldErrors.by_monthday && <p className={errTextCls}>{fieldErrors.by_monthday}</p>}
        </div>
      )}

      {/* Start date + Active until */}
      <div className="flex gap-2.5">
        <div className="flex-1">
          <label className={labelCls}>Начать с</label>
          <DateInput
            value={startDate}
            onChange={setStartDate}
          />
        </div>
        <div className="flex-1">
          <label className={labelCls}>Действует до</label>
          <DateInput
            value={activeUntil}
            onChange={setActiveUntil}
          />
          <p className="mt-1 text-[10px] text-white/40">Оставьте пустым для бессрочного действия</p>
        </div>
      </div>

      {/* Level */}
      <div>
        <label className={labelCls}>Уровень сложности</label>
        <div className="flex gap-1.5">
          {LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => setLevel(l.value)}
              className={`flex-1 py-2 text-[11px] md:text-xs font-medium rounded-xl border transition-colors ${
                level === l.value
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "bg-white/[0.03] border-white/[0.08] text-white/72 hover:text-white/65 hover:bg-white/[0.05]"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reminder time */}
      <div>
        <label className={labelCls}>Время напоминания</label>
        <input
          type="time"
          value={reminderTime}
          onChange={(e) => setReminderTime(e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Note */}
      <div>
        <label className={labelCls}>Заметка</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Необязательно"
          rows={2}
          className="w-full px-3 py-2 text-base md:text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          {error}
        </p>
      )}
    </BottomSheet>
  );
}

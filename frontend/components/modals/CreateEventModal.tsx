"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import type { WorkCategoryItem } from "@/types/api";
import { Select } from "@/components/ui/Select";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { api } from "@/lib/api";
import { CreateEventRequestSchema } from "@/schemas/api.generated";
import {
  validateWithSchema, mergeErrors, parseBackendErrors,
  inputErrorBorder, errTextCls, type FieldErrors,
} from "@/lib/formErrors";

interface Props {
  onClose: () => void;
}

const inputCls =
  "w-full px-3 h-10 text-base rounded-xl border focus:outline-none focus:border-indigo-500/60 transition-colors bg-white dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.08] text-slate-800 dark:text-white/85 placeholder-slate-400 dark:placeholder-white/25";
const labelCls =
  "block text-[11px] md:text-xs font-medium uppercase tracking-wider mb-1 text-slate-500 dark:text-white/50";

const REPEAT_OPTIONS = [
  { value: "", label: "Не повторяется" },
  { value: "daily", label: "Ежедневно" },
  { value: "weekly", label: "Еженедельно" },
  { value: "monthly", label: "Ежемесячно" },
  { value: "yearly", label: "Ежегодно" },
  { value: "interval", label: "Интервал (дней)" },
];

const WEEKDAYS = [
  { value: "MO", label: "Пн" }, { value: "TU", label: "Вт" },
  { value: "WE", label: "Ср" }, { value: "TH", label: "Чт" },
  { value: "FR", label: "Пт" }, { value: "SA", label: "Сб" },
  { value: "SU", label: "Вс" },
];

const MONTHS = [
  { value: "1", label: "Январь" }, { value: "2", label: "Февраль" },
  { value: "3", label: "Март" }, { value: "4", label: "Апрель" },
  { value: "5", label: "Май" }, { value: "6", label: "Июнь" },
  { value: "7", label: "Июль" }, { value: "8", label: "Август" },
  { value: "9", label: "Сентябрь" }, { value: "10", label: "Октябрь" },
  { value: "11", label: "Ноябрь" }, { value: "12", label: "Декабрь" },
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
  const [endTime, setEndTime] = useState("");
  const [recWeekdays, setRecWeekdays] = useState<string[]>([]);
  const [recDay, setRecDay] = useState("");
  const [recMonth, setRecMonth] = useState("");
  const [recDayYearly, setRecDayYearly] = useState("");
  const [recInterval, setRecInterval] = useState("1");
  const [untilDate, setUntilDate] = useState("");

  // ── UI state ─────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const { data: categories } = useQuery<WorkCategoryItem[]>({
    queryKey: ["work-categories"],
    queryFn: () => api.get<WorkCategoryItem[]>("/api/v2/work-categories"),
    staleTime: 5 * 60_000,
  });

  // ── Auto-resize textarea ─────────────────────────────────────
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [description]);

  function clearFieldError(field: string) {
    if (fieldErrors[field]) setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  }

  function buildPayload() {
    const body: Record<string, unknown> = {
      title: title.trim(),
      start_date: startDate,
      start_time: hasTime && startTime ? startTime : null,
      end_date: hasEndDate && endDate ? endDate : null,
      description: description.trim() || null,
      category_id: categoryId || null,
    };
    body.end_time = hasEndDate && endTime ? endTime : null;
    if (repeat) {
      body.freq = repeat;
      body.start_date_rule = startDate;
      body.until_date = untilDate || null;
      if (repeat === "weekly") body.rec_weekdays = recWeekdays.join(",") || null;
      if (repeat === "monthly") body.rec_day = recDay ? Number(recDay) : null;
      if (repeat === "yearly") {
        body.rec_month = recMonth ? Number(recMonth) : null;
        body.rec_day_yearly = recDayYearly ? Number(recDayYearly) : null;
      }
      if (repeat === "interval") body.rec_interval = recInterval ? Number(recInterval) : null;
    }
    if (reminder) {
      body.reminder_offset = Number(reminder);
    }
    return body;
  }

  function validate(): boolean {
    const payload = buildPayload();

    // Layer 1: Zod schema (from backend contract)
    const zodErrs = validateWithSchema(CreateEventRequestSchema, payload);

    // Layer 2: Business rules
    const custom: FieldErrors = {};
    if (!title.trim()) custom.title = "Введите название события";
    if (!categoryId) custom.category_id = "Выберите категорию";
    if (!startDate) custom.start_date = "Укажите дату";
    if (hasTime && !startTime) custom.start_time = "Укажите время или отключите переключатель";
    if (hasEndDate && !endDate) custom.end_date = "Укажите дату окончания или отключите переключатель";
    if (hasEndDate && endDate && startDate && endDate < startDate) custom.end_date = "Дата окончания не может быть раньше даты начала";

    const merged = mergeErrors(zodErrs, custom);
    setFieldErrors(merged);
    setError(null);
    return Object.keys(merged).length === 0;
  }

  // ── Submit ───────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      await api.post("/api/v2/events", buildPayload());
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      const match = msg.match(/API error (\d+): ([\s\S]*)/);
      if (match) {
        try {
          const parsed = parseBackendErrors(parseInt(match[1]), JSON.parse(match[2]));
          if (parsed.fieldErrors) { setFieldErrors(parsed.fieldErrors); return; }
          setError(parsed.message ?? "Ошибка при создании события");
        } catch { setError("Ошибка при создании события"); }
      } else {
        setError("Не удалось подключиться к серверу");
      }
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
          onChange={(e) => { setTitle(e.target.value); clearFieldError("title"); }}
          placeholder="Название события"
          className={`${inputCls} ${fieldErrors.title ? inputErrorBorder : ""}`}
          autoFocus
        />
        {fieldErrors.title && <p className={errTextCls}>{fieldErrors.title}</p>}
      </div>

      {/* ── Категория * ── */}
      {categories && categories.length > 0 && (
        <div>
          <label className={labelCls}>Категория *</label>
          <Select
            value={categoryId}
            onChange={(v) => { setCategoryId(v ? Number(v) : ""); clearFieldError("category_id"); }}
            placeholder="Выберите категорию"
            options={categories.map((c) => ({
              value: String(c.category_id),
              label: c.title,
              emoji: c.emoji ?? undefined,
            }))}
          />
          {fieldErrors.category_id && <p className={errTextCls}>{fieldErrors.category_id}</p>}
        </div>
      )}

      {/* ── Дата * ── */}
      <div>
        <label className={labelCls}>Дата *</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); clearFieldError("start_date"); }}
          className={`${inputCls} ${fieldErrors.start_date ? inputErrorBorder : ""}`}
        />
        {fieldErrors.start_date && <p className={errTextCls}>{fieldErrors.start_date}</p>}
      </div>

      {/* ── Переключатель: время ── */}
      <div>
        <Toggle
          checked={hasTime}
          onChange={(v) => {
            setHasTime(v);
            if (!v) setStartTime("");
            clearFieldError("start_time");
          }}
          label="Указать время"
        />
        {hasTime && (
          <div className="mt-2">
            <input
              type="time"
              value={startTime}
              onChange={(e) => { setStartTime(e.target.value); clearFieldError("start_time"); }}
              className={`${inputCls} ${fieldErrors.start_time ? inputErrorBorder : ""}`}
            />
            {fieldErrors.start_time && <p className={errTextCls}>{fieldErrors.start_time}</p>}
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
            clearFieldError("end_date");
          }}
          label="Длится несколько дней"
        />
        {hasEndDate && (
          <div className="mt-2 space-y-2">
            <div>
              <label className={labelCls}>Дата окончания</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); clearFieldError("end_date"); }}
                min={startDate || undefined}
                className={`${inputCls} ${fieldErrors.end_date ? inputErrorBorder : ""}`}
              />
              {fieldErrors.end_date && <p className={errTextCls}>{fieldErrors.end_date}</p>}
            </div>
            <div>
              <label className={labelCls}>Время окончания</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={inputCls}
              />
            </div>
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
              <Select
                value={repeat}
                onChange={(v) => setRepeat(v)}
                placeholder="Не повторяется"
                options={REPEAT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </div>

            {/* Повторение: дни недели (weekly) */}
            {repeat === "weekly" && (
              <div>
                <label className={labelCls}>Дни недели</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {WEEKDAYS.map((d) => {
                    const active = recWeekdays.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() =>
                          setRecWeekdays((prev) =>
                            active ? prev.filter((x) => x !== d.value) : [...prev, d.value],
                          )
                        }
                        className={clsx(
                          "px-2.5 py-1 rounded-lg text-[12px] font-medium border transition-colors",
                          active
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "bg-white/[0.05] border-white/[0.08] text-white/50 hover:bg-white/[0.08]",
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Повторение: день месяца (monthly) */}
            {repeat === "monthly" && (
              <div>
                <label className={labelCls}>День месяца (1–31)</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={recDay}
                  onChange={(e) => setRecDay(e.target.value)}
                  placeholder="1"
                  className={inputCls}
                />
              </div>
            )}

            {/* Повторение: месяц + день (yearly) */}
            {repeat === "yearly" && (
              <div className="space-y-2">
                <div>
                  <label className={labelCls}>Месяц</label>
                  <Select
                    value={recMonth}
                    onChange={(v) => setRecMonth(v)}
                    placeholder="— выберите —"
                    options={[
                      { value: "", label: "— выберите —" },
                      ...MONTHS.map((m) => ({ value: m.value, label: m.label })),
                    ]}
                  />
                </div>
                <div>
                  <label className={labelCls}>День (1–31)</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={recDayYearly}
                    onChange={(e) => setRecDayYearly(e.target.value)}
                    placeholder="1"
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            {/* Повторение: интервал (interval) */}
            {repeat === "interval" && (
              <div>
                <label className={labelCls}>Интервал (дней)</label>
                <input
                  type="number"
                  min={1}
                  value={recInterval}
                  onChange={(e) => setRecInterval(e.target.value)}
                  placeholder="1"
                  className={inputCls}
                />
              </div>
            )}

            {/* Повторение: дата окончания повторений */}
            {repeat && (
              <div>
                <label className={labelCls}>Повторять до</label>
                <input
                  type="date"
                  value={untilDate}
                  onChange={(e) => setUntilDate(e.target.value)}
                  min={startDate || undefined}
                  className={inputCls}
                />
              </div>
            )}

            {/* Уведомление */}
            <div>
              <label className={labelCls}>Уведомление</label>
              <Select
                value={reminder}
                onChange={(v) => setReminder(v)}
                placeholder="Нет"
                options={REMINDER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
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

"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ChevronDown, Plus, Check, X as XIcon, Bell } from "lucide-react";
import { clsx } from "clsx";
import type { WorkCategoryItem } from "@/types/api";
import { Select } from "@/components/ui/Select";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { DateInput } from "@/components/primitives/DateInput";
import { TimeInput } from "@/components/primitives/TimeInput";
import { Switch } from "@/components/primitives/Switch";
import { useToast } from "@/components/primitives/Toast";
import { api } from "@/lib/api";
import { CreateEventRequestSchema } from "@/schemas/api.generated";
import {
  validateWithSchema, mergeErrors, parseBackendErrors,
  inputErrorBorder, errTextCls, type FieldErrors,
} from "@/lib/formErrors";

interface Props {
  onClose: () => void;
  initialDate?: string;
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

const JS_DAY_TO_WEEKDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function dateToWeekdayCode(iso: string): string | null {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  return JS_DAY_TO_WEEKDAY[d.getDay()] ?? null;
}


const REMINDER_OPTIONS = [
  { value: "", label: "Нет" },
  { value: "10", label: "За 10 минут" },
  { value: "60", label: "За 1 час" },
  { value: "1440", label: "За 1 день" },
];

const EVENT_FIXED_TIME_PRESETS = ["09:00", "12:00", "15:00", "18:00", "20:00"];

const EVENT_OFFSET_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 10, label: "За 10 мин" },
  { minutes: 30, label: "За 30 мин" },
  { minutes: 60, label: "За 1 час" },
  { minutes: 180, label: "За 3 часа" },
  { minutes: 1440, label: "За 1 день" },
];

type StagedReminder =
  | { mode: "offset"; offset_minutes: number; label: string }
  | { mode: "fixed_time"; fixed_time: string; label: string };

export function CreateEventModal({ onClose, initialDate }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Core fields ──────────────────────────────────────────────
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [startDate, setStartDate] = useState(initialDate ?? "");

  // ── Toggles ──────────────────────────────────────────────────
  const [hasTime, setHasTime] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState("");

  // ── Extra (collapsible) ──────────────────────────────────────
  const [birthYear, setBirthYear] = useState("");
  const [showExtra, setShowExtra] = useState(false);
  const [repeat, setRepeat] = useState("");
  const [reminder, setReminder] = useState("");
  const [stagedReminders, setStagedReminders] = useState<StagedReminder[]>([]);
  const [showReminderPicker, setShowReminderPicker] = useState(false);
  const [description, setDescription] = useState("");
  const [endTime, setEndTime] = useState("");
  const [recWeekdays, setRecWeekdays] = useState<string[]>([]);
  const [recInterval, setRecInterval] = useState("1");
  const [untilDate, setUntilDate] = useState("");

  // ── Task templates (staged before event is created) ──────────
  const [stagedTemplates, setStagedTemplates] = useState<{ title: string; days_before: number; reminder_offset_minutes: number | null }[]>([]);
  const [showTemplateAdd, setShowTemplateAdd] = useState(false);
  const [tplTitle, setTplTitle] = useState("");
  const [tplDays, setTplDays] = useState("7");
  const [tplReminder, setTplReminder] = useState<number | null>(null);

  // ── UI state ─────────────────────────────────────────────────
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // ── Создание категории ────────────────────────────────────────
  const [showCatCreate, setShowCatCreate] = useState(false);
  const [newCatTitle, setNewCatTitle] = useState("");
  const [newCatEmoji, setNewCatEmoji] = useState("");
  const newCatTitleRef = useRef<HTMLInputElement>(null);

  const { mutate: createCategory, isPending: catCreating } = useMutation({
    mutationFn: (data: { title: string; emoji: string | null }) =>
      api.post<{ category_id: number }>("/api/v2/work-categories", data),
    onSuccess: (res: { category_id: number }) => {
      qc.invalidateQueries({ queryKey: ["work-categories"] });
      if (res?.category_id) setCategoryId(res.category_id);
      setShowCatCreate(false);
      setNewCatTitle("");
      setNewCatEmoji("");
    },
  });

  const handleCreateCategory = useCallback(() => {
    const t = newCatTitle.trim();
    if (!t) return;
    createCategory({ title: t, emoji: newCatEmoji.trim() || null });
  }, [newCatTitle, newCatEmoji, createCategory]);

  const { data: categories } = useQuery<WorkCategoryItem[]>({
    queryKey: ["work-categories"],
    queryFn: () => api.get<WorkCategoryItem[]>("/api/v2/work-categories"),
    staleTime: 5 * 60_000,
  });

  const isBirthdayCategory =
    categoryId !== "" &&
    categories?.find((c) => c.category_id === Number(categoryId))?.slug === "birthday";

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
    const selectedCat = categories?.find((c) => c.category_id === Number(categoryId));
    if (selectedCat?.slug === "birthday") {
      body.birth_year = birthYear ? Number(birthYear) : null;
    }
    if (repeat) {
      body.freq = repeat;
      body.start_date_rule = startDate;
      body.until_date = untilDate || null;
      if (repeat === "weekly") body.rec_weekdays = recWeekdays.join(",") || null;
      if (repeat === "monthly") {
        body.rec_day = startDate ? Number(startDate.split("-")[2]) : null;
      }
      if (repeat === "yearly") {
        body.rec_month = startDate ? Number(startDate.split("-")[1]) : null;
        body.rec_day_yearly = startDate ? Number(startDate.split("-")[2]) : null;
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
    if (repeat === "weekly" && recWeekdays.length === 0) custom.rec_weekdays = "Выберите хотя бы один день недели";

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
      const res = await api.post<{ id?: number }>("/api/v2/events", buildPayload());
      // Create staged reminders
      if (res?.id && stagedReminders.length > 0) {
        for (const r of stagedReminders) {
          try {
            await api.post(`/api/v2/events/${res.id}/reminders`,
              r.mode === "offset"
                ? { mode: "offset", offset_minutes: r.offset_minutes }
                : { mode: "fixed_time", fixed_time: r.fixed_time }
            );
          } catch { /* best-effort */ }
        }
      }
      // Create staged task templates
      if (res?.id && stagedTemplates.length > 0) {
        for (const tpl of stagedTemplates) {
          try {
            await api.post(`/api/v2/events/${res.id}/task-templates`, tpl);
          } catch { /* best-effort */ }
        }
      }
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["event-templates"] });
      toast({ title: "Событие создано", variant: "success" });
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

  // ── Toggle component (uses primitive Switch) ─────────────────
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
      <div className="py-1.5">
        <Switch checked={checked} onChange={onChange} label={label} size="sm" />
      </div>
    );
  }

  // ── Footer ───────────────────────────────────────────────────
  const footer = (
    <div className="flex gap-2.5">
      <button
        type="submit"
        disabled={saving}
        className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[#fff] disabled:opacity-50 transition-colors"
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
      <div>
        <label className={labelCls}>Категория *</label>
        <Select
          value={categoryId}
          onChange={(v) => { setCategoryId(v ? Number(v) : ""); clearFieldError("category_id"); }}
          placeholder="Выберите категорию"
          options={(categories ?? []).map((c) => ({
            value: String(c.category_id),
            label: c.title,
            emoji: c.emoji ?? undefined,
          }))}
          footer={
            <button
              type="button"
              onClick={() => { setShowCatCreate(true); setTimeout(() => newCatTitleRef.current?.focus(), 50); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-indigo-500 hover:text-indigo-400 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
            >
              <Plus size={13} />
              Создать категорию
            </button>
          }
        />
        {fieldErrors.category_id && <p className={errTextCls}>{fieldErrors.category_id}</p>}

        {/* Inline-форма создания */}
        {showCatCreate && (
          <div className="mt-2 flex items-center gap-2 p-2.5 rounded-xl border border-indigo-500/30 bg-indigo-500/5">
            <input
              value={newCatEmoji}
              onChange={(e) => setNewCatEmoji(e.target.value)}
              placeholder="🎯"
              maxLength={2}
              className="w-10 h-9 text-center text-base rounded-lg border border-slate-300 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500"
            />
            <input
              ref={newCatTitleRef}
              value={newCatTitle}
              onChange={(e) => setNewCatTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); handleCreateCategory(); }
                if (e.key === "Escape") { setShowCatCreate(false); setNewCatTitle(""); setNewCatEmoji(""); }
              }}
              placeholder="Название категории"
              className={`${inputCls} flex-1`}
            />
            <button
              type="button"
              onClick={handleCreateCategory}
              disabled={catCreating || !newCatTitle.trim()}
              className="h-9 w-9 flex items-center justify-center rounded-lg bg-indigo-600 text-[#fff] hover:bg-indigo-500 disabled:opacity-50 transition-colors shrink-0"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={() => { setShowCatCreate(false); setNewCatTitle(""); setNewCatEmoji(""); }}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-300 dark:border-white/[0.08] text-slate-400 hover:text-slate-600 dark:hover:text-white/60 transition-colors shrink-0"
            >
              <XIcon size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Год рождения (только для категории День рождения) ── */}
      {isBirthdayCategory && (
        <div>
          <label className={labelCls}>Год рождения</label>
          <input
            type="number"
            min={1900}
            max={new Date().getFullYear()}
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            placeholder="Например, 1990"
            className={inputCls}
          />
          <p className="text-[11px] mt-1" style={{ color: "var(--t-faint)" }}>
            Если указан — будет показываться возраст и юбилеи
          </p>
        </div>
      )}

      {/* ── Дата * ── */}
      <div>
        <label className={labelCls}>Дата *</label>
        <DateInput
          value={startDate}
          onChange={(v) => {
            setStartDate(v);
            clearFieldError("start_date");
            if (repeat === "weekly" && recWeekdays.length <= 1) {
              const code = dateToWeekdayCode(v);
              if (code) { setRecWeekdays([code]); clearFieldError("rec_weekdays"); }
            }
          }}
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
            <TimeInput
              value={startTime}
              onChange={(v) => { setStartTime(v); clearFieldError("start_time"); }}
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
              <DateInput
                value={endDate}
                onChange={(v) => { setEndDate(v); clearFieldError("end_date"); }}
                min={startDate || undefined}
              />
              {fieldErrors.end_date && <p className={errTextCls}>{fieldErrors.end_date}</p>}
            </div>
            <div>
              <label className={labelCls}>Время окончания</label>
              <TimeInput
                value={endTime}
                onChange={setEndTime}
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
                onChange={(v) => {
                  setRepeat(v);
                  if (v === "weekly" && recWeekdays.length === 0) {
                    const code = dateToWeekdayCode(startDate);
                    if (code) setRecWeekdays([code]);
                  }
                }}
                placeholder="Не повторяется"
                options={REPEAT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              />
            </div>

            {/* Повторение: дни недели (weekly) */}
            {repeat === "weekly" && (
              <div>
                <label className={labelCls}>Дни недели *</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {WEEKDAYS.map((d) => {
                    const active = recWeekdays.includes(d.value);
                    return (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => {
                          setRecWeekdays((prev) =>
                            active ? prev.filter((x) => x !== d.value) : [...prev, d.value],
                          );
                          clearFieldError("rec_weekdays");
                        }}
                        className={clsx(
                          "px-2.5 py-1 rounded-lg text-[12px] font-medium border transition-colors",
                          active
                            ? "bg-indigo-600 border-indigo-500 text-[#fff]"
                            : "bg-white/[0.05] border-white/[0.08] text-white/50 hover:bg-white/[0.08]",
                          fieldErrors.rec_weekdays && !active && "border-red-500/50",
                        )}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>
                {fieldErrors.rec_weekdays && <p className={errTextCls}>{fieldErrors.rec_weekdays}</p>}
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
                <DateInput
                  value={untilDate}
                  onChange={setUntilDate}
                  min={startDate || undefined}
                />
              </div>
            )}

            {/* Напоминания */}
            <div>
              <label className={labelCls}>Напоминания</label>
              <div className="flex flex-wrap gap-1.5">
                {stagedReminders.map((r, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-[12px] font-medium"
                  >
                    {r.label}
                    <button
                      type="button"
                      onClick={() => setStagedReminders(stagedReminders.filter((_, i) => i !== idx))}
                      className="hover:text-red-500 transition-colors"
                    >
                      ×
                    </button>
                  </span>
                ))}

                {showReminderPicker ? (
                  <div className="flex items-center gap-1 flex-wrap">
                    {hasTime ? (
                      EVENT_OFFSET_PRESETS
                        .filter((p) => !stagedReminders.some((r) => r.mode === "offset" && r.offset_minutes === p.minutes))
                        .map((p) => (
                          <button
                            key={p.minutes}
                            type="button"
                            onClick={() => {
                              setStagedReminders([...stagedReminders, { mode: "offset", offset_minutes: p.minutes, label: p.label }]);
                              setShowReminderPicker(false);
                            }}
                            className="px-2.5 py-1 text-[12px] font-medium rounded-lg bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 transition-colors"
                          >
                            {p.label}
                          </button>
                        ))
                    ) : (
                      EVENT_FIXED_TIME_PRESETS
                        .filter((t) => !stagedReminders.some((r) => r.mode === "fixed_time" && r.fixed_time === t))
                        .map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              setStagedReminders([...stagedReminders, { mode: "fixed_time", fixed_time: t, label: `в ${t}` }]);
                              setShowReminderPicker(false);
                            }}
                            className="px-2.5 py-1 text-[12px] font-medium rounded-lg bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 transition-colors"
                          >
                            {t}
                          </button>
                        ))
                    )}
                    <button
                      type="button"
                      onClick={() => setShowReminderPicker(false)}
                      className="px-2 py-1 text-[11px] font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                      style={{ color: "var(--t-faint)" }}
                    >
                      Отмена
                    </button>
                  </div>
                ) : (
                  stagedReminders.length < 5 && (
                    <button
                      type="button"
                      onClick={() => setShowReminderPicker(true)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-slate-300 dark:border-white/[0.12] hover:border-indigo-400 text-[12px] font-medium transition-colors"
                      style={{ color: "var(--t-muted)" }}
                    >
                      + Добавить
                    </button>
                  )
                )}
              </div>
              <p className="text-[11px] mt-1.5" style={{ color: "var(--t-faint)" }}>
                {hasTime ? "За сколько до начала события" : "В какое время напомнить в день события"}
              </p>
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

            {/* Задачи к событию */}
            <div>
              <label className={labelCls}>Задачи к событию</label>
              <div className="space-y-1.5">
                {stagedTemplates.map((tpl, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate" style={{ color: "var(--t-secondary)" }}>{tpl.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>
                          {tpl.days_before === 0 ? "в день события" : `за ${tpl.days_before} дн.`}
                        </span>
                        {tpl.reminder_offset_minutes !== null && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-400/80">
                            <Bell size={9} />
                            {tpl.reminder_offset_minutes >= 1440
                              ? `за ${tpl.reminder_offset_minutes / 1440} дн.`
                              : `за ${tpl.reminder_offset_minutes} мин`}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStagedTemplates((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-white/30 hover:text-red-400 transition-colors"
                    >
                      <XIcon size={13} />
                    </button>
                  </div>
                ))}

                {showTemplateAdd ? (
                  <div className="p-3 rounded-xl border border-indigo-500/25 bg-indigo-500/[0.05] space-y-2">
                    <input
                      autoFocus
                      value={tplTitle}
                      onChange={(e) => setTplTitle(e.target.value)}
                      placeholder="Название задачи"
                      className="w-full px-3 h-9 text-[13px] rounded-lg border border-white/[0.08] bg-white/[0.05] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60"
                      onKeyDown={(e) => { if (e.key === "Escape") setShowTemplateAdd(false); }}
                    />
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>за</span>
                      <input
                        type="number"
                        min={0}
                        max={365}
                        value={tplDays}
                        onChange={(e) => setTplDays(e.target.value)}
                        className="w-14 px-2 h-8 text-[13px] text-center rounded-lg border border-white/[0.08] bg-white/[0.05] text-white/85 focus:outline-none focus:border-indigo-500/60"
                      />
                      <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>дней до события</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {([null, 60, 180, 1440, 2880] as (number | null)[]).map((v) => (
                        <button
                          key={String(v)}
                          type="button"
                          onClick={() => setTplReminder(v)}
                          className={clsx(
                            "px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors",
                            tplReminder === v
                              ? "bg-indigo-600 border-indigo-500 text-white"
                              : "bg-white/[0.04] border-white/[0.08] text-white/55 hover:bg-white/[0.07]"
                          )}
                        >
                          {v === null ? "Без уведомления" : v >= 1440 ? `За ${v / 1440} дн.` : `За ${v} мин`}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const t = tplTitle.trim();
                          const d = parseInt(tplDays, 10);
                          if (!t || isNaN(d) || d < 0) return;
                          setStagedTemplates((prev) => [...prev, { title: t, days_before: d, reminder_offset_minutes: tplReminder }]);
                          setTplTitle(""); setTplDays("7"); setTplReminder(null); setShowTemplateAdd(false);
                        }}
                        disabled={!tplTitle.trim()}
                        className="px-3 py-1.5 text-[12px] font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
                      >
                        Добавить
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowTemplateAdd(false); setTplTitle(""); setTplDays("7"); setTplReminder(null); }}
                        className="px-3 py-1.5 text-[12px] font-medium rounded-lg bg-white/[0.05] border border-white/[0.08] text-white/55 hover:bg-white/[0.08] transition-colors"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowTemplateAdd(true)}
                    className="flex items-center gap-1.5 w-full px-2.5 py-1.5 rounded-xl text-[12px] font-medium border border-dashed border-white/[0.10] hover:border-indigo-500/30 hover:bg-indigo-500/[0.04] transition-colors"
                    style={{ color: "var(--t-faint)" }}
                  >
                    <Plus size={12} />
                    Добавить задачу к событию
                  </button>
                )}
              </div>
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

"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkCategoryItem } from "@/types/api";
import { api } from "@/lib/api";
import { Select } from "@/components/ui/Select";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { RichNoteEditor } from "@/components/ui/RichNoteEditor";
import { FormRow } from "@/components/ui/FormRow";
import { Tag, X } from "lucide-react";
import { CreateTaskRequestSchema } from "@/schemas/api.generated";
import {
  validateWithSchema, mergeErrors, parseBackendErrors,
  type FieldErrors,
} from "@/lib/formErrors";
import { Button } from "@/components/primitives/Button";
import { Chip } from "@/components/primitives/Chip";
import { Input } from "@/components/primitives/Input";

interface Props {
  onClose: () => void;
  initialDate?: string; // ISO date YYYY-MM-DD
  /** Pre-fill list_id (e.g., when opening from a trip dashboard). */
  initialListId?: number | null;
}

interface TaskPreset {
  id: number;
  name: string;
  title_template: string;
  description_template: string | null;
  default_task_category_id: number | null;
}

interface ReminderPreset {
  id: number;
  label: string;
  offset_minutes: number;
}

interface ReminderEntry {
  offset_minutes: number;
}

interface TripListOption {
  id: number;
  title: string;
  list_type: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MODES = [
  { value: "once", label: "Один раз" },
  { value: "recurring", label: "Повторяется" },
];

const DUE_KINDS = [
  { value: "NONE", label: "Без срока" },
  { value: "DATE", label: "Дата" },
  { value: "DATETIME", label: "Дата и время" },
  { value: "WINDOW", label: "Окно" },
];

const FREQS = [
  { value: "DAILY", label: "Ежедневно" },
  { value: "WEEKLY", label: "Еженедельно" },
  { value: "MONTHLY", label: "Ежемесячно" },
  { value: "YEARLY", label: "Ежегодно" },
];

const WEEKDAYS = [
  { value: "MO", label: "Пн" },
  { value: "TU", label: "Вт" },
  { value: "WE", label: "Ср" },
  { value: "TH", label: "Чт" },
  { value: "FR", label: "Пт" },
  { value: "SA", label: "Сб" },
  { value: "SU", label: "Вс" },
];

// ── Style constants ────────────────────────────────────────────────────────

const chipActiveCls =
  "bg-indigo-600 border-indigo-500 text-white";
const chipInactiveCls =
  "bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/72 hover:bg-slate-50 dark:hover:bg-white/[0.05]";
const chipBaseCls =
  "py-2 text-[11px] md:text-xs font-medium rounded-xl border transition-colors";

// ── Today's date helper ────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Component ──────────────────────────────────────────────────────────────

export function CreateTaskModal({ onClose, initialDate, initialListId }: Props) {
  const qc = useQueryClient();
  const formRef = useRef<HTMLFormElement | null>(null);

  // Mode
  const [mode, setMode] = useState<"once" | "recurring">("once");

  // Common fields
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [listId, setListId] = useState<number | "">(initialListId ?? "");
  const [note, setNote] = useState("");

  // Preset dropdown visibility (compact, inline)
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);

  // One-time fields
  const [dueKind, setDueKind] = useState(initialDate ? "DATE" : "NONE");
  const [dueDate, setDueDate] = useState(initialDate ?? "");
  const [dueTime, setDueTime] = useState("");
  const [dueStartTime, setDueStartTime] = useState("");
  const [dueEndTime, setDueEndTime] = useState("");

  // Multi-dates
  const [multiDatesEnabled, setMultiDatesEnabled] = useState(false);
  const [multiDateInput, setMultiDateInput] = useState("");
  const [multiDates, setMultiDates] = useState<string[]>([]);

  // Reminders
  const [showReminders, setShowReminders] = useState(false);
  const [reminders, setReminders] = useState<ReminderEntry[]>([]);
  const [selectedReminderPreset, setSelectedReminderPreset] = useState<string>("");

  // Expense link
  const [showExpense, setShowExpense] = useState(false);
  const [requiresExpense, setRequiresExpense] = useState(false);
  const [expenseCategoryId, setExpenseCategoryId] = useState<number | "">("");
  const [expenseAmount, setExpenseAmount] = useState("");

  // Recurring fields
  const [freq, setFreq] = useState("DAILY");
  const [interval, setInterval] = useState<number>(1);
  const [weekdays, setWeekdays] = useState<string[]>([]);
  const [byMonthday, setByMonthday] = useState<string>("");
  const [startDate, setStartDate] = useState(todayISO());
  const [activeUntil, setActiveUntil] = useState("");

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────

  const { data: categories } = useQuery<WorkCategoryItem[]>({
    queryKey: ["work-categories"],
    queryFn: () =>
      api.get<WorkCategoryItem[]>("/api/v2/work-categories"),
    staleTime: 5 * 60_000,
  });

  const { data: presets } = useQuery<TaskPreset[]>({
    queryKey: ["task-presets"],
    queryFn: () => api.get<TaskPreset[]>("/api/v2/task-presets"),
    staleTime: 60_000,
  });

  const { data: reminderPresets } = useQuery<ReminderPreset[]>({
    queryKey: ["reminder-presets"],
    queryFn: () => api.get<ReminderPreset[]>("/api/v2/reminder-presets"),
    staleTime: 10 * 60_000,
  });

  const { data: tripLists } = useQuery<TripListOption[]>({
    queryKey: ["shared-lists", "trip"],
    queryFn: async () => {
      const all = await api.get<TripListOption[]>("/api/v2/lists");
      return all.filter((l) => l.list_type === "trip");
    },
    staleTime: 60_000,
  });

  // ── Helpers ────────────────────────────────────────────────────────────

  function clearFieldError(field: string) {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function handlePresetSelect(presetId: string) {
    setPresetMenuOpen(false);
    if (!presetId || !presets) return;
    const preset = presets.find((p) => String(p.id) === presetId);
    if (!preset) return;
    setTitle(preset.title_template);
    if (preset.description_template) {
      setNote(preset.description_template);
    }
    if (preset.default_task_category_id) {
      setCategoryId(preset.default_task_category_id);
    }
    clearFieldError("title");
  }

  function handleDueKindChange(kind: string) {
    setDueKind(kind);
    if (kind === "NONE") {
      setDueDate("");
      setDueTime("");
      setDueStartTime("");
      setDueEndTime("");
    }
    clearFieldError("due_date");
    clearFieldError("due_time");
    clearFieldError("due_start_time");
    clearFieldError("due_end_time");
  }

  function addMultiDate() {
    if (!multiDateInput) return;
    if (!multiDates.includes(multiDateInput)) {
      setMultiDates((prev) => [...prev, multiDateInput].sort());
    }
    setMultiDateInput("");
  }

  function removeMultiDate(date: string) {
    setMultiDates((prev) => prev.filter((d) => d !== date));
  }

  function addReminder() {
    if (!selectedReminderPreset || !reminderPresets) return;
    const preset = reminderPresets.find(
      (p) => String(p.id) === selectedReminderPreset,
    );
    if (!preset) return;
    const alreadyAdded = reminders.some(
      (r) => r.offset_minutes === preset.offset_minutes,
    );
    if (!alreadyAdded) {
      setReminders((prev) => [...prev, { offset_minutes: preset.offset_minutes }]);
    }
    setSelectedReminderPreset("");
  }

  function removeReminder(offsetMinutes: number) {
    setReminders((prev) => prev.filter((r) => r.offset_minutes !== offsetMinutes));
  }

  function toggleWeekday(day: string) {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
    clearFieldError("by_weekday");
  }

  // ── Payload builder ────────────────────────────────────────────────────

  function buildPayload() {
    if (mode === "recurring") {
      return {
        mode: "recurring",
        title: title.trim(),
        note: note.trim() || null,
        category_id: categoryId || null,
        list_id: listId || null,
        freq,
        interval,
        start_date: startDate || null,
        active_until: activeUntil || null,
        by_weekday: freq === "WEEKLY" ? weekdays.join(",") : null,
        by_monthday: freq === "MONTHLY" ? Number(byMonthday) || null : null,
      };
    }
    return {
      mode: "once",
      title: title.trim(),
      note: note.trim() || null,
      category_id: categoryId || null,
      list_id: listId || null,
      due_kind: dueKind,
      due_date: dueDate || null,
      due_time: dueKind === "DATETIME" ? dueTime || null : null,
      due_start_time: dueKind === "WINDOW" ? dueStartTime || null : null,
      due_end_time: dueKind === "WINDOW" ? dueEndTime || null : null,
      reminders: reminders.length > 0 ? reminders : null,
      multi_dates: multiDates.length > 0 ? multiDates.join(",") : null,
      requires_expense: requiresExpense,
      suggested_expense_category_id:
        requiresExpense && expenseCategoryId ? expenseCategoryId : null,
      suggested_amount:
        requiresExpense && expenseAmount ? expenseAmount : null,
    };
  }

  // ── Validation ─────────────────────────────────────────────────────────

  function validate(): boolean {
    const payload = buildPayload();
    const zodErrs = validateWithSchema(CreateTaskRequestSchema, payload);
    const custom: FieldErrors = {};

    if (!title.trim()) custom.title = "Введите название задачи";

    if (mode === "once") {
      if (dueKind !== "NONE" && !dueDate) {
        custom.due_date = "Укажите дату";
      }
      if (dueKind === "DATETIME") {
        if (!dueTime) custom.due_time = "Укажите время";
      }
      if (dueKind === "WINDOW") {
        if (!dueStartTime) custom.due_start_time = "Укажите время начала";
        if (!dueEndTime) custom.due_end_time = "Укажите время окончания";
        if (dueStartTime && dueEndTime && dueStartTime >= dueEndTime) {
          custom.due_end_time = "Время окончания должно быть позже начала";
        }
      }
    } else {
      if (!freq) custom.freq = "Выберите частоту";
      if (freq === "WEEKLY" && weekdays.length === 0) {
        custom.by_weekday = "Выберите хотя бы один день недели";
      }
      if (freq === "MONTHLY") {
        const day = Number(byMonthday);
        if (!byMonthday || isNaN(day) || day < 1 || day > 31) {
          custom.by_monthday = "Укажите день месяца от 1 до 31";
        }
      }
      if (!startDate) custom.start_date = "Укажите дату начала";
    }

    const merged = mergeErrors(zodErrs, custom);
    setFieldErrors(merged);
    setError(null);
    return Object.keys(merged).length === 0;
  }

  // ── Submit ─────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setError(null);
    try {
      await api.post("/api/v2/tasks", buildPayload());
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      if (listId) {
        qc.invalidateQueries({ queryKey: ["list-tasks", Number(listId)] });
        qc.invalidateQueries({ queryKey: ["list-summary", Number(listId)] });
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      const match = msg.match(/API error (\d+): ([\s\S]*)/);
      if (match) {
        try {
          const parsed = parseBackendErrors(parseInt(match[1]), JSON.parse(match[2]));
          if (parsed.fieldErrors) { setFieldErrors(parsed.fieldErrors); return; }
          setError(parsed.message ?? "Ошибка при создании задачи");
        } catch { setError("Ошибка при создании задачи"); }
      } else {
        setError("Не удалось подключиться к серверу");
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Ctrl/Cmd + Enter submit ────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (formRef.current) {
          formRef.current.requestSubmit();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── Derived flags ──────────────────────────────────────────────────────

  const showDateFields = dueKind !== "NONE";
  const showTimeField = dueKind === "DATETIME";
  const showWindowFields = dueKind === "WINDOW";
  const showReminderSection = dueKind === "DATETIME" || dueKind === "WINDOW";

  // ── Footer ─────────────────────────────────────────────────────────────

  const footer = (
    <div className="flex gap-2.5">
      <Button
        type="submit"
        variant="primary"
        size="md"
        loading={saving}
        fullWidth
      >
        Создать задачу
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={onClose}
        className="hidden md:inline-flex"
      >
        Отмена
      </Button>
    </div>
  );

  // ── Form node (we'll wrap form ref via custom rendering) ───────────────

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Создать задачу"
      footer={footer}
      onSubmit={(e) => {
        // BottomSheet uses our handler. Capture the form ref for Ctrl+Enter.
        const formEl = (e.target as HTMLFormElement) ?? null;
        if (formEl && !formRef.current) formRef.current = formEl;
        handleSubmit(e);
      }}
    >
      <div
        className="space-y-3 md:space-y-4"
        ref={(el) => {
          // Resolve form ref from nearest ancestor
          if (el && !formRef.current) {
            const f = el.closest("form");
            if (f instanceof HTMLFormElement) formRef.current = f;
          }
        }}
      >
        {/* ── Mode toggle ── */}
        <FormRow label="Режим">
          <div className="flex gap-1.5">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value as "once" | "recurring")}
                className={`flex-1 ${chipBaseCls} ${
                  mode === m.value ? chipActiveCls : chipInactiveCls
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </FormRow>

        {/* ── Title + inline preset link ── */}
        <FormRow label="Название" required error={fieldErrors.title}>
          <Input
            type="text"
            value={title}
            onChange={(e) => { setTitle(e.target.value); clearFieldError("title"); }}
            placeholder="Название задачи"
            aria-invalid={Boolean(fieldErrors.title) || undefined}
            autoFocus
          />
          {presets && presets.length > 0 && (
            <div className="relative mt-1.5">
              <button
                type="button"
                onClick={() => setPresetMenuOpen((v) => !v)}
                className="text-[12px] underline text-slate-500 hover:text-slate-700 dark:text-white/55 dark:hover:text-white/80"
              >
                Из шаблона
              </button>
              {presetMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setPresetMenuOpen(false)}
                  />
                  <div className="absolute z-50 left-0 mt-1 min-w-[220px] max-h-[260px] overflow-y-auto rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1b2230] shadow-xl py-1">
                    {presets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handlePresetSelect(String(p.id))}
                        className="w-full text-left px-3 py-2 text-[13px] text-slate-700 dark:text-white/80 hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </FormRow>

        {/* ── Category — chip buttons ── */}
        {categories && categories.length > 0 && (
          <FormRow label="Категория">
            <div className="flex flex-wrap gap-1.5">
              <Chip
                label={
                  <span className="inline-flex items-center gap-1">
                    <Tag size={11} /> Без категории
                  </span>
                }
                selected={categoryId === ""}
                variant="accent"
                size="md"
                onClick={() => { setCategoryId(""); clearFieldError("category_id"); }}
              />
              {categories.map((c) => (
                <Chip
                  key={c.category_id}
                  label={c.title}
                  emoji={c.emoji ?? undefined}
                  selected={categoryId === c.category_id}
                  variant="accent"
                  size="md"
                  onClick={() => { setCategoryId(c.category_id); clearFieldError("category_id"); }}
                />
              ))}
            </div>
          </FormRow>
        )}

        {/* ── Trip list link ── */}
        {tripLists && tripLists.length > 0 && (
          <FormRow label="Поездка" hint="Опционально — привязать к списку поездки">
            <Select
              value={listId}
              onChange={(v) => setListId(v ? Number(v) : "")}
              placeholder="— без списка —"
              options={[
                { value: "", label: "— без списка —" },
                ...tripLists.map((l) => ({ value: String(l.id), label: l.title })),
              ]}
            />
          </FormRow>
        )}

        {/* ════════════════════════════════════════════════════════
            ONE-TIME MODE FIELDS
            ════════════════════════════════════════════════════════ */}
        {mode === "once" && (
          <>
            {/* Due kind chips */}
            <FormRow label="Когда">
              <div className="flex gap-1.5 flex-wrap">
                {DUE_KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => handleDueKindChange(k.value)}
                    className={`flex-1 min-w-[74px] ${chipBaseCls} ${
                      dueKind === k.value ? chipActiveCls : chipInactiveCls
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </FormRow>

            {/* Date field */}
            {showDateFields && (
              <FormRow label="Дата" required error={fieldErrors.due_date}>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => { setDueDate(e.target.value); clearFieldError("due_date"); }}
                  aria-invalid={Boolean(fieldErrors.due_date) || undefined}
                />
              </FormRow>
            )}

            {/* Single time with clear button */}
            {showTimeField && (
              <FormRow label="Время" required error={fieldErrors.due_time}>
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={dueTime}
                    onChange={(e) => { setDueTime(e.target.value); clearFieldError("due_time"); }}
                    aria-invalid={Boolean(fieldErrors.due_time) || undefined}
                    className="flex-1"
                  />
                  {dueTime && (
                    <button
                      type="button"
                      onClick={() => { setDueTime(""); clearFieldError("due_time"); }}
                      className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/55 hover:text-slate-700 dark:hover:text-white/80 transition-colors"
                      aria-label="Очистить время"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </FormRow>
            )}

            {/* Window time fields with clear */}
            {showWindowFields && (
              <>
                <FormRow label="С" required error={fieldErrors.due_start_time}>
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={dueStartTime}
                      onChange={(e) => { setDueStartTime(e.target.value); clearFieldError("due_start_time"); }}
                      aria-invalid={Boolean(fieldErrors.due_start_time) || undefined}
                      className="flex-1"
                    />
                    {dueStartTime && (
                      <button
                        type="button"
                        onClick={() => { setDueStartTime(""); clearFieldError("due_start_time"); }}
                        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/55 hover:text-slate-700 dark:hover:text-white/80 transition-colors"
                        aria-label="Очистить время"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </FormRow>
                <FormRow label="До" required error={fieldErrors.due_end_time}>
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={dueEndTime}
                      onChange={(e) => { setDueEndTime(e.target.value); clearFieldError("due_end_time"); }}
                      aria-invalid={Boolean(fieldErrors.due_end_time) || undefined}
                      className="flex-1"
                    />
                    {dueEndTime && (
                      <button
                        type="button"
                        onClick={() => { setDueEndTime(""); clearFieldError("due_end_time"); }}
                        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/55 hover:text-slate-700 dark:hover:text-white/80 transition-colors"
                        aria-label="Очистить время"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </FormRow>
              </>
            )}

            {/* Multi-dates */}
            <FormRow label="Несколько дат">
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={multiDatesEnabled}
                    onChange={(e) => {
                      setMultiDatesEnabled(e.target.checked);
                      if (!e.target.checked) setMultiDates([]);
                    }}
                    className="w-4 h-4 rounded accent-indigo-500"
                  />
                  <span className="text-[12px] md:text-[13px] text-slate-600 dark:text-white/72">
                    Создать на несколько дат
                  </span>
                </label>

                {multiDatesEnabled && (
                  <div className="space-y-2 pl-1">
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={multiDateInput}
                        onChange={(e) => setMultiDateInput(e.target.value)}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={addMultiDate}
                        disabled={!multiDateInput}
                        className="px-3 py-1 text-xs font-medium rounded-xl bg-indigo-600/80 hover:bg-indigo-500/80 text-white disabled:opacity-40 transition-colors whitespace-nowrap"
                      >
                        Добавить
                      </button>
                    </div>
                    {multiDates.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {multiDates.map((d) => (
                          <span
                            key={d}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-[11px] text-indigo-700 dark:text-indigo-300"
                          >
                            {d}
                            <button
                              type="button"
                              onClick={() => removeMultiDate(d)}
                              className="text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-white transition-colors leading-none"
                              aria-label="Удалить дату"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </FormRow>

            {/* Reminders (collapsible, only for DATETIME/WINDOW) */}
            {showReminderSection && (
              <FormRow label="Напоминания">
                <div>
                  <button
                    type="button"
                    onClick={() => setShowReminders((v) => !v)}
                    className="text-[12px] font-medium text-slate-600 dark:text-white/65 hover:text-slate-800 dark:hover:text-white/80 transition-colors"
                  >
                    {showReminders ? "▾ Скрыть" : "▸ Настроить"}
                    {reminders.length > 0 && ` (${reminders.length})`}
                  </button>

                  {showReminders && (
                    <div className="mt-2 space-y-2">
                      {reminderPresets && reminderPresets.length > 0 && (
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <Select
                              value={selectedReminderPreset}
                              onChange={(v) => setSelectedReminderPreset(v)}
                              placeholder="— выберите напоминание —"
                              options={[
                                { value: "", label: "— выберите напоминание —" },
                                ...reminderPresets.map((p) => ({ value: String(p.id), label: p.label })),
                              ]}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={addReminder}
                            disabled={!selectedReminderPreset}
                            className="px-3 py-1 text-xs font-medium rounded-xl bg-indigo-600/80 hover:bg-indigo-500/80 text-white disabled:opacity-40 transition-colors whitespace-nowrap"
                          >
                            Добавить
                          </button>
                        </div>
                      )}
                      {reminders.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {reminders.map((r) => {
                            const preset = reminderPresets?.find(
                              (p) => p.offset_minutes === r.offset_minutes,
                            );
                            const label = preset
                              ? preset.label
                              : `${Math.abs(r.offset_minutes)} мин.`;
                            return (
                              <span
                                key={r.offset_minutes}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-600/20 border border-amber-500/30 text-[11px] text-amber-700 dark:text-amber-300"
                              >
                                {label}
                                <button
                                  type="button"
                                  onClick={() => removeReminder(r.offset_minutes)}
                                  className="text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-white transition-colors leading-none"
                                  aria-label="Удалить напоминание"
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </FormRow>
            )}

            {/* Expense link (collapsible) */}
            <FormRow label="Расход">
              <div>
                <button
                  type="button"
                  onClick={() => setShowExpense((v) => !v)}
                  className="text-[12px] font-medium text-slate-600 dark:text-white/65 hover:text-slate-800 dark:hover:text-white/80 transition-colors"
                >
                  {showExpense ? "▾ Скрыть привязку" : "▸ Связать с расходом"}
                </button>

                {showExpense && (
                  <div className="mt-2 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={requiresExpense}
                        onChange={(e) => setRequiresExpense(e.target.checked)}
                        className="w-4 h-4 rounded accent-indigo-500"
                      />
                      <span className="text-[12px] md:text-[13px] text-slate-600 dark:text-white/72">
                        При выполнении создать расход
                      </span>
                    </label>

                    {requiresExpense && (
                      <>
                        {categories && categories.length > 0 && (
                          <div>
                            <Select
                              value={expenseCategoryId}
                              onChange={(v) =>
                                setExpenseCategoryId(v ? Number(v) : "")
                              }
                              placeholder="— категория расхода —"
                              options={[
                                { value: "", label: "— категория расхода —" },
                                ...categories.map((c) => ({
                                  value: String(c.category_id),
                                  label: c.title,
                                  emoji: c.emoji ?? undefined,
                                })),
                              ]}
                            />
                          </div>
                        )}
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={expenseAmount}
                          onChange={(e) => setExpenseAmount(e.target.value)}
                          placeholder="Сумма (0.00)"
                          tabular
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            </FormRow>
          </>
        )}

        {/* ════════════════════════════════════════════════════════
            RECURRING MODE FIELDS
            ════════════════════════════════════════════════════════ */}
        {mode === "recurring" && (
          <>
            {/* Frequency chips */}
            <FormRow label="Частота" error={fieldErrors.freq}>
              <div className="flex gap-1.5 flex-wrap">
                {FREQS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => { setFreq(f.value); clearFieldError("freq"); clearFieldError("by_weekday"); clearFieldError("by_monthday"); }}
                    className={`flex-1 min-w-[88px] ${chipBaseCls} ${
                      freq === f.value ? chipActiveCls : chipInactiveCls
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </FormRow>

            {/* Interval */}
            <FormRow label="Интервал">
              <Input
                type="number"
                min={1}
                value={interval}
                onChange={(e) => setInterval(Math.max(1, Number(e.target.value)))}
              />
            </FormRow>

            {/* Weekday chips (WEEKLY only) */}
            {freq === "WEEKLY" && (
              <FormRow label="Дни недели" required error={fieldErrors.by_weekday}>
                <div className="flex gap-1.5 flex-wrap">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleWeekday(d.value)}
                      className={`flex-1 min-w-[40px] ${chipBaseCls} ${
                        weekdays.includes(d.value) ? chipActiveCls : chipInactiveCls
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </FormRow>
            )}

            {/* Monthday (MONTHLY only) */}
            {freq === "MONTHLY" && (
              <FormRow label="День месяца" required error={fieldErrors.by_monthday}>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={byMonthday}
                  onChange={(e) => { setByMonthday(e.target.value); clearFieldError("by_monthday"); }}
                  placeholder="1–31"
                  aria-invalid={Boolean(fieldErrors.by_monthday) || undefined}
                />
              </FormRow>
            )}

            {/* Start date */}
            <FormRow label="Дата начала" required error={fieldErrors.start_date}>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); clearFieldError("start_date"); }}
                aria-invalid={Boolean(fieldErrors.start_date) || undefined}
              />
            </FormRow>

            {/* Active until */}
            <FormRow label="Активно до" hint="Оставьте пустым для бессрочного действия">
              <Input
                type="date"
                value={activeUntil}
                onChange={(e) => setActiveUntil(e.target.value)}
                min={startDate || undefined}
              />
            </FormRow>
          </>
        )}

        {/* ── Note (always visible) ── */}
        <FormRow label="Заметка">
          <RichNoteEditor
            value={note}
            onChange={setNote}
            placeholder="Опишите задачу…"
            minHeight={100}
          />
        </FormRow>

        {/* ── Global error ── */}
        {error && (
          <p className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3 py-2.5">
            {error}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

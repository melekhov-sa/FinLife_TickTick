"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkCategoryItem } from "@/types/api";
import { api } from "@/lib/api";
import { Select } from "@/components/ui/Select";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CreateTaskRequestSchema } from "@/schemas/api.generated";
import {
  validateWithSchema, mergeErrors, parseBackendErrors,
  inputErrorBorder, errTextCls, type FieldErrors,
} from "@/lib/formErrors";

interface Props {
  onClose: () => void;
  initialDate?: string; // ISO date YYYY-MM-DD
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

const inputCls =
  "w-full px-3 h-10 text-base rounded-xl border focus:outline-none focus:border-indigo-500/60 transition-colors bg-white dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.08] text-slate-800 dark:text-white/85 placeholder-slate-400 dark:placeholder-white/25";
const labelCls =
  "block text-[11px] md:text-xs font-medium uppercase tracking-wider mb-1.5 text-slate-500 dark:text-white/72";
const chipActiveCls =
  "bg-indigo-600 border-indigo-500 text-white";
const chipInactiveCls =
  "bg-white/[0.03] border-white/[0.08] text-white/72 hover:text-white/65 hover:bg-white/[0.05]";
const chipBaseCls =
  "py-2 text-[11px] md:text-xs font-medium rounded-xl border transition-colors";

// ── Today's date helper ────────────────────────────────────────────────────

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

// ── Component ──────────────────────────────────────────────────────────────

export function CreateTaskModal({ onClose, initialDate }: Props) {
  const qc = useQueryClient();

  // Mode
  const [mode, setMode] = useState<"once" | "recurring">("once");

  // Common fields
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

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
    if (!presetId || !presets) return;
    const preset = presets.find((p) => String(p.id) === presetId);
    if (!preset) return;
    setTitle(preset.title_template);
    if (preset.description_template) {
      setNote(preset.description_template);
      setShowNote(true);
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

  // ── Derived flags ──────────────────────────────────────────────────────

  const showDateFields = dueKind !== "NONE";
  const showTimeField = dueKind === "DATETIME";
  const showWindowFields = dueKind === "WINDOW";
  const showReminderSection = dueKind === "DATETIME" || dueKind === "WINDOW";

  // ── Footer ─────────────────────────────────────────────────────────────

  const footer = (
    <div className="flex gap-2.5">
      <button
        type="submit"
        disabled={saving}
        className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
      >
        {saving ? "Создаём…" : "Создать задачу"}
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
      title="Создать задачу"
      footer={footer}
      onSubmit={handleSubmit}
    >
      {/* ── Mode toggle ── */}
      <div>
        <label className={labelCls}>Режим</label>
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
      </div>

      {/* ── Preset template ── */}
      {presets && presets.length > 0 && (
        <div>
          <label className={labelCls}>Шаблон</label>
          <Select
            value=""
            onChange={(v) => handlePresetSelect(v)}
            placeholder="— Шаблон —"
            options={[
              { value: "", label: "— Шаблон —" },
              ...presets.map((p) => ({ value: String(p.id), label: p.name })),
            ]}
          />
        </div>
      )}

      {/* ── Title ── */}
      <div>
        <label className={labelCls}>Название *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); clearFieldError("title"); }}
          placeholder="Название задачи"
          className={`${inputCls} h-10 ${fieldErrors.title ? inputErrorBorder : ""}`}
          autoFocus
        />
        {fieldErrors.title && <p className={errTextCls}>{fieldErrors.title}</p>}
      </div>

      {/* ── Category ── */}
      {categories && categories.length > 0 && (
        <div>
          <label className={labelCls}>Категория</label>
          <Select
            value={categoryId}
            onChange={(v) => { setCategoryId(v ? Number(v) : ""); clearFieldError("category_id"); }}
            placeholder="— без категории —"
            options={[
              { value: "", label: "— без категории —" },
              ...categories.map((c) => ({
                value: String(c.category_id),
                label: c.title,
                emoji: c.emoji ?? undefined,
              })),
            ]}
          />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          ONE-TIME MODE FIELDS
          ════════════════════════════════════════════════════════ */}
      {mode === "once" && (
        <>
          {/* Due kind chips */}
          <div>
            <label className={labelCls}>Когда</label>
            <div className="flex gap-1.5">
              {DUE_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => handleDueKindChange(k.value)}
                  className={`flex-1 ${chipBaseCls} ${
                    dueKind === k.value ? chipActiveCls : chipInactiveCls
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date + time fields */}
          {showDateFields && (
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Дата *</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => { setDueDate(e.target.value); clearFieldError("due_date"); }}
                  className={`${inputCls} ${fieldErrors.due_date ? inputErrorBorder : ""}`}
                />
                {fieldErrors.due_date && (
                  <p className={errTextCls}>{fieldErrors.due_date}</p>
                )}
              </div>

              {showTimeField && (
                <div>
                  <label className={labelCls}>Время *</label>
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(e) => { setDueTime(e.target.value); clearFieldError("due_time"); }}
                    className={`${inputCls} ${fieldErrors.due_time ? inputErrorBorder : ""}`}
                  />
                  {fieldErrors.due_time && (
                    <p className={errTextCls}>{fieldErrors.due_time}</p>
                  )}
                </div>
              )}

              {showWindowFields && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>С *</label>
                    <input
                      type="time"
                      value={dueStartTime}
                      onChange={(e) => { setDueStartTime(e.target.value); clearFieldError("due_start_time"); }}
                      className={`${inputCls} ${fieldErrors.due_start_time ? inputErrorBorder : ""}`}
                    />
                    {fieldErrors.due_start_time && (
                      <p className={errTextCls}>{fieldErrors.due_start_time}</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>До *</label>
                    <input
                      type="time"
                      value={dueEndTime}
                      onChange={(e) => { setDueEndTime(e.target.value); clearFieldError("due_end_time"); }}
                      className={`${inputCls} ${fieldErrors.due_end_time ? inputErrorBorder : ""}`}
                    />
                    {fieldErrors.due_end_time && (
                      <p className={errTextCls}>{fieldErrors.due_end_time}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Multi-dates */}
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
              <span className="text-[12px] md:text-[13px] text-white/72">
                Создать на несколько дат
              </span>
            </label>

            {multiDatesEnabled && (
              <div className="space-y-2 pl-1">
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={multiDateInput}
                    onChange={(e) => setMultiDateInput(e.target.value)}
                    className={`${inputCls} flex-1`}
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
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-[11px] text-indigo-300"
                      >
                        {d}
                        <button
                          type="button"
                          onClick={() => removeMultiDate(d)}
                          className="text-indigo-400 hover:text-white transition-colors leading-none"
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

          {/* Reminders (collapsible, only for DATETIME/WINDOW) */}
          {showReminderSection && (
            <div>
              <button
                type="button"
                onClick={() => setShowReminders((v) => !v)}
                className="text-[11px] md:text-xs font-medium text-white/65 hover:text-white/60 transition-colors"
              >
                {showReminders ? "▾ Напоминания" : "▸ Напоминания"}
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
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-600/20 border border-amber-500/30 text-[11px] text-amber-300"
                          >
                            {label}
                            <button
                              type="button"
                              onClick={() => removeReminder(r.offset_minutes)}
                              className="text-amber-400 hover:text-white transition-colors leading-none"
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
          )}

          {/* Expense link (collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => setShowExpense((v) => !v)}
              className="text-[11px] md:text-xs font-medium text-white/65 hover:text-white/60 transition-colors"
            >
              {showExpense ? "▾ Связать с расходом" : "▸ Связать с расходом"}
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
                  <span className="text-[12px] md:text-[13px] text-white/72">
                    При выполнении создать расход
                  </span>
                </label>

                {requiresExpense && (
                  <>
                    {categories && categories.length > 0 && (
                      <div>
                        <label className={labelCls}>Категория расхода</label>
                        <Select
                          value={expenseCategoryId}
                          onChange={(v) =>
                            setExpenseCategoryId(v ? Number(v) : "")
                          }
                          placeholder="— выберите категорию —"
                          options={[
                            { value: "", label: "— выберите категорию —" },
                            ...categories.map((c) => ({
                              value: String(c.category_id),
                              label: c.title,
                              emoji: c.emoji ?? undefined,
                            })),
                          ]}
                        />
                      </div>
                    )}
                    <div>
                      <label className={labelCls}>Сумма</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={expenseAmount}
                        onChange={(e) => setExpenseAmount(e.target.value)}
                        placeholder="0.00"
                        className={inputCls}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          RECURRING MODE FIELDS
          ════════════════════════════════════════════════════════ */}
      {mode === "recurring" && (
        <>
          {/* Frequency chips */}
          <div>
            <label className={labelCls}>Частота</label>
            <div className="flex gap-1.5 flex-wrap">
              {FREQS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => { setFreq(f.value); clearFieldError("freq"); clearFieldError("by_weekday"); clearFieldError("by_monthday"); }}
                  className={`flex-1 ${chipBaseCls} ${
                    freq === f.value ? chipActiveCls : chipInactiveCls
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {fieldErrors.freq && <p className={errTextCls}>{fieldErrors.freq}</p>}
          </div>

          {/* Interval */}
          <div>
            <label className={labelCls}>Интервал</label>
            <input
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(Math.max(1, Number(e.target.value)))}
              className={inputCls}
            />
          </div>

          {/* Weekday chips (WEEKLY only) */}
          {freq === "WEEKLY" && (
            <div>
              <label className={labelCls}>Дни недели *</label>
              <div className="flex gap-1.5">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleWeekday(d.value)}
                    className={`flex-1 ${chipBaseCls} ${
                      weekdays.includes(d.value) ? chipActiveCls : chipInactiveCls
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {fieldErrors.by_weekday && (
                <p className={errTextCls}>{fieldErrors.by_weekday}</p>
              )}
            </div>
          )}

          {/* Monthday (MONTHLY only) */}
          {freq === "MONTHLY" && (
            <div>
              <label className={labelCls}>День месяца *</label>
              <input
                type="number"
                min={1}
                max={31}
                value={byMonthday}
                onChange={(e) => { setByMonthday(e.target.value); clearFieldError("by_monthday"); }}
                placeholder="1–31"
                className={`${inputCls} ${fieldErrors.by_monthday ? inputErrorBorder : ""}`}
              />
              {fieldErrors.by_monthday && (
                <p className={errTextCls}>{fieldErrors.by_monthday}</p>
              )}
            </div>
          )}

          {/* Start date */}
          <div>
            <label className={labelCls}>Дата начала *</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); clearFieldError("start_date"); }}
              className={`${inputCls} ${fieldErrors.start_date ? inputErrorBorder : ""}`}
            />
            {fieldErrors.start_date && (
              <p className={errTextCls}>{fieldErrors.start_date}</p>
            )}
          </div>

          {/* Active until */}
          <div>
            <label className={labelCls}>Активно до</label>
            <input
              type="date"
              value={activeUntil}
              onChange={(e) => setActiveUntil(e.target.value)}
              min={startDate || undefined}
              className={inputCls}
            />
            <p className="text-[10px] text-white/40 mt-1">
              Оставьте пустым для бессрочного действия
            </p>
          </div>
        </>
      )}

      {/* ── Note (collapsible, both modes) ── */}
      <div>
        <button
          type="button"
          onClick={() => setShowNote((v) => !v)}
          className="text-[11px] md:text-xs font-medium text-white/65 hover:text-white/60 transition-colors"
        >
          {showNote ? "▾ Заметка" : "▸ Заметка"}
        </button>
        {showNote && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Заметка к задаче"
            rows={2}
            className="w-full mt-2 px-3 py-2 text-base md:text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors resize-none"
          />
        )}
      </div>

      {/* ── Global error ── */}
      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          {error}
        </p>
      )}
    </BottomSheet>
  );
}

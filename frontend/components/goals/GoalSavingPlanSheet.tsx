"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Select } from "@/components/ui/Select";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/formErrors";

/**
 * Накопительный план на цель: «к декабрю надо 30 000, копить с января».
 *
 * Бюджет сам подставляет помесячный взнос в строку «Отложить» — раньше
 * эти суммы приходилось вбивать в каждую клетку руками, а при сдвиге
 * срока пересчитывать всё заново.
 *
 * Взнос считает сервер (/goals/saving-plans/preview), в том числе для
 * ещё не сохранённой формы. Повторять формулу на клиенте не стали:
 * тонкость не в делении, а в границах окна — копить ли в целевом месяце
 * и как сдвигается ежегодный цикл, — и две копии этих правил разошлись
 * бы при первой же правке.
 */

export interface SavingPlanMonth {
  month: string;
  current: string;
  next: string;
  /** Сумма вписана руками — расчёт на этот месяц не повлияет. */
  manual: boolean;
}

export interface SavingPlanSchedule {
  first_month: string;
  last_month: string;
  months: number;
  monthly_amount: string;
  rows: SavingPlanMonth[];
}

export interface SavingPlan {
  id: number;
  goal_id: number;
  goal_title: string;
  /** «На др брата» — чтобы в разбивке месяца было видно, что есть что. */
  title: string;
  target_amount: string;
  start_month: string;
  target_month: string;
  save_in_target_month: boolean;
  repeat_yearly: boolean;
  is_active: boolean;
  schedule: SavingPlanSchedule | null;
  /** Разовый план с прошедшим сроком: в бюджет уже ничего не подставляет. */
  is_finished: boolean;
}

const MONTHS_RU = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const idx = Number(m) - 1;
  return (MONTHS_RU[idx] ?? m) + " " + y;
}

function money(raw: string | number): string {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function thisMonthKey(): string {
  const d = new Date();
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
}

function shiftMonths(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return Math.floor(total / 12) + "-" + pad2((total % 12) + 1);
}

// ── Месяц выбирается двумя списками ───────────────────────────────────
// `input type="month"` на iOS Safari превращается в текстовое поле, а
// набирать ГГГГ-ММ руками — худший способ указать декабрь.

function MonthPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const years = useMemo(() => {
    const base = new Date().getFullYear();
    const list: string[] = [];
    for (let y = base - 1; y <= base + 5; y++) list.push(String(y));
    // Год из уже сохранённого плана может оказаться и вне этого окна
    const own = value.split("-")[0];
    if (own && !list.includes(own)) list.push(own);
    return list.sort();
  }, [value]);

  const [y, m] = value.split("-");

  return (
    <div>
      <span className="block text-[12px] mb-1" style={{ color: "var(--t-muted)" }}>
        {label}
      </span>
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <Select
            value={m ?? ""}
            onChange={(v) => onChange(y + "-" + v)}
            options={MONTHS_RU.map((name, i) => ({ value: pad2(i + 1), label: name }))}
          />
        </div>
        <div className="w-[104px] shrink-0">
          <Select
            value={y ?? ""}
            onChange={(v) => onChange(v + "-" + m)}
            options={years.map((yy) => ({ value: yy, label: yy }))}
          />
        </div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  title,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-2.5 text-left rounded-xl px-3 py-2.5 transition-colors"
      style={{
        background: checked ? "var(--app-accent-weak)" : "var(--app-card-bg)",
        border: "1px solid " + (checked ? "var(--app-accent)" : "var(--app-border)"),
      }}
    >
      <span
        className="mt-0.5 w-4 h-4 rounded-[5px] shrink-0 flex items-center justify-center text-[10px] font-bold text-white"
        style={{
          background: checked ? "var(--app-accent)" : "transparent",
          border: "1px solid " + (checked ? "var(--app-accent)" : "var(--app-border)"),
        }}
      >
        {checked ? "✓" : ""}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium" style={{ color: "var(--t-primary)" }}>
          {title}
        </span>
        <span className="block text-[11px] leading-snug mt-0.5" style={{ color: "var(--t-faint)" }}>
          {hint}
        </span>
      </span>
    </button>
  );
}

interface FormState {
  id: number | null;
  goal_id: number | null;
  title: string;
  target_amount: string;
  start_month: string;
  target_month: string;
  save_in_target_month: boolean;
  repeat_yearly: boolean;
  is_active: boolean;
}

function blankForm(): FormState {
  const now = thisMonthKey();
  return {
    id: null,
    goal_id: null,
    title: "",
    target_amount: "",
    start_month: now,
    target_month: shiftMonths(now, 6),
    save_in_target_month: false,
    repeat_yearly: false,
    is_active: true,
  };
}

export function GoalSavingPlanSheet({
  open,
  goalId,
  goalTitle,
  onClose,
}: {
  open: boolean;
  /** Без цели — общий раздел: планы по всем целям сразу. */
  goalId?: number | null;
  goalTitle?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const allGoals = goalId == null;
  // Список планов или форма. null — ещё не выбирали, и тогда решает
  // наличие планов: нет ни одного — открываем сразу форму.
  const [view, setView] = useState<"list" | "form" | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  // Заготовка пустой формы. В состоянии, а не в useMemo: месяц в ней
  // берётся «сейчас», и при открытии после полуночи он должен обновиться.
  const [blank, setBlank] = useState(blankForm);

  // Смена цели сбрасывает всё — правкой состояния прямо на рендере, а не
  // эффектом: эффект отработал бы вторым проходом и успел показать
  // форму от предыдущей цели.
  const sessionKey = open ? String(goalId ?? "all") : "closed";
  const [lastKey, setLastKey] = useState(sessionKey);
  if (sessionKey !== lastKey) {
    setLastKey(sessionKey);
    setView(null);
    setForm(null);
    setError(null);
    setConfirmDelete(null);
    setBlank(blankForm());
  }

  const { data: plans, isLoading } = useQuery<SavingPlan[]>({
    queryKey: ["goal-saving-plans", goalId ?? "all"],
    queryFn: () =>
      api.get<SavingPlan[]>(
        allGoals ? "/api/v2/goals/saving-plans" : "/api/v2/goals/saving-plans?goal_id=" + goalId,
      ),
    enabled: open,
  });

  // Выбор цели нужен только общему разделу: из строки бюджета цель уже известна
  const { data: goalChoices } = useQuery<{ goal_id: number; title: string }[]>({
    queryKey: ["goals", false],
    queryFn: () => api.get<{ goal_id: number; title: string }[]>("/api/v2/goals?include_archived=false"),
    enabled: open && allGoals,
    staleTime: 60_000,
  });

  const hasPlans = Boolean(plans && plans.length > 0);
  const draft = form ?? blank;
  const showForm = form !== null || view === "form" || (view === null && plans?.length === 0);

  function openForm(next: FormState | null) {
    setForm(next);
    setView("form");
    setError(null);
  }

  function openList() {
    setForm(null);
    setView("list");
    setError(null);
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ["goal-saving-plans"] });
    qc.invalidateQueries({ queryKey: ["budget"] });
    qc.invalidateQueries({ queryKey: ["budget-insights"] });
    qc.invalidateQueries({ queryKey: ["budget-matrix"] });
    qc.invalidateQueries({ queryKey: ["goals"] });
  }

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: async (f: FormState) => {
      const body = {
        title: f.title.trim(),
        target_amount: f.target_amount.replace(",", "."),
        start_month: f.start_month,
        target_month: f.target_month,
        save_in_target_month: f.save_in_target_month,
        repeat_yearly: f.repeat_yearly,
      };
      if (f.id === null) {
        return api.post("/api/v2/goals/saving-plans", { goal_id: f.goal_id ?? goalId, ...body });
      }
      return api.patch("/api/v2/goals/saving-plans/" + f.id, { ...body, is_active: f.is_active });
    },
    onSuccess: () => {
      refresh();
      openList();
    },
    onError: (e) => setError(errorMessage(e, "Не удалось сохранить план")),
  });

  const { mutate: remove } = useMutation({
    mutationFn: (planId: number) => api.delete("/api/v2/goals/saving-plans/" + planId),
    onSuccess: () => {
      refresh();
      setConfirmDelete(null);
    },
    onError: (e) => setError(errorMessage(e, "Не удалось удалить план")),
  });

  // ── Живой расчёт ───────────────────────────────────────────────────
  // Пересчитывать на каждый символ незачем: пока сумма набирается, она
  // почти всегда неполная.
  const [debounced, setDebounced] = useState<FormState>(draft);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(draft), 350);
    return () => clearTimeout(t);
  }, [draft]);

  const amountReady = Number(debounced.target_amount.replace(",", ".")) > 0;
  const { data: preview, isError: previewFailed } = useQuery<SavingPlanSchedule | null>({
    queryKey: [
      "saving-plan-preview",
      goalId,
      debounced.goal_id,
      debounced.id,
      debounced.target_amount,
      debounced.start_month,
      debounced.target_month,
      debounced.save_in_target_month,
      debounced.repeat_yearly,
    ],
    queryFn: () =>
      api.post<SavingPlanSchedule | null>("/api/v2/goals/saving-plans/preview", {
        target_amount: debounced.target_amount.replace(",", "."),
        start_month: debounced.start_month,
        target_month: debounced.target_month,
        save_in_target_month: debounced.save_in_target_month,
        repeat_yearly: debounced.repeat_yearly,
        // С целью приезжает ещё и помесячное «сейчас → станет»
        goal_id: debounced.goal_id ?? goalId ?? null,
        plan_id: debounced.id,
      }),
    enabled: open && showForm && amountReady,
    retry: false,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if ((draft.goal_id ?? goalId) == null) {
      setError("Выберите цель");
      return;
    }
    if (!Number(draft.target_amount.replace(",", "."))) {
      setError("Укажите сумму");
      return;
    }
    setError(null);
    save(draft);
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={showForm ? (draft.id ? "План накоплений" : "Новый план") : "Планы накоплений"}
      detent="half"
      onSubmit={showForm ? submit : undefined}
      footer={
        showForm ? (
          <div className="flex gap-2">
            {hasPlans && (
              <button
                type="button"
                onClick={openList}
                className="rounded-lg px-4 py-2.5 text-[14px] font-medium"
                style={{ border: "1px solid var(--app-border)", color: "var(--t-secondary)" }}
              >
                Назад
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--app-accent)" }}
            >
              {saving ? "Сохраняю…" : "Сохранить"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => openForm(null)}
            className="w-full rounded-lg py-2.5 text-[14px] font-semibold text-white inline-flex items-center justify-center gap-1.5"
            style={{ background: "var(--app-accent)" }}
          >
            <Plus size={15} />
            Добавить план
          </button>
        )
      }
    >
      {goalTitle && !allGoals && (
        <p className="text-[12px] mb-3" style={{ color: "var(--t-muted)" }}>
          Цель: {goalTitle}
        </p>
      )}

      {isLoading && (
        <p className="text-[13px]" style={{ color: "var(--t-faint)" }}>
          Загружаю…
        </p>
      )}

      {!showForm && !hasPlans && !isLoading && (
        <p className="text-[13px]" style={{ color: "var(--t-faint)" }}>
          Планов пока нет.
        </p>
      )}

      {/* ── Список планов ── */}
      {!showForm && hasPlans && (
        <div className="space-y-2">
          {plans!.map((p) => (
            <div
              key={p.id}
              className="rounded-xl px-3 py-2.5"
              style={{
                background: "var(--app-card-bg)",
                border: "1px solid var(--app-border)",
                opacity: p.is_active ? 1 : 0.55,
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {allGoals && p.goal_title && (
                    <p className="text-[11px] truncate" style={{ color: "var(--t-muted)" }}>
                      {p.goal_title}
                    </p>
                  )}
                  <p className="text-[13.5px] font-semibold" style={{ color: "var(--t-primary)" }}>
                    {p.title ? p.title + " · " : ""}
                    {money(p.target_amount)} ₽ к {monthLabel(p.target_month)}
                  </p>
                  <p className="text-[11.5px] mt-0.5 leading-snug" style={{ color: "var(--t-muted)" }}>
                    {p.schedule
                      ? money(p.schedule.monthly_amount) +
                        " ₽ в месяц · " +
                        p.schedule.months +
                        " мес. с " +
                        monthLabel(p.schedule.first_month)
                      : "копить нечего: проверьте месяцы"}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {p.repeat_yearly && (
                      <span
                        className="inline-flex items-center gap-1 text-[10.5px] font-medium px-1.5 py-0.5 rounded-md"
                        style={{ background: "var(--app-accent-weak)", color: "var(--app-accent)" }}
                      >
                        <Repeat size={10} />
                        каждый год
                      </span>
                    )}
                    {p.is_finished && (
                      <span
                        className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-md"
                        style={{ background: "var(--app-border)", color: "var(--t-muted)" }}
                      >
                        срок прошёл
                      </span>
                    )}
                    {!p.is_active && (
                      <span
                        className="text-[10.5px] font-medium px-1.5 py-0.5 rounded-md"
                        style={{ background: "var(--app-border)", color: "var(--t-muted)" }}
                      >
                        выключен
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    title="Изменить"
                    onClick={() =>
                      openForm({
                        id: p.id,
                        goal_id: p.goal_id,
                        title: p.title ?? "",
                        target_amount: String(Number(p.target_amount)),
                        start_month: p.start_month,
                        target_month: p.target_month,
                        save_in_target_month: p.save_in_target_month,
                        repeat_yearly: p.repeat_yearly,
                        is_active: p.is_active,
                      })
                    }
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ color: "var(--t-faint)" }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    title="Удалить"
                    onClick={() => setConfirmDelete(confirmDelete === p.id ? null : p.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center"
                    style={{ color: confirmDelete === p.id ? "var(--c-danger-ink)" : "var(--t-faint)" }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {confirmDelete === p.id && (
                <div
                  className="flex items-center justify-between gap-2 mt-2 pt-2"
                  style={{ borderTop: "1px solid var(--app-border)" }}
                >
                  <span className="text-[12px]" style={{ color: "var(--t-secondary)" }}>
                    Удалить план?
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(null)}
                      className="px-2.5 py-1 rounded-lg text-[12px]"
                      style={{ border: "1px solid var(--app-border)", color: "var(--t-secondary)" }}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      className="px-2.5 py-1 rounded-lg text-[12px] font-semibold text-white"
                      style={{ background: "var(--c-danger-ink)" }}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Форма ── */}
      {showForm && (
        <div className="space-y-3.5">
          {allGoals && (
            <div>
              <span className="block text-[12px] mb-1" style={{ color: "var(--t-muted)" }}>
                Цель
              </span>
              <Select
                value={draft.goal_id != null ? String(draft.goal_id) : ""}
                onChange={(v) => setForm({ ...draft, goal_id: Number(v) })}
                placeholder="Выберите цель"
                options={(goalChoices ?? []).map((g) => ({
                  value: String(g.goal_id),
                  label: g.title,
                }))}
              />
            </div>
          )}

          <label className="block">
            <span className="block text-[12px] mb-1" style={{ color: "var(--t-muted)" }}>
              На что копим
            </span>
            <input
              value={draft.title}
              onChange={(e) => setForm({ ...draft, title: e.target.value })}
              placeholder="На др брата"
              maxLength={120}
              className="w-full rounded-lg px-3 py-2 text-[14px]"
              style={{
                background: "var(--app-card-bg)",
                border: "1px solid var(--app-border)",
                color: "var(--t-primary)",
              }}
            />
          </label>

          <label className="block">
            <span className="block text-[12px] mb-1" style={{ color: "var(--t-muted)" }}>
              Сколько нужно накопить
            </span>
            <input
              value={draft.target_amount}
              onChange={(e) => setForm({ ...draft, target_amount: e.target.value })}
              inputMode="decimal"
              placeholder="30000"
              autoFocus
              className="w-full rounded-lg px-3 py-2 text-[15px] font-semibold tabular-nums"
              style={{
                background: "var(--app-card-bg)",
                border: "1px solid var(--app-border)",
                color: "var(--t-primary)",
              }}
            />
          </label>

          <MonthPicker
            label="Копить с"
            value={draft.start_month}
            onChange={(v) => setForm({ ...draft, start_month: v })}
          />
          <MonthPicker
            label="Нужно к"
            value={draft.target_month}
            onChange={(v) => setForm({ ...draft, target_month: v })}
          />

          <Toggle
            checked={draft.save_in_target_month}
            onChange={(v) => setForm({ ...draft, save_in_target_month: v })}
            title="Откладывать и в целевом месяце"
            hint="Выключено — деньги должны лежать к его началу"
          />
          <Toggle
            checked={draft.repeat_yearly}
            onChange={(v) => setForm({ ...draft, repeat_yearly: v })}
            title="Каждый год"
            hint="Для страховки, налога, подписки — цикл сам сдвинется"
          />

          {draft.id !== null && (
            <Toggle
              checked={draft.is_active}
              onChange={(v) => setForm({ ...draft, is_active: v })}
              title="План включён"
              hint="Выключенный не подставляет суммы в бюджет"
            />
          )}

          {/* Расчёт до сохранения: иначе «по сколько в месяц» приходится
              считать в голове, а это и есть главный вопрос к плану. */}
          <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--app-accent-weak)" }}>
            {!amountReady ? (
              <p className="text-[12px]" style={{ color: "var(--t-muted)" }}>
                Укажите сумму — посчитаю взнос по месяцам.
              </p>
            ) : previewFailed ? (
              <p className="text-[12px]" style={{ color: "var(--c-danger-ink)" }}>
                Так копить не получится: проверьте месяцы.
              </p>
            ) : preview ? (
              <>
                <p className="text-[15px] font-bold tabular-nums" style={{ color: "var(--app-accent)" }}>
                  {money(preview.monthly_amount)} ₽ в месяц
                </p>
                <p className="text-[11.5px] mt-0.5 leading-snug" style={{ color: "var(--t-muted)" }}>
                  {preview.months} мес.: {monthLabel(preview.first_month)} — {monthLabel(preview.last_month)}.
                  Эта сумма сама встанет в строку «Отложить».
                </p>

                {/* Помесячно, что в бюджете сейчас и что станет: иначе
                    эффект плана виден только после сохранения. */}
                {preview.rows.length > 0 && (
                  <div
                    className="mt-2 pt-2 space-y-0.5 overflow-y-auto"
                    style={{ borderTop: "1px solid var(--app-border)", maxHeight: 168 }}
                  >
                    {preview.rows.map((r) => (
                      <div
                        key={r.month}
                        className="flex items-baseline justify-between gap-2 text-[11.5px]"
                      >
                        <span className="truncate" style={{ color: "var(--t-muted)" }}>
                          {monthLabel(r.month)}
                        </span>
                        {r.manual ? (
                          <span className="tabular-nums shrink-0" style={{ color: "var(--t-faint)" }}>
                            {money(r.current)} ₽ · вписано руками
                          </span>
                        ) : (
                          <span className="tabular-nums shrink-0" style={{ color: "var(--t-secondary)" }}>
                            {money(r.current)} →{" "}
                            <span className="font-semibold" style={{ color: "var(--app-accent)" }}>
                              {money(r.next)} ₽
                            </span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-[12px]" style={{ color: "var(--t-muted)" }}>
                Считаю…
              </p>
            )}
          </div>

          {error && (
            <p className="text-[12px] font-medium" style={{ color: "var(--c-danger-ink)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

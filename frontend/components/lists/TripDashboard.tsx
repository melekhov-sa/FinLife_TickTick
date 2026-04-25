"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Trash2, Pencil, Plane, Check } from "lucide-react";

import { api } from "@/lib/api";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { ConfirmDeleteModal } from "@/components/modals/ConfirmDeleteModal";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { CreateOperationModal } from "@/components/modals/CreateOperationModal";
import { RichNoteEditor } from "@/components/ui/RichNoteEditor";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { DateInput } from "@/components/primitives/DateInput";
import { Skeleton } from "@/components/primitives/Skeleton";
import { ProgressBar } from "@/components/primitives/ProgressBar";
import { Tooltip } from "@/components/primitives/Tooltip";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TripList {
  id: number;
  title: string;
  description: string | null;
  list_type: string;
  slug: string;
  is_public: boolean;
  budget_amount: string | null;
  period_from: string | null;
  period_to: string | null;
}

interface PlanItem {
  id: number;
  title: string;
  amount: string;
  sort_order: number;
}

interface TripSummary {
  budget_amount: string | null;
  plan_total: string;
  plan_items_count: number;
  effective_budget: string;
  fact_amount: string;
  tasks_total: number;
  tasks_done: number;
  txn_count: number;
  period_from: string | null;
  period_to: string | null;
}

interface TripTaskItem {
  task_id: number;
  title: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
}

interface TripTransactionItem {
  transaction_id: number;
  operation_type: string;
  amount: string;
  currency: string;
  description: string;
  occurred_at: string;
  category_title: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatRub(value: string | number | null | undefined): string {
  if (value == null || value === "") return "0";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "0";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

// ── Section card ─────────────────────────────────────────────────────────────

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border p-4 ${className}`}
      style={{
        background: "var(--app-card-bg)",
        borderColor: "var(--app-card-border)",
      }}
    >
      {children}
    </div>
  );
}

function SectionHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2
        className="text-[var(--fs-caption)] font-semibold uppercase tracking-wider"
        style={{ color: "var(--t-faint)" }}
      >
        {children}
      </h2>
      {action}
    </div>
  );
}

// ── Edit list modal (period + budget) ────────────────────────────────────────

function EditTripModal({ list, onClose }: { list: TripList; onClose: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(list.title);
  const [budget, setBudget] = useState(list.budget_amount ?? "");
  const [from, setFrom] = useState(list.period_from ?? "");
  const [to, setTo] = useState(list.period_to ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await api.patch(`/api/v2/lists/${list.id}`, {
        title: title.trim(),
        budget_amount: budget.trim() || null,
        period_from: from || null,
        period_to: to || null,
      });
      qc.invalidateQueries({ queryKey: ["shared-list", list.id] });
      qc.invalidateQueries({ queryKey: ["list-summary", list.id] });
      qc.invalidateQueries({ queryKey: ["shared-lists"] });
      onClose();
    } catch {
      /* ignore */
    }
    setSaving(false);
  }

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Параметры поездки"
      footer={
        <Button
          variant="primary"
          size="md"
          loading={saving}
          disabled={!title.trim()}
          onClick={handleSave}
          fullWidth
        >
          Сохранить
        </Button>
      }
    >
      <div className="space-y-3">
        <Input
          label="Название"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Input
          label="Бюджет, ₽"
          type="number"
          inputMode="decimal"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="120000"
          tabular
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-slate-700 dark:text-slate-300 select-none">С</label>
            <DateInput value={from} onChange={setFrom} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-slate-700 dark:text-slate-300 select-none">По</label>
            <DateInput value={to} onChange={setTo} />
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}

// ── Plan section ─────────────────────────────────────────────────────────────

function PlanSection({ listId }: { listId: number }) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["plan-items", listId] });
    qc.invalidateQueries({ queryKey: ["list-summary", listId] });
  };

  const { data: items = [] } = useQuery<PlanItem[]>({
    queryKey: ["plan-items", listId],
    queryFn: () => api.get<PlanItem[]>(`/api/v2/lists/${listId}/plan-items`),
    staleTime: 15_000,
  });

  const [newTitle, setNewTitle] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<"title" | "amount" | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PlanItem | null>(null);

  const total = useMemo(
    () => items.reduce((acc, it) => acc + parseFloat(it.amount || "0"), 0),
    [items],
  );

  async function handleAdd() {
    if (!newTitle.trim()) return;
    const amt = newAmount.trim() ? newAmount.trim() : "0";
    try {
      await api.post(`/api/v2/lists/${listId}/plan-items`, {
        title: newTitle.trim(),
        amount: amt,
      });
      setNewTitle("");
      setNewAmount("");
      invalidate();
    } catch {
      /* ignore */
    }
  }

  async function handleEditCommit(item: PlanItem) {
    if (!editingField) return;
    const value = editValue.trim();
    if (editingField === "title") {
      if (!value || value === item.title) {
        setEditingId(null);
        setEditingField(null);
        return;
      }
      try {
        await api.patch(`/api/v2/lists/${listId}/plan-items/${item.id}`, { title: value });
        invalidate();
      } catch {
        /* ignore */
      }
    } else {
      if (value === item.amount) {
        setEditingId(null);
        setEditingField(null);
        return;
      }
      try {
        await api.patch(`/api/v2/lists/${listId}/plan-items/${item.id}`, { amount: value || "0" });
        invalidate();
      } catch {
        /* ignore */
      }
    }
    setEditingId(null);
    setEditingField(null);
  }

  function startEdit(item: PlanItem, field: "title" | "amount") {
    setEditingId(item.id);
    setEditingField(field);
    setEditValue(field === "title" ? item.title : item.amount);
  }

  return (
    <SectionCard>
      <SectionHeader>План</SectionHeader>

      {items.length === 0 && (
        <p className="text-[13px] mb-2" style={{ color: "var(--t-faint)" }}>
          Добавьте позиции, чтобы прикинуть смету.
        </p>
      )}

      {items.length > 0 && (
        <div className="rounded-lg border overflow-hidden mb-2" style={{ borderColor: "var(--app-card-border)" }}>
          {items.map((it) => {
            const isEdit = editingId === it.id;
            return (
              <div
                key={it.id}
                className="flex items-center gap-2 px-3 py-2 border-b last:border-0 hover:bg-slate-50/50 dark:hover:bg-white/[0.03] transition-colors group"
                style={{ borderColor: "var(--app-card-border)" }}
              >
                {isEdit && editingField === "title" ? (
                  <Input
                    size="sm"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleEditCommit(it)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEditCommit(it);
                      if (e.key === "Escape") { setEditingId(null); setEditingField(null); }
                    }}
                    autoFocus
                    className="flex-1"
                  />
                ) : (
                  <span
                    onClick={() => startEdit(it, "title")}
                    className="flex-1 text-[14px] truncate cursor-pointer"
                    style={{ color: "var(--t-primary)" }}
                    title="Кликните для редактирования"
                  >
                    {it.title}
                  </span>
                )}

                {isEdit && editingField === "amount" ? (
                  <Input
                    size="sm"
                    type="number"
                    inputMode="decimal"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleEditCommit(it)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEditCommit(it);
                      if (e.key === "Escape") { setEditingId(null); setEditingField(null); }
                    }}
                    autoFocus
                    tabular
                    className="w-28"
                  />
                ) : (
                  <span
                    onClick={() => startEdit(it, "amount")}
                    className="text-[14px] tabular-nums font-semibold cursor-pointer min-w-[80px] text-right"
                    style={{ color: "var(--t-secondary)" }}
                    title="Кликните для редактирования"
                  >
                    {formatRub(it.amount)} ₽
                  </span>
                )}

                <Tooltip content="Удалить позицию">
                  <button
                    onClick={() => setDeleteTarget(it)}
                    className="w-7 h-7 flex items-center justify-center rounded transition-all opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500"
                    style={{ color: "var(--t-faint)" }}
                  >
                    <Trash2 size={13} />
                  </button>
                </Tooltip>
              </div>
            );
          })}
        </div>
      )}

      {/* Add row */}
      <div className="flex items-center gap-2 mt-2">
        <Input
          size="sm"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="Например, Авиабилеты"
          className="flex-1"
        />
        <Input
          size="sm"
          type="number"
          inputMode="decimal"
          value={newAmount}
          onChange={(e) => setNewAmount(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder="0"
          tabular
          className="w-28"
        />
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus size={14} />}
          onClick={handleAdd}
          disabled={!newTitle.trim()}
        >
          Добавить
        </Button>
      </div>

      <div className="flex justify-end mt-3 pt-3 border-t" style={{ borderColor: "var(--app-card-border)" }}>
        <span className="text-[13px]" style={{ color: "var(--t-faint)" }}>Итого:&nbsp;</span>
        <span className="text-[14px] font-bold tabular-nums" style={{ color: "var(--t-primary)" }}>
          {formatRub(total)} ₽
        </span>
      </div>

      {deleteTarget && (
        <ConfirmDeleteModal
          entityName="позицию"
          title={deleteTarget.title}
          onConfirm={async () => {
            await api.delete(`/api/v2/lists/${listId}/plan-items/${deleteTarget.id}`);
            invalidate();
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </SectionCard>
  );
}

// ── Tasks section ────────────────────────────────────────────────────────────

function TasksSection({ listId }: { listId: number }) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["list-tasks", listId] });
    qc.invalidateQueries({ queryKey: ["list-summary", listId] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const { data: tasks = [] } = useQuery<TripTaskItem[]>({
    queryKey: ["list-tasks", listId],
    queryFn: () => api.get<TripTaskItem[]>(`/api/v2/tasks?list_id=${listId}`),
    staleTime: 15_000,
  });

  const [showCreate, setShowCreate] = useState(false);

  const { mutate: toggleStatus } = useMutation({
    mutationFn: ({ taskId, status }: { taskId: number; status: string }) =>
      api.patch(`/api/v2/tasks/${taskId}`, { status }),
    onSuccess: invalidate,
  });

  return (
    <>
      <SectionCard>
        <SectionHeader
          action={
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => setShowCreate(true)}
            >
              Задача
            </Button>
          }
        >
          Задачи
        </SectionHeader>

        {tasks.length === 0 && (
          <p className="text-[13px]" style={{ color: "var(--t-faint)" }}>
            Пока нет задач.
          </p>
        )}

        {tasks.length > 0 && (
          <div className="space-y-1">
            {tasks.map((t) => {
              const done = t.status === "DONE";
              return (
                <div
                  key={t.task_id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50/50 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <button
                    onClick={() => toggleStatus({ taskId: t.task_id, status: done ? "ACTIVE" : "DONE" })}
                    className="shrink-0"
                    aria-label={done ? "Снять отметку" : "Отметить выполненной"}
                  >
                    {done ? (
                      <div className="w-[18px] h-[18px] rounded-full bg-emerald-500 flex items-center justify-center">
                        <Check size={10} className="text-white" strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="w-[18px] h-[18px] rounded-full border-[1.5px] border-slate-300 dark:border-white/30" />
                    )}
                  </button>
                  <span
                    className={`flex-1 text-[14px] truncate ${done ? "line-through" : ""}`}
                    style={{ color: done ? "var(--t-muted)" : "var(--t-primary)" }}
                  >
                    {t.title}
                  </span>
                  {t.due_date && (
                    <span className="text-[12px] tabular-nums shrink-0" style={{ color: "var(--t-faint)" }}>
                      {formatDateShort(t.due_date)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {showCreate && (
        <CreateTaskModal
          onClose={() => { setShowCreate(false); invalidate(); }}
          initialListId={listId}
        />
      )}
    </>
  );
}

// ── Operations section ───────────────────────────────────────────────────────

function OperationsSection({ listId }: { listId: number }) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["list-transactions", listId] });
    qc.invalidateQueries({ queryKey: ["list-summary", listId] });
  };

  const { data } = useQuery<{ items: TripTransactionItem[] }>({
    queryKey: ["list-transactions", listId],
    queryFn: () =>
      api.get<{ items: TripTransactionItem[] }>(
        `/api/v2/transactions?list_id=${listId}&per_page=200`,
      ),
    staleTime: 15_000,
  });
  const txns = useMemo<TripTransactionItem[]>(() => data?.items ?? [], [data]);

  const [showCreate, setShowCreate] = useState(false);

  const total = useMemo(
    () =>
      txns.reduce((acc, t) => {
        const v = parseFloat(t.amount || "0");
        if (t.operation_type === "EXPENSE") return acc + v;
        if (t.operation_type === "INCOME") return acc - v;
        return acc;
      }, 0),
    [txns],
  );

  return (
    <>
      <SectionCard>
        <SectionHeader
          action={
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Plus size={14} />}
              onClick={() => setShowCreate(true)}
            >
              Операция
            </Button>
          }
        >
          Операции
        </SectionHeader>

        {txns.length === 0 && (
          <p className="text-[13px]" style={{ color: "var(--t-faint)" }}>
            Пока нет операций.
          </p>
        )}

        {txns.length > 0 && (
          <div className="space-y-1">
            {txns.map((t) => {
              const isExpense = t.operation_type === "EXPENSE";
              const isIncome = t.operation_type === "INCOME";
              const color = isExpense
                ? "var(--color-expense)"
                : isIncome
                  ? "var(--color-income)"
                  : "var(--t-secondary)";
              return (
                <div
                  key={t.transaction_id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50/50 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <span className="text-[12px] tabular-nums shrink-0 w-12" style={{ color: "var(--t-faint)" }}>
                    {formatDateShort(t.occurred_at)}
                  </span>
                  <span className="flex-1 text-[14px] truncate" style={{ color: "var(--t-primary)" }}>
                    {t.description || t.category_title || "—"}
                  </span>
                  <span className="text-[14px] tabular-nums font-semibold shrink-0" style={{ color }}>
                    {isExpense ? "−" : isIncome ? "+" : ""}{formatRub(t.amount)} ₽
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {txns.length > 0 && (
          <div className="flex justify-end mt-3 pt-3 border-t" style={{ borderColor: "var(--app-card-border)" }}>
            <span className="text-[13px]" style={{ color: "var(--t-faint)" }}>Итого:&nbsp;</span>
            <span className="text-[14px] font-bold tabular-nums" style={{ color: "var(--t-primary)" }}>
              {formatRub(total)} ₽
            </span>
          </div>
        )}
      </SectionCard>

      {showCreate && (
        <CreateOperationModal
          onClose={() => { setShowCreate(false); invalidate(); }}
          initialListId={listId}
        />
      )}
    </>
  );
}

// ── Note section (auto-save) ─────────────────────────────────────────────────

function NoteSection({ list }: { list: TripList }) {
  const qc = useQueryClient();
  // Local-first editor state. We avoid syncing prop -> state inside an effect
  // (which would cause cascading renders). Instead, the editor key is bound
  // to list.id so a different list remounts the editor, while edits to the
  // same list always originate locally and propagate via debounced PATCH.
  const initial = list.description ?? "";
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(md: string) {
    setValue(md);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await api.patch(`/api/v2/lists/${list.id}`, { description: md });
        qc.invalidateQueries({ queryKey: ["shared-list", list.id] });
      } catch {
        /* ignore */
      }
    }, 500);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <SectionCard>
      <SectionHeader>Заметка</SectionHeader>
      <RichNoteEditor
        value={value}
        onChange={onChange}
        placeholder="Идеи, ссылки, контакты, что взять с собой..."
        minHeight={120}
      />
    </SectionCard>
  );
}

// ── Summary section ──────────────────────────────────────────────────────────

function SummaryCard({ summary }: { summary: TripSummary | undefined }) {
  if (!summary) {
    return (
      <SectionCard>
        <Skeleton variant="rect" height={96} className="rounded-md" />
      </SectionCard>
    );
  }

  const fact = parseFloat(summary.fact_amount || "0");
  const eff = parseFloat(summary.effective_budget || "0");

  return (
    <SectionCard>
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div>
          <p className="text-[var(--fs-caption)] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--t-faint)" }}>
            Факт / План
          </p>
          {eff > 0 ? (
            <p className="text-[var(--fs-title)] font-bold tabular-nums" style={{ color: "var(--t-primary)" }}>
              {formatRub(fact)} ₽ <span style={{ color: "var(--t-faint)" }}>/ {formatRub(eff)} ₽</span>
            </p>
          ) : (
            <p className="text-[var(--fs-body)]" style={{ color: "var(--t-muted)" }}>
              План не задан
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <span className="text-[var(--fs-caption)]" style={{ color: "var(--t-faint)" }}>
            Задач: <span className="font-semibold" style={{ color: "var(--t-secondary)" }}>{summary.tasks_done}/{summary.tasks_total}</span>
          </span>
          <span className="text-[var(--fs-caption)]" style={{ color: "var(--t-faint)" }}>
            Операций: <span className="font-semibold" style={{ color: "var(--t-secondary)" }}>{summary.txn_count}</span>
          </span>
        </div>
      </div>

      {eff > 0 && (
        <ProgressBar value={fact} max={eff} variant="primary" size="md" showLabel />
      )}
    </SectionCard>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function TripDashboard({ list }: { list: TripList }) {
  const [editOpen, setEditOpen] = useState(false);

  const { data: summary } = useQuery<TripSummary>({
    queryKey: ["list-summary", list.id],
    queryFn: () => api.get<TripSummary>(`/api/v2/lists/${list.id}/summary`),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const periodLabel = (() => {
    if (!list.period_from && !list.period_to) return null;
    if (list.period_from && list.period_to) return `${formatDate(list.period_from)} — ${formatDate(list.period_to)}`;
    return formatDate(list.period_from ?? list.period_to);
  })();

  return (
    <>
      <AppTopbar title={list.title} subtitle="Поездка" />

      <main className="flex-1 overflow-auto">
        <div className="p-3 md:p-6 space-y-4 max-w-[900px] mx-auto">
          {/* Header card */}
          <SectionCard>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: "var(--app-accent-weak)", color: "var(--app-accent)" }}
                >
                  <Plane size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-[var(--fs-title)] font-bold truncate" style={{ color: "var(--t-primary)" }}>
                    {list.title}
                  </p>
                  <p className="text-[var(--fs-caption)] mt-0.5" style={{ color: "var(--t-faint)" }}>
                    {periodLabel ?? "Период не задан"}
                    {list.budget_amount && (
                      <>
                        {" · "}Бюджет:{" "}
                        <span className="font-semibold" style={{ color: "var(--t-secondary)" }}>
                          {formatRub(list.budget_amount)} ₽
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditOpen(true)}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md border text-[12px] font-medium transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                style={{ borderColor: "var(--app-card-border)", color: "var(--t-secondary)" }}
              >
                <Pencil size={12} />
                Редактировать
              </button>
            </div>
          </SectionCard>

          {/* Summary */}
          <SummaryCard summary={summary} />

          {/* Plan */}
          <PlanSection listId={list.id} />

          {/* Tasks */}
          <TasksSection listId={list.id} />

          {/* Operations */}
          <OperationsSection listId={list.id} />

          {/* Note */}
          <NoteSection list={list} />
        </div>
      </main>

      {editOpen && <EditTripModal list={list} onClose={() => setEditOpen(false)} />}
    </>
  );
}

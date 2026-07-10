"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Tabs } from "@/components/primitives/Tabs";
import { Target, AlertCircle, Pencil, Archive, ArchiveRestore, Plus, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/primitives/Badge";
import { Card } from "@/components/primitives/Card";
import { Skeleton } from "@/components/primitives/Skeleton";
import { ProgressRing } from "@/components/primitives/ProgressRing";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Button } from "@/components/primitives/Button";
import { Checkbox } from "@/components/primitives/Checkbox";
import { Popover } from "@/components/primitives/Popover";
import { GoalFormModal } from "@/components/modals/GoalFormModal";

// ── Types ──────────────────────────────────────────────────────────────────────

interface GoalWalletItem {
  wallet_id: number;
  title: string;
  amount: string;
}

interface GoalItem {
  goal_id: number;
  title: string;
  currency: string;
  target_amount: string | null;
  current_balance: string;
  percent: number | null;
  wallet_count: number;
  wallets: GoalWalletItem[];
  is_system: boolean;
  is_archived: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  RUB: "₽",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

function formatAmount(raw: string | null): string {
  if (!raw) return "0";
  const n = parseFloat(raw);
  if (isNaN(n)) return raw;
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useGoals(includeArchived: boolean) {
  return useQuery<GoalItem[]>({
    queryKey: ["goals", includeArchived],
    queryFn: () => api.get<GoalItem[]>(`/api/v2/goals?include_archived=${includeArchived}`),
    staleTime: 60_000,
  });
}

function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; currency: string; target_amount: string | null }) =>
      api.post("/api/v2/goals", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, ...body }: { goalId: number; title: string; target_amount: string | null }) =>
      api.patch(`/api/v2/goals/${goalId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

function useArchiveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goalId: number) => api.post(`/api/v2/goals/${goalId}/archive`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

function useUnarchiveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goalId: number) => api.post(`/api/v2/goals/${goalId}/unarchive`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
}

// ── GoalCard ──────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  onEdit,
  onArchive,
  onUnarchive,
}: {
  goal: GoalItem;
  onEdit: (goal: GoalItem) => void;
  onArchive: (goalId: number) => void;
  onUnarchive: (goalId: number) => void;
}) {
  const pct = Math.min(goal.percent ?? 0, 100);
  const isComplete = pct >= 100;
  const sym = currencySymbol(goal.currency);
  const [archivePopoverOpen, setArchivePopoverOpen] = useState(false);

  return (
    <div className={goal.is_archived ? "opacity-60" : undefined}>
      <Card padding="lg" className="group/card">
        <div className="flex items-start gap-4">
          {/* Leading: ProgressRing or accent plate */}
          <div className="shrink-0">
            {goal.target_amount ? (
              <ProgressRing
                value={pct}
                max={100}
                size={64}
                color={isComplete ? "success" : "accent"}
                ariaLabel={`Прогресс ${pct}%`}
                center={
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: isComplete ? "var(--c-success-ink)" : "var(--t-primary)",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {pct}%
                  </span>
                }
              />
            ) : (
              <div
                className="flex items-center justify-center"
                style={{ width: 64, height: 64, borderRadius: 16, background: "var(--app-accent-weak)", fontSize: 28 }}
              >
                🎯
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <h3
                className="text-[15px] font-semibold leading-snug truncate"
                style={{ color: goal.is_archived ? "var(--t-faint)" : "var(--t-primary)", letterSpacing: "-0.01em" }}
              >
                {goal.title}
              </h3>
              <div className="flex items-center gap-1 shrink-0">
                {goal.is_system && <Badge variant="warning" size="sm">Системная</Badge>}
                {goal.is_archived && <Badge variant="neutral" size="sm">Архив</Badge>}

                {!goal.is_system && (
                  <div className="flex items-center gap-0.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
                    {goal.is_archived ? (
                      <button
                        onClick={() => onUnarchive(goal.goal_id)}
                        title="Восстановить"
                        className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-emerald-500/15"
                        style={{ color: "var(--t-faint)" }}
                      >
                        <ArchiveRestore size={13} />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => onEdit(goal)}
                          title="Редактировать"
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.07]"
                          style={{ color: "var(--t-faint)" }}
                        >
                          <Pencil size={12} />
                        </button>
                        <Popover
                          open={archivePopoverOpen}
                          onOpenChange={setArchivePopoverOpen}
                          side="bottom"
                          align="end"
                          className="min-w-[220px] p-3"
                          trigger={
                            <button
                              title="В архив"
                              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:bg-red-500/10"
                              style={{ color: "var(--t-faint)" }}
                            >
                              <Archive size={12} />
                            </button>
                          }
                        >
                          <p className="text-[13px] font-medium mb-3" style={{ color: "var(--t-primary)" }}>
                            Архивировать «{goal.title}»?
                          </p>
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setArchivePopoverOpen(false)}>
                              Отмена
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                onArchive(goal.goal_id);
                                setArchivePopoverOpen(false);
                              }}
                            >
                              Архивировать
                            </Button>
                          </div>
                        </Popover>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Amounts */}
            <p className="text-[12px] tabular-nums" style={{ color: "var(--t-muted)", fontVariantNumeric: "tabular-nums" }}>
              {goal.target_amount ? (
                <>{formatAmount(goal.current_balance)} / {formatAmount(goal.target_amount)} {sym}</>
              ) : (
                <>{formatAmount(goal.current_balance)} {sym}</>
              )}
            </p>

            {/* Wallet breakdown */}
            {goal.wallets.length > 0 ? (
              <div className="mt-1.5 flex flex-col gap-0.5">
                {goal.wallets.map((w) => (
                  <div key={w.wallet_id} className="flex items-center justify-between gap-2">
                    <span
                      className="text-[11px] truncate"
                      style={{ color: "var(--t-faint)" }}
                    >
                      {w.title}
                    </span>
                    <span
                      className="text-[11px] tabular-nums shrink-0 font-medium"
                      style={{ color: "var(--t-muted)", fontVariantNumeric: "tabular-nums" }}
                    >
                      {formatAmount(w.amount)} {sym}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] mt-1" style={{ color: "var(--t-faint)" }}>
                нет средств в кошельках
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const MONEY_TABS = [
  { id: "/money",      label: "Операции" },
  { id: "/wallets",    label: "Кошельки" },
  { id: "/categories", label: "Категории" },
  { id: "/goals",      label: "Цели" },
  { id: "/savings",    label: "Накопления" },
];

function getMoneyTab(pathname: string | null): string {
  if (!pathname) return "/money";
  if (pathname.startsWith("/wallets"))    return "/wallets";
  if (pathname.startsWith("/categories")) return "/categories";
  if (pathname.startsWith("/goals"))      return "/goals";
  if (pathname.startsWith("/savings"))    return "/savings";
  return "/money";
}

export default function GoalsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalItem | null>(null);

  const { data: allGoals, isLoading, isError } = useGoals(showArchived);

  const { mutateAsync: createGoal } = useCreateGoal();
  const { mutateAsync: updateGoal } = useUpdateGoal();
  const { mutate: archiveGoal } = useArchiveGoal();
  const { mutate: unarchiveGoal } = useUnarchiveGoal();

  const goals = allGoals
    ? allGoals.filter((g) => (showArchived ? g.is_archived : !g.is_archived))
    : undefined;

  return (
    <>
      <PageHeader
        title="Деньги"
        tabs={
          <Tabs
            items={MONEY_TABS}
            active={getMoneyTab(pathname)}
            onChange={(id) => router.push(id)}
          />
        }
      />

      <main className="flex-1 p-4 md:p-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--t-primary)", letterSpacing: "-0.015em" }}>
              Накопительные цели
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <Checkbox
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              label="Архивные"
              size="sm"
            />
            <RebuildAllocationsButton />
            {!showArchived && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={13} strokeWidth={2.5} className="mr-1" />
                Новая цель
              </Button>
            )}
          </div>
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} variant="rect" height={144} className="rounded-2xl" />
            ))}
          </div>
        )}

        {isError && (
          <EmptyState
            variant="error"
            icon={<AlertCircle size={24} />}
            title="Не удалось загрузить цели"
            size="md"
          />
        )}

        {/* Goal grid */}
        {!isLoading && !isError && goals && goals.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {goals.map((goal) => (
              <GoalCard
                key={goal.goal_id}
                goal={goal}
                onEdit={setEditingGoal}
                onArchive={(id) => archiveGoal(id)}
                onUnarchive={(id) => unarchiveGoal(id)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && goals && goals.length === 0 && (
          <EmptyState
            icon={<Target size={24} />}
            title={showArchived ? "Нет архивных целей" : "Нет активных целей"}
            description={
              !showArchived
                ? "Создайте первую цель, чтобы начать откладывать деньги"
                : undefined
            }
            actions={
              !showArchived ? (
                <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus size={13} className="mr-1" />
                  Создать цель
                </Button>
              ) : undefined
            }
          />
        )}
      </main>

      {/* Create modal */}
      {createOpen && (
        <GoalFormModal
          onClose={() => setCreateOpen(false)}
          onSubmit={async (values) => {
            await createGoal(values);
          }}
        />
      )}

      {/* Edit modal */}
      {editingGoal && (
        <GoalFormModal
          goal={editingGoal}
          onClose={() => setEditingGoal(null)}
          onSubmit={async ({ title, target_amount }) => {
            await updateGoal({ goalId: editingGoal.goal_id, title, target_amount });
          }}
        />
      )}
    </>
  );
}

// ── Пересчёт распределения по целям ──────────────────────────────────────────
// Реплей событий: исторические доходы на накопительные кошельки падают
// в «Без цели» (фикс зависших денег). Идемпотентно.
function RebuildAllocationsButton() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function rebuild() {
    if (busy) return;
    setBusy(true);
    try {
      await api.post("/api/v2/goals/rebuild-allocations", {});
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      setDone(true);
      setTimeout(() => setDone(false), 3000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={rebuild} loading={busy}>
      <RotateCcw size={13} className="mr-1" />
      {done ? "Готово ✓" : "Пересчитать"}
    </Button>
  );
}

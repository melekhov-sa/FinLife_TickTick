"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { PageTabs } from "@/components/layout/PageTabs";
import { Target, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/primitives/Badge";
import { Card } from "@/components/primitives/Card";
import { Checkbox } from "@/components/primitives/Checkbox";
import { Skeleton } from "@/components/primitives/Skeleton";
import { ProgressBar } from "@/components/primitives/ProgressBar";
import { EmptyState } from "@/components/primitives/EmptyState";
import { SectionHeader } from "@/components/primitives/SectionHeader";

// ── Types ──────────────────────────────────────────────────────────────────────

interface GoalItem {
  goal_id: number;
  title: string;
  currency: string;
  target_amount: string | null;
  current_balance: string;
  percent: number | null;
  wallet_count: number;
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

// ── GoalCard ──────────────────────────────────────────────────────────────────

function GoalCard({ goal }: { goal: GoalItem }) {
  const pct = Math.min(goal.percent ?? 0, 100);

  return (
    <Card padding="lg" hover className="space-y-3">
      {/* Title row */}
      <div className="flex items-center justify-between gap-2">
        <h3
          className="text-[15px] font-semibold leading-snug truncate"
          style={{ color: goal.is_archived ? "var(--t-faint)" : "var(--t-primary)", letterSpacing: "-0.01em" }}
        >
          {goal.title}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {goal.is_system && <Badge variant="warning" size="sm">Системная</Badge>}
          {goal.is_archived && <Badge variant="neutral" size="sm">Архив</Badge>}
        </div>
      </div>

      {/* Progress bar (only when target is set) */}
      {goal.target_amount ? (
        <div className="space-y-1.5">
          <ProgressBar value={pct} max={100} variant="primary" size="md" />
          <div className="flex items-center justify-between text-[12px]">
            <span style={{ color: "var(--t-muted)" }}>
              {formatAmount(goal.current_balance)} / {formatAmount(goal.target_amount)}{" "}
              {currencySymbol(goal.currency)}
            </span>
            <span className="font-semibold" style={{ color: "var(--t-secondary)" }}>
              {goal.percent ?? 0}%
            </span>
          </div>
        </div>
      ) : (
        /* No target — show balance only */
        <p className="text-[14px] font-semibold tabular-nums" style={{ color: "var(--t-secondary)" }}>
          {formatAmount(goal.current_balance)} {currencySymbol(goal.currency)}
        </p>
      )}

      {/* Footer */}
      <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>
        {goal.wallet_count}{" "}
        {goal.wallet_count === 1 ? "кошелёк" : goal.wallet_count >= 2 && goal.wallet_count <= 4 ? "кошелька" : "кошельков"}
      </p>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function GoalsPage() {
  const [showArchived, setShowArchived] = useState(false);

  const { data: allGoals, isLoading, isError } = useQuery<GoalItem[]>({
    queryKey: ["goals", showArchived],
    queryFn: () => api.get<GoalItem[]>(`/api/v2/goals?include_archived=${showArchived}`),
    staleTime: 60_000,
  });

  const goals = allGoals
    ? allGoals.filter((g) => showArchived ? g.is_archived : !g.is_archived)
    : undefined;

  return (
    <>
      <AppTopbar title="Деньги" />
      <PageTabs tabs={[
        { href: "/money", label: "Операции" },
        { href: "/wallets", label: "Кошельки" },
        { href: "/subscriptions", label: "Подписки" },
        { href: "/categories", label: "Категории" },
        { href: "/goals", label: "Цели" },
      ]} />

      <main className="flex-1 overflow-auto p-4 md:p-6 max-w-4xl">
        {/* Header actions */}
        <div className="mb-5">
          <SectionHeader
            title="Накопительные цели"
            size="sm"
            actions={
              <Checkbox
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                label="Архивные"
                size="sm"
              />
            }
          />
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
            icon={<AlertCircle size={24} />}
            title="Не удалось загрузить цели"
            size="md"
          />
        )}

        {/* Goal grid */}
        {!isLoading && !isError && goals && goals.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {goals.map((goal) => (
              <GoalCard key={goal.goal_id} goal={goal} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && goals && goals.length === 0 && (
          <EmptyState
            icon={<Target size={24} />}
            title={showArchived ? "Нет архивных целей" : "Нет активных целей"}
          />
        )}
      </main>
    </>
  );
}

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { Target } from "lucide-react";
import { api } from "@/lib/api";

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
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-3 hover:bg-white/[0.045] transition-all">
      {/* Title row */}
      <div className="flex items-center justify-between gap-2">
        <h3
          className="text-[15px] font-semibold leading-snug truncate"
          style={{ color: goal.is_archived ? "var(--t-faint)" : "var(--t-primary)", letterSpacing: "-0.01em" }}
        >
          {goal.title}
        </h3>
        <div className="flex items-center gap-1.5 shrink-0">
          {goal.is_system && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-semibold border border-amber-500/20">
              Системная
            </span>
          )}
          {goal.is_archived && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.08] text-white/40 font-semibold border border-white/[0.10]">
              Архив
            </span>
          )}
        </div>
      </div>

      {/* Progress bar (only when target is set) */}
      {goal.target_amount ? (
        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
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
    </div>
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
      <AppTopbar
        title="Аналитика"
        subtitle={goals ? (showArchived ? "Архивные" : `${goals.length} активных`) : undefined}
      />

      <main className="flex-1 overflow-auto p-4 md:p-6 max-w-4xl">
        {/* Header actions */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
            Накопительные цели
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: "var(--t-muted)" }}>
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded"
              />
              Архивные
            </label>
            <a
              href="/legacy/goals"
              className="text-[12px] font-medium transition-colors hover:text-indigo-400"
              style={{ color: "var(--t-muted)" }}
            >
              Управление целями →
            </a>
          </div>
        </div>

        {/* Loading skeletons */}
        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-36 bg-white/[0.03] rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Error */}
        {isError && (
          <p className="text-red-400/70 text-sm text-center py-12">
            Не удалось загрузить цели
          </p>
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
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              <Target size={20} className="text-white/35" />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--t-muted)" }}>
              {showArchived ? "Нет архивных целей" : "Нет активных целей"}
            </p>
            {!showArchived && (
              <a
                href="/legacy/goals"
                className="text-[13px] font-medium text-indigo-400/60 hover:text-indigo-400 transition-colors"
              >
                Создать цель →
              </a>
            )}
          </div>
        )}
      </main>
    </>
  );
}

"use client";

/**
 * Накопления — аналитика по SAVINGS-кошелькам.
 *
 * Семантика: переводы на кошелёк = взносы своих денег, доход (INCOME) =
 * проценты. Страница показывает: сводные KPI, доход по месяцам,
 * по каждому вкладу — баланс, разбивку «взносы/проценты», доходность.
 */

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTabSwipe } from "@/lib/useTabSwipe";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, PiggyBank } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Tabs } from "@/components/primitives/Tabs";
import { Skeleton } from "@/components/primitives/Skeleton";
import { AssignGoalSheet, type AssignGoalTarget } from "@/components/goals/AssignGoalSheet";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonthPoint { month: string; income: number; contrib?: number }

interface GoalWithWallets {
  goal_id: number;
  title: string;
  is_system: boolean;
  wallets: { wallet_id: number; title: string; amount: string }[];
}

interface SavingsWallet {
  wallet_id: number;
  title: string;
  currency: string;
  balance: number;
  own_money: number;
  income_total: number;
  income_12m: number;
  contrib_in: number;
  contrib_out: number;
  apy: number | null;
  monthly: MonthPoint[];
}

interface SavingsReport {
  totals: {
    balance: number;
    income_total: number;
    income_12m: number;
    portfolio_apy: number | null;
  } | null;
  months: MonthPoint[];
  wallets: SavingsWallet[];
}

const MONEY_TABS = [
  { id: "/money",      label: "Операции" },
  { id: "/wallets",    label: "Кошельки" },
  { id: "/categories", label: "Категории" },
  { id: "/goals",      label: "Цели" },
  { id: "/savings",    label: "Накопления" },
];

function fmt(n: number, frac = 0): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: frac, maximumFractionDigits: 2 });
}

const MONTH_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function monthLabel(m: string): string {
  const mm = Number(m.slice(5, 7));
  return MONTH_SHORT[mm - 1] ?? m;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SavingsPage() {
  useTabSwipe(["/money", "/wallets", "/categories", "/goals", "/savings"], "/savings");
  const pathname = usePathname();
  const router = useRouter();

  const { data, isLoading } = useQuery<SavingsReport>({
    queryKey: ["savings-report"],
    queryFn: () => api.get<SavingsReport>("/api/v2/analytics/savings"),
    staleTime: 60_000,
  });

  // Сколько на каждом кошельке лежит в системной цели «Без цели».
  // Разбивка по кошелькам есть только в целях, поэтому берём оттуда.
  const { data: goals } = useQuery<GoalWithWallets[]>({
    queryKey: ["goals", false],
    queryFn: () => api.get<GoalWithWallets[]>("/api/v2/goals?include_archived=false"),
    staleTime: 60_000,
  });

  const unassignedByWallet = useMemo(() => {
    const map = new Map<number, { goalId: number; goalTitle: string; amount: number }>();
    for (const g of goals ?? []) {
      if (!g.is_system) continue;
      for (const w of g.wallets ?? []) {
        const amount = parseFloat(w.amount) || 0;
        if (amount > 0) {
          map.set(w.wallet_id, { goalId: g.goal_id, goalTitle: g.title, amount });
        }
      }
    }
    return map;
  }, [goals]);

  const [assignTarget, setAssignTarget] = useState<AssignGoalTarget | null>(null);

  return (
    <>
      <PageHeader
        title="Деньги"
        tabs={
          <Tabs
            items={MONEY_TABS}
            active={pathname ?? "/savings"}
            onChange={(id) => router.push(id)}
          />
        }
      />
      <main className="flex-1 p-4 md:p-6 max-w-4xl space-y-4">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton variant="rect" className="h-24 rounded-xl" />
            <Skeleton variant="rect" className="h-40 rounded-xl" />
            <Skeleton variant="rect" className="h-40 rounded-xl" />
          </div>
        )}

        {data && !data.totals && (
          <p className="text-[13px] py-10 text-center" style={{ color: "var(--t-faint)" }}>
            Нет накопительных кошельков
          </p>
        )}

        {data?.totals && (
          <>
            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Kpi label="Всего накоплений" value={`${fmt(data.totals.balance)} ₽`} />
              <Kpi
                label="Доход за всё время"
                value={`+${fmt(data.totals.income_total)} ₽`}
                accent="var(--c-success-ink)"
              />
              <Kpi
                label="Доход за 12 мес"
                value={`+${fmt(data.totals.income_12m)} ₽`}
                accent="var(--c-success-ink)"
              />
              <Kpi
                label="Доходность портфеля"
                value={data.totals.portfolio_apy != null ? `${fmt(data.totals.portfolio_apy, 1)}% год.` : "—"}
                accent="var(--app-accent)"
              />
            </div>

            {/* Доход по месяцам */}
            <Block title="Доход по месяцам">
              <MonthBars points={data.months} color="var(--c-success-ink)" />
            </Block>

            {/* Вклады */}
            <div className="space-y-3 stagger-rise">
              {data.wallets.map((w) => {
                const un = unassignedByWallet.get(w.wallet_id);
                return (
                  <WalletCard
                    key={w.wallet_id}
                    w={w}
                    unassigned={un}
                    onAssign={un ? () => setAssignTarget({
                      walletId: w.wallet_id,
                      walletTitle: w.title,
                      currency: w.currency,
                      fromGoalId: un.goalId,
                      fromGoalTitle: un.goalTitle,
                      amount: un.amount,
                    }) : undefined}
                  />
                );
              })}
            </div>

            <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>
              Взносы — переводы на кошелёк, доход — операции «доход» (проценты).
              Доходность: доход за окно / средний остаток на конец месяца, в годовых.
            </p>
          </>
        )}
      </main>

      <AssignGoalSheet target={assignTarget} onClose={() => setAssignTarget(null)} />

    </>
  );
}

// ── Blocks ────────────────────────────────────────────────────────────────────

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{ background: "var(--app-card-bg)", borderColor: "var(--app-card-border)" }}
    >
      <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "var(--t-faint)" }}>
        {label}
      </p>
      <p className="text-[16px] font-bold tabular-nums font-display" style={{ color: accent ?? "var(--t-primary)" }}>
        {value}
      </p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{ background: "var(--app-card-bg)", borderColor: "var(--app-card-border)" }}
    >
      <p className="text-[12px] font-semibold mb-3 flex items-center gap-1.5" style={{ color: "var(--t-muted)" }}>
        <TrendingUp size={13} style={{ color: "var(--app-accent)" }} />
        {title}
      </p>
      {children}
    </div>
  );
}

function MonthBars({ points, color }: { points: MonthPoint[]; color: string }) {
  const max = Math.max(...points.map((p) => p.income), 1);
  return (
    <div className="flex items-end gap-1 h-28">
      {points.map((p) => (
        <div key={p.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <span className="text-[9px] tabular-nums" style={{ color: "var(--t-faint)" }}>
            {p.income > 0 ? fmt(p.income) : ""}
          </span>
          <div
            className="w-full rounded-t-md transition-all"
            style={{
              height: `${Math.max((p.income / max) * 80, p.income > 0 ? 4 : 1)}px`,
              background: p.income > 0 ? color : "var(--app-border)",
              opacity: p.income > 0 ? 0.9 : 0.6,
            }}
          />
          <span className="text-[9px]" style={{ color: "var(--t-faint)" }}>
            {monthLabel(p.month)}
          </span>
        </div>
      ))}
    </div>
  );
}

function WalletCard({
  w,
  unassigned,
  onAssign,
}: {
  w: SavingsWallet;
  /** Сколько на этом кошельке лежит в системной цели «Без цели». */
  unassigned?: { goalId: number; goalTitle: string; amount: number };
  onAssign?: () => void;
}) {
  const ownPct = w.balance > 0 ? Math.max(0, Math.min(100, (w.own_money / w.balance) * 100)) : 100;
  return (
    <div
      className="rounded-2xl border p-4 space-y-3"
      style={{ background: "var(--app-card-bg)", borderColor: "var(--app-card-border)" }}
    >
      <div className="flex items-center gap-2">
        <PiggyBank size={16} style={{ color: "var(--app-accent)" }} />
        <span className="text-[14px] font-semibold truncate" style={{ color: "var(--t-primary)" }}>
          {w.title}
        </span>
        {w.apy != null && (
          <span
            className="ml-auto shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums"
            style={{ background: "rgba(16,185,129,0.12)", color: "var(--c-success-ink)" }}
          >
            {fmt(w.apy, 1)}% год.
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-[18px] font-bold tabular-nums font-display" style={{ color: "var(--t-primary)" }}>
          {fmt(w.balance)} {w.currency === "RUB" ? "₽" : w.currency}
        </span>
        <span className="text-[11px] tabular-nums" style={{ color: "var(--c-success-ink)" }}>
          +{fmt(w.income_total)} доход
        </span>
      </div>

      {/* Взносы vs проценты */}
      <div>
        <div className="h-2 rounded-full overflow-hidden flex" style={{ background: "var(--app-border-subtle)" }}>
          <div style={{ width: `${ownPct}%`, background: "var(--app-accent)", opacity: 0.55 }} />
          <div style={{ width: `${100 - ownPct}%`, background: "var(--c-success-ink)" }} />
        </div>
        <div className="flex justify-between mt-1 text-[10px] tabular-nums" style={{ color: "var(--t-faint)" }}>
          <span>взносы {fmt(w.own_money)}</span>
          <span style={{ color: "var(--c-success-ink)" }}>проценты {fmt(w.income_total)}</span>
        </div>
      </div>

      {/* Деньги без цели: переводы без указанной цели падают в системную
          «Без цели» и там незаметно копятся. Раскладывать их приходилось
          обычным переводом с одним и тем же кошельком с двух сторон. */}
      {unassigned && unassigned.amount > 0 && onAssign && (
        <button
          type="button"
          onClick={onAssign}
          className="w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left"
          style={{ background: "var(--app-accent-weak)" }}
        >
          <span className="text-[12px] min-w-0 truncate" style={{ color: "var(--t-secondary)" }}>
            Без цели
          </span>
          <span
            className="text-[12.5px] font-semibold tabular-nums shrink-0"
            style={{ color: "var(--app-accent)" }}
          >
            {fmt(unassigned.amount)} → привязать
          </span>
        </button>
      )}

      {/* Мини-график дохода по месяцам */}
      <MiniBars points={w.monthly} />
    </div>
  );
}

function MiniBars({ points }: { points: MonthPoint[] }) {
  const max = Math.max(...points.map((p) => p.income), 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {points.map((p) => (
        <div
          key={p.month}
          title={`${monthLabel(p.month)}: +${fmt(p.income)}`}
          className="flex-1 rounded-sm"
          style={{
            height: `${Math.max((p.income / max) * 100, p.income > 0 ? 12 : 4)}%`,
            background: p.income > 0 ? "var(--c-success-ink)" : "var(--app-border)",
            opacity: p.income > 0 ? 0.85 : 0.5,
          }}
        />
      ))}
    </div>
  );
}

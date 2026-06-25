"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Skeleton } from "@/components/primitives/Skeleton";
import { api } from "@/lib/api";
import { BudgetCategoryPanel, type BudgetCategoryStats } from "@/components/budget/BudgetCategoryPanel";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MonthPoint {
  year: number;
  month: number;
  label: string;
  income: number;
  expense: number;
  savings: number;
}

interface BudgetStatsData {
  kpi: {
    avg_income_6m: number;
    avg_expense_6m: number;
    avg_savings_6m: number;
    avg_savings_rate_6m: number | null;
    plan_accuracy_expense_6m: number | null;
    savings_total: number;
    runway_months: number | null;
    avg_check: number | null;
    tx_per_month: number | null;
    exp_tx_count: number;
  };
  monthly_trend: MonthPoint[];
  categories: BudgetCategoryStats[];
  out_of_plan: {
    avg: number;
    total: number;
    categories: { title: string; avg: number }[];
  };
  mandatory: {
    configured: boolean;
    mandatory_avg: number;
    optional_avg: number;
    mandatory_pct_income: number | null;
    free_money: number;
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function useBudgetStats(months: number) {
  return useQuery<BudgetStatsData>({
    queryKey: ["analytics", "budget-stats", months],
    queryFn: () => api.get<BudgetStatsData>(`/api/v2/analytics/budget-stats?months=${months}`),
    staleTime: 5 * 60_000,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n);
}

function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + "М";
  if (Math.abs(n) >= 1_000) return Math.round(n / 1_000) + "К";
  return String(Math.round(n));
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "green" | "red" | "indigo" | "neutral";
}) {
  const colors = {
    green: "text-emerald-600 dark:text-emerald-400",
    red: "text-red-600 dark:text-red-400",
    indigo: "text-indigo-600 dark:text-indigo-400",
    neutral: "",
  };
  return (
    <div
      className="rounded-[14px] p-4"
      style={{
        background: "var(--app-sidebar-bg)",
        border: "1px solid var(--app-border)",
      }}
    >
      <p className="text-[11px] font-medium mb-2 uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
        {label}
      </p>
      <p
        className={`text-[22px] font-bold tabular-nums leading-none ${colors[accent ?? "neutral"]}`}
        style={{ letterSpacing: "-0.03em", color: accent ? undefined : "var(--t-primary)" }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[11px] mt-1" style={{ color: "var(--t-faint)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Monthly trend chart ───────────────────────────────────────────────────────

type ChartMode = "both" | "expense" | "income";

function MonthlyTrendChart({ data }: { data: MonthPoint[] }) {
  const [mode, setMode] = useState<ChartMode>("both");

  const maxVal = Math.max(
    ...data.map((d) =>
      mode === "expense" ? d.expense : mode === "income" ? d.income : Math.max(d.income, d.expense)
    ),
    1
  );

  const tabs: { key: ChartMode; label: string }[] = [
    { key: "both", label: "Всё" },
    { key: "expense", label: "Расходы" },
    { key: "income", label: "Доходы" },
  ];

  return (
    <div
      className="rounded-[14px] p-5"
      style={{ background: "var(--app-sidebar-bg)", border: "1px solid var(--app-border)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--t-primary)" }}>
          Доходы и расходы — 12 мес.
        </h2>
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--app-border)" }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setMode(t.key)}
              className="text-[11px] font-medium px-2.5 py-1 transition-colors"
              style={{
                background: mode === t.key ? "var(--app-accent)" : "transparent",
                color: mode === t.key ? "#fff" : "var(--t-faint)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-1 h-28 overflow-x-auto pb-1">
        {data.map((d) => {
          const incPct = mode !== "expense" ? (d.income / maxVal) * 100 : 0;
          const expPct = mode !== "income" ? (d.expense / maxVal) * 100 : 0;
          return (
            <div key={`${d.year}-${d.month}`} className="flex flex-col items-center gap-0.5 flex-1 min-w-[20px]">
              <div className="w-full flex items-end gap-0.5 h-20">
                {mode !== "expense" && (
                  <div
                    className="flex-1 rounded-t-sm"
                    style={{ height: `${incPct}%`, background: "#10b981", opacity: 0.85, minHeight: incPct > 0 ? 2 : 0 }}
                  />
                )}
                {mode !== "income" && (
                  <div
                    className="flex-1 rounded-t-sm"
                    style={{ height: `${expPct}%`, background: "#6366f1", opacity: 0.85, minHeight: expPct > 0 ? 2 : 0 }}
                  />
                )}
              </div>
              <span className="text-[9px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                {d.label.split(" ")[0]}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-2">
        {mode !== "expense" && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded-sm" style={{ background: "#10b981" }} />
            <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>доходы</span>
          </div>
        )}
        {mode !== "income" && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-2 rounded-sm" style={{ background: "#6366f1" }} />
            <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>расходы</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Category list ─────────────────────────────────────────────────────────────

function CategoryList({
  cats,
  kind,
  months,
  onSelect,
}: {
  cats: BudgetCategoryStats[];
  kind: "INCOME" | "EXPENSE";
  months: number;
  onSelect: (c: BudgetCategoryStats) => void;
}) {
  const filtered = cats.filter((c) => c.kind === kind);
  const maxAvg = Math.max(...filtered.map((c) => c.avg_6m), 1);
  const title = kind === "EXPENSE" ? "Расходы по категориям" : "Доходы по категориям";
  const color = kind === "EXPENSE" ? "#6366f1" : "#10b981";

  if (filtered.length === 0) return null;

  return (
    <div
      className="rounded-[14px] p-5"
      style={{ background: "var(--app-sidebar-bg)", border: "1px solid var(--app-border)" }}
    >
      <h2 className="text-[13px] font-semibold mb-4" style={{ color: "var(--t-primary)" }}>
        {title}
        <span className="ml-1.5 text-[11px] font-normal" style={{ color: "var(--t-faint)" }}>
          ср. {months} мес
        </span>
      </h2>
      <div className="space-y-3">
        {filtered.map((c) => {
          const barPct = (c.avg_6m / maxAvg) * 100;
          const trend = c.trend_pct;
          const trendUp = trend !== null && trend > 0;
          const trendDown = trend !== null && trend < 0;
          const TrendIcon = trendUp ? TrendingUp : trendDown ? TrendingDown : Minus;
          const isGood = kind === "EXPENSE" ? trendDown : trendUp;
          const trendColor = trend === null ? "var(--t-faint)" : isGood ? "#10b981" : "#ef4444";

          return (
            <div
              key={c.category_id}
              className="cursor-pointer group"
              onClick={() => onSelect(c)}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-[12px] font-medium truncate group-hover:underline"
                  style={{ color: "var(--t-primary)" }}
                >
                  {c.title}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {trend !== null && (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: trendColor }}>
                      <TrendIcon size={11} strokeWidth={2} />
                      {Math.abs(trend)}%
                    </span>
                  )}
                  <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--t-primary)" }}>
                    {fmtK(c.avg_6m)} ₽
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>
                    {c.pct_of_total_6m}%
                  </span>
                </div>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "var(--app-border)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${barPct}%`, background: color, opacity: 0.8 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: 3, label: "3М" },
  { value: 6, label: "6М" },
  { value: 12, label: "12М" },
];

// ── Savings-rate trend + best/worst + cumulative ───────────────────────────────

function SavingsRateBlock({ data }: { data: MonthPoint[] }) {
  const pts = data.filter((m) => m.income > 0 || m.expense > 0);
  if (pts.length === 0) return null;
  const rates = pts.map((m) => ({
    label: m.label,
    rate: m.income > 0 ? Math.round((m.savings / m.income) * 100) : 0,
    savings: m.savings,
  }));
  const best = pts.reduce((a, b) => (b.savings > a.savings ? b : a));
  const worst = pts.reduce((a, b) => (b.savings < a.savings ? b : a));
  const cumulative = pts.reduce((s, m) => s + m.savings, 0);
  const maxAbs = Math.max(1, ...rates.map((r) => Math.abs(r.rate)));

  return (
    <div className="bg-white dark:bg-white/[0.05] rounded-[14px] border border-slate-200 dark:border-white/[0.09] p-4 md:p-5">
      <h3 className="text-[13px] md:text-[14px] font-semibold mb-3" style={{ color: "var(--t-primary)" }}>
        Норма сбережений по месяцам
      </h3>
      <div className="flex items-end gap-1.5 h-24">
        {rates.map((r, i) => {
          const h = Math.max(2, (Math.abs(r.rate) / maxAbs) * 88);
          const pos = r.rate >= 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${r.label}: ${r.rate}%`}>
              <span className="text-[9px] tabular-nums" style={{ color: pos ? "#10B981" : "#EF4444" }}>{r.rate}%</span>
              <div className="w-full rounded-t" style={{ height: h, background: pos ? "#10B981" : "#EF4444", opacity: 0.85 }} />
              <span className="text-[8px]" style={{ color: "var(--t-faint)" }}>{r.label.split(" ")[0]}</span>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t" style={{ borderColor: "var(--app-border)" }}>
        <div>
          <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>Лучший месяц</p>
          <p className="text-[13px] font-semibold tabular-nums money-income">{best.label}: {fmtK(best.savings)} ₽</p>
        </div>
        <div>
          <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>Худший месяц</p>
          <p className="text-[13px] font-semibold tabular-nums money-expense">{worst.label}: {fmtK(worst.savings)} ₽</p>
        </div>
        <div>
          <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>Накоплено за период</p>
          <p className="text-[13px] font-semibold tabular-nums" style={{ color: cumulative >= 0 ? "var(--t-primary)" : "#EF4444" }}>{fmtK(cumulative)} ₽</p>
        </div>
      </div>
    </div>
  );
}

// ── Income concentration + top-5 expense share ─────────────────────────────────

function StructureBlock({ cats }: { cats: BudgetCategoryStats[] }) {
  const inc = cats.filter((c) => c.kind === "INCOME");
  const exp = cats.filter((c) => c.kind === "EXPENSE");
  const topIncome = inc.length ? inc.reduce((a, b) => (b.pct_of_total_6m > a.pct_of_total_6m ? b : a)) : null;
  const top5Share = exp.slice(0, 5).reduce((s, c) => s + c.pct_of_total_6m, 0);
  const concentrated = topIncome && topIncome.pct_of_total_6m >= 70;

  return (
    <div className="bg-white dark:bg-white/[0.05] rounded-[14px] border border-slate-200 dark:border-white/[0.09] p-4 md:p-5">
      <h3 className="text-[13px] md:text-[14px] font-semibold mb-3" style={{ color: "var(--t-primary)" }}>
        Структура и концентрация
      </h3>
      <div className="space-y-3">
        {topIncome && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12px]" style={{ color: "var(--t-muted)" }}>Главный источник дохода</span>
              <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--t-primary)" }}>
                {topIncome.title} · {topIncome.pct_of_total_6m}%
              </span>
            </div>
            {concentrated && (
              <p className="text-[11px] mt-1 text-amber-600 dark:text-amber-400">
                ⚠ Почти весь доход из одного источника — стоит диверсифицировать
              </p>
            )}
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px]" style={{ color: "var(--t-muted)" }}>Доля топ-5 категорий расходов</span>
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--t-primary)" }}>{top5Share}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--app-border)" }}>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, top5Share)}%`, background: "var(--app-accent)" }} />
        </div>
      </div>
    </div>
  );
}

// ── Out-of-plan expenses ───────────────────────────────────────────────────────

function OutOfPlanBlock({ data }: { data: BudgetStatsData["out_of_plan"] }) {
  if (!data || data.categories.length === 0) return null;
  return (
    <div className="bg-white dark:bg-white/[0.05] rounded-[14px] border border-slate-200 dark:border-white/[0.09] p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-[13px] md:text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>
          Расходы вне плана
        </h3>
        <span className="text-[13px] font-semibold tabular-nums money-expense">{fmtK(data.avg)} ₽/мес</span>
      </div>
      <p className="text-[11px] mb-3" style={{ color: "var(--t-faint)" }}>
        Категории, где есть траты, но не задан план в бюджете
      </p>
      <div className="space-y-1.5">
        {data.categories.map((c, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2">
            <span className="text-[12px] truncate" style={{ color: "var(--t-secondary)" }}>{c.title}</span>
            <span className="text-[12px] font-semibold tabular-nums shrink-0" style={{ color: "var(--t-muted)" }}>{fmtK(c.avg)} ₽</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mandatory vs optional expenses ─────────────────────────────────────────────

function MandatoryBlock({ data }: { data: BudgetStatsData["mandatory"] }) {
  if (!data) return null;
  if (!data.configured) {
    return (
      <div className="bg-white dark:bg-white/[0.05] rounded-[14px] border border-slate-200 dark:border-white/[0.09] p-4 md:p-5">
        <h3 className="text-[13px] md:text-[14px] font-semibold mb-1" style={{ color: "var(--t-primary)" }}>
          Обязательные vs необязательные
        </h3>
        <p className="text-[12px]" style={{ color: "var(--t-muted)" }}>
          Пометь обязательные статьи (ипотека, коммуналка, абонементы…) в разделе{" "}
          <Link href="/categories" className="text-indigo-500 hover:text-indigo-600 font-medium">Категории</Link>{" "}
          — и здесь появится разбивка обязательных/необязательных расходов и «свободные деньги».
        </p>
      </div>
    );
  }
  const total = Math.max(1, data.mandatory_avg + data.optional_avg);
  const mandPct = Math.round((data.mandatory_avg / total) * 100);
  return (
    <div className="bg-white dark:bg-white/[0.05] rounded-[14px] border border-slate-200 dark:border-white/[0.09] p-4 md:p-5">
      <h3 className="text-[13px] md:text-[14px] font-semibold mb-3" style={{ color: "var(--t-primary)" }}>
        Обязательные vs необязательные
      </h3>
      <div className="flex h-3 rounded-full overflow-hidden mb-2" style={{ background: "var(--app-border)" }}>
        <div style={{ width: `${mandPct}%`, background: "#EF4444" }} title={`Обязательные ${mandPct}%`} />
        <div style={{ width: `${100 - mandPct}%`, background: "#10B981" }} title={`Необязательные ${100 - mandPct}%`} />
      </div>
      <div className="flex items-center justify-between text-[11px] mb-4" style={{ color: "var(--t-muted)" }}>
        <span>🔴 Обязательные {fmtK(data.mandatory_avg)} ₽ ({mandPct}%)</span>
        <span>🟢 Необязательные {fmtK(data.optional_avg)} ₽</span>
      </div>
      <div className="grid grid-cols-2 gap-3 pt-3 border-t" style={{ borderColor: "var(--app-border)" }}>
        <div>
          <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>Обязательные от дохода</p>
          <p className="text-[15px] font-bold tabular-nums" style={{ color: "var(--t-primary)" }}>
            {data.mandatory_pct_income !== null ? `${data.mandatory_pct_income}%` : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>Свободные деньги</p>
          <p className="text-[15px] font-bold tabular-nums money-income">{fmtK(data.free_money)} ₽</p>
          <p className="text-[10px]" style={{ color: "var(--t-faint)" }}>доход минус обязательные</p>
        </div>
      </div>
    </div>
  );
}

export default function BudgetStatsPage() {
  const [months, setMonths] = useState(6);
  const { data, isPending } = useBudgetStats(months);
  const [selectedCat, setSelectedCat] = useState<BudgetCategoryStats | null>(null);

  return (
    <>
      <PageHeader
        title="Статистика бюджета"
        density="compact"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--app-border)" }}>
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMonths(opt.value)}
                  className="text-[11px] font-medium px-2.5 py-1 transition-colors"
                  style={{
                    background: months === opt.value ? "var(--app-accent)" : "transparent",
                    color: months === opt.value ? "#fff" : "var(--t-faint)",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Link
              href="/budget"
              className="flex items-center gap-1 text-[12px] font-medium px-2.5 py-1 rounded-lg border transition-colors"
              style={{ color: "var(--t-secondary)", borderColor: "var(--app-border)" }}
            >
              <ChevronLeft size={14} />
              Бюджет
            </Link>
          </div>
        }
      />

      <main className="flex-1 p-3 md:p-6 w-full space-y-4">
        {isPending && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} variant="rect" height={88} className="rounded-[14px]" />
              ))}
            </div>
            <Skeleton variant="rect" height={180} className="rounded-[14px]" />
          </div>
        )}

        {data && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label={`Ср. доход ${months}М`}
                value={fmtK(data.kpi.avg_income_6m) + " ₽"}
                sub="в месяц"
                accent="green"
              />
              <KpiCard
                label={`Ср. расход ${months}М`}
                value={fmtK(data.kpi.avg_expense_6m) + " ₽"}
                sub="в месяц"
                accent="red"
              />
              <KpiCard
                label="Ср. сбережения"
                value={fmtK(data.kpi.avg_savings_6m) + " ₽"}
                sub={data.kpi.avg_savings_rate_6m !== null ? `${data.kpi.avg_savings_rate_6m}% от дохода` : undefined}
                accent={data.kpi.avg_savings_6m >= 0 ? "green" : "red"}
              />
              <KpiCard
                label="Точность плана"
                value={
                  data.kpi.plan_accuracy_expense_6m !== null
                    ? data.kpi.plan_accuracy_expense_6m + "%"
                    : "—"
                }
                sub="расходы в рамках плана"
                accent={
                  data.kpi.plan_accuracy_expense_6m === null
                    ? "neutral"
                    : data.kpi.plan_accuracy_expense_6m >= 70
                    ? "green"
                    : "red"
                }
              />
            </div>

            {/* KPI row 2 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label="Финансовая подушка"
                value={data.kpi.runway_months !== null ? `${String(data.kpi.runway_months).replace(".", ",")} мес` : "—"}
                sub={`накоплений ${fmtK(data.kpi.savings_total)} ₽`}
                accent={
                  data.kpi.runway_months === null ? "neutral"
                  : data.kpi.runway_months >= 6 ? "green"
                  : data.kpi.runway_months >= 3 ? "indigo"
                  : "red"
                }
              />
              <KpiCard
                label="Прогноз накоплений"
                value={fmtK(data.kpi.avg_savings_6m * 12) + " ₽"}
                sub="за 12 мес при текущем темпе"
                accent={data.kpi.avg_savings_6m >= 0 ? "green" : "red"}
              />
              <KpiCard
                label="Средний чек расхода"
                value={data.kpi.avg_check !== null ? fmtK(data.kpi.avg_check) + " ₽" : "—"}
                sub={data.kpi.tx_per_month !== null ? `${String(data.kpi.tx_per_month).replace(".", ",")} операций/мес` : undefined}
                accent="neutral"
              />
              <KpiCard
                label="Расходы вне плана"
                value={fmtK(data.out_of_plan?.avg ?? 0) + " ₽"}
                sub="в месяц, без плана в бюджете"
                accent={(data.out_of_plan?.avg ?? 0) > 0 ? "red" : "green"}
              />
            </div>

            {/* Trend chart */}
            <MonthlyTrendChart data={data.monthly_trend} />

            {/* Savings rate + structure */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SavingsRateBlock data={data.monthly_trend} />
              <StructureBlock cats={data.categories} />
            </div>

            {/* Mandatory + out-of-plan */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MandatoryBlock data={data.mandatory} />
              <OutOfPlanBlock data={data.out_of_plan} />
            </div>

            {/* Category breakdowns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CategoryList cats={data.categories} kind="EXPENSE" months={months} onSelect={setSelectedCat} />
              <CategoryList cats={data.categories} kind="INCOME" months={months} onSelect={setSelectedCat} />
            </div>
          </>
        )}
      </main>

      {selectedCat && (
        <BudgetCategoryPanel stats={selectedCat} onClose={() => setSelectedCat(null)} />
      )}
    </>
  );
}

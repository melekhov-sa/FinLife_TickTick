"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { PageTabs } from "@/components/layout/PageTabs";
import { api } from "@/lib/api";
import { clsx } from "clsx";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area,
  LineChart, Line,
} from "recharts";
import {
  TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight,
  Percent, Receipt, CalendarDays,
  CheckSquare, Heart, AlertTriangle, Flame, Zap,
  CreditCard, Target, Calendar,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Summary {
  income: number;
  expense: number;
  net: number;
  savings_rate: number;
  avg_daily_expense: number;
  transaction_count: number;
  prev_income: number;
  prev_expense: number;
  income_delta: number;
  expense_delta: number;
}

interface MonthlyPoint {
  month: string;
  income: number;
  expense: number;
  net: number;
}

interface CategoryItem {
  category_name: string;
  category_id: number | null;
  amount: number;
  percent: number;
}

interface DailyPoint {
  day: string;
  income: number;
  expense: number;
}

interface CategoryTrend {
  categories: string[];
  months: string[];
  series: Record<string, number[]>;
}

interface ProductivityData {
  tasks: {
    active: number;
    done_7d: number;
    done_30d: number;
    overdue: number;
    velocity_7d: number;
    weekly_trend: { week: string; count: number }[];
  };
  habits: {
    total: number;
    today_done: number;
    today_total: number;
    rate_7d: number;
    rate_30d: number;
    best_streak: number;
    daily_chart: { day: string; done: number; total: number }[];
    top_habits: { title: string; current_streak: number; best_streak: number; done_30d: number }[];
  };
}

interface HeatmapDay { date: string; count: number }
interface WalletBalData { wallets: { title: string; balance: number }[]; total: number; balance_trend: { month: string; balance: number }[] }
interface WeekdayItem { day: string; avg: number; total: number; count: number }
interface SubAnalytics { total_monthly: number; count: number; subscriptions: { name: string; cost: number; days_left: number | null }[]; expiring: { name: string; days_left: number; cost: number }[] }
interface HabitsMatrix { days: string[]; habits: { habit_id: number; title: string; days: number[] }[] }
interface GoalsProgress { goals: { title: string; current: number; target: number; percent: number; currency: string }[] }
interface MonthComp { current: MonthData; previous: MonthData }
interface MonthData { label: string; income: number; expense: number; net: number; ops: number; tasks_done: number; habits_rate: number }

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function monthLabel(m: string): string {
  const NAMES = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
  const idx = parseInt(m.slice(5)) - 1;
  return NAMES[idx] || m;
}

function dayLabel(d: string): string {
  return d.slice(8);
}

const PIE_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#64748b",
];

function periodOptions(): { value: string; label: string }[] {
  const MONTH_NAMES = [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ];
  const today = new Date();
  const opts: { value: string; label: string }[] = [];
  let y = today.getFullYear(), m = today.getMonth(); // 0-based
  for (let i = 0; i < 12; i++) {
    const val = `${y}-${String(m + 1).padStart(2, "0")}`;
    opts.push({ value: val, label: `${MONTH_NAMES[m]} ${y}` });
    m--;
    if (m < 0) { m = 11; y--; }
  }
  return opts;
}

// ── KPI Card ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, delta, icon: Icon, color, suffix }: {
  label: string;
  value: string;
  delta?: number | null;
  icon: typeof TrendingUp;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15` }}>
          <Icon size={15} style={{ color }} />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
          {label}
        </span>
      </div>
      <p className="text-[22px] font-bold tabular-nums leading-none mb-1" style={{ color: "var(--t-primary)" }}>
        {value}{suffix && <span className="text-[13px] font-normal ml-1" style={{ color: "var(--t-faint)" }}>{suffix}</span>}
      </p>
      {delta !== undefined && delta !== null && delta !== 0 && (
        <div className={clsx("flex items-center gap-1 text-[11px] font-medium", delta > 0 ? "text-emerald-400" : "text-red-400")}>
          {delta > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {delta > 0 ? "+" : ""}{fmt(delta)} vs прошлый месяц
        </div>
      )}
    </div>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-[#1a2235] border border-white/10 px-3 py-2 shadow-xl text-[12px]">
      <p className="font-medium mb-1" style={{ color: "var(--t-secondary)" }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="tabular-nums">
          {p.name}: {fmt(p.value)} ₽
        </p>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const opts = useMemo(periodOptions, []);
  const [period, setPeriod] = useState(opts[0].value);
  const [opType, setOpType] = useState<"EXPENSE" | "INCOME">("EXPENSE");

  const { data: summary } = useQuery<Summary>({
    queryKey: ["analytics-summary", period],
    queryFn: () => api.get(`/api/v2/analytics/summary?period=${period}`),
    staleTime: 60_000,
  });

  const { data: trend } = useQuery<MonthlyPoint[]>({
    queryKey: ["analytics-trend"],
    queryFn: () => api.get(`/api/v2/analytics/monthly-trend?months=12`),
    staleTime: 120_000,
  });

  const { data: breakdown } = useQuery<CategoryItem[]>({
    queryKey: ["analytics-breakdown", period, opType],
    queryFn: () => api.get(`/api/v2/analytics/category-breakdown?period=${period}&op_type=${opType}`),
    staleTime: 60_000,
  });

  const { data: daily } = useQuery<DailyPoint[]>({
    queryKey: ["analytics-daily", period],
    queryFn: () => api.get(`/api/v2/analytics/daily-spending?period=${period}`),
    staleTime: 60_000,
  });

  const { data: catTrend } = useQuery<CategoryTrend>({
    queryKey: ["analytics-cat-trend", opType],
    queryFn: () => api.get(`/api/v2/analytics/category-trend?op_type=${opType}&months=6`),
    staleTime: 120_000,
  });

  const { data: prod } = useQuery<ProductivityData>({
    queryKey: ["analytics-productivity"],
    queryFn: () => api.get("/api/v2/analytics/productivity"),
    staleTime: 60_000,
  });

  const { data: heatmap } = useQuery<{ days: HeatmapDay[] }>({
    queryKey: ["analytics-heatmap"], queryFn: () => api.get("/api/v2/analytics/activity-heatmap"), staleTime: 120_000,
  });
  const { data: walletBal } = useQuery<WalletBalData>({
    queryKey: ["analytics-wallet-bal"], queryFn: () => api.get("/api/v2/analytics/wallet-balances"), staleTime: 60_000,
  });
  const { data: spendWeekday } = useQuery<{ weekdays: WeekdayItem[] }>({
    queryKey: ["analytics-spend-weekday"], queryFn: () => api.get("/api/v2/analytics/spending-by-weekday"), staleTime: 120_000,
  });
  const { data: subAnalytics } = useQuery<SubAnalytics>({
    queryKey: ["analytics-subs"], queryFn: () => api.get("/api/v2/analytics/subscriptions-analytics"), staleTime: 60_000,
  });
  const { data: habitsMatrix } = useQuery<HabitsMatrix>({
    queryKey: ["analytics-habits-matrix"], queryFn: () => api.get("/api/v2/analytics/habits-matrix"), staleTime: 60_000,
  });
  const { data: goalsData } = useQuery<GoalsProgress>({
    queryKey: ["analytics-goals"], queryFn: () => api.get("/api/v2/analytics/goals-progress"), staleTime: 60_000,
  });
  const { data: prodWeekday } = useQuery<{ weekdays: { day: string; count: number }[] }>({
    queryKey: ["analytics-prod-weekday"], queryFn: () => api.get("/api/v2/analytics/productivity-by-weekday"), staleTime: 120_000,
  });
  const { data: monthComp } = useQuery<MonthComp>({
    queryKey: ["analytics-month-comp"], queryFn: () => api.get("/api/v2/analytics/month-comparison"), staleTime: 60_000,
  });

  const trendData = trend?.map((p) => ({ ...p, label: monthLabel(p.month) }));
  const dailyData = daily?.map((p) => ({ ...p, label: dayLabel(p.day) }));

  // Category trend → recharts format
  const catTrendData = catTrend
    ? catTrend.months.map((m, i) => {
        const point: Record<string, any> = { month: monthLabel(m) };
        catTrend.categories.forEach((cat) => {
          point[cat] = catTrend.series[cat]?.[i] ?? 0;
        });
        return point;
      })
    : [];

  return (
    <>
      <AppTopbar title="Аналитика" />
      <PageTabs tabs={[
        { href: "/analytics", label: "Обзор" },
        { href: "/efficiency", label: "Эффективность" },
        { href: "/strategy", label: "Стратегия" },
        { href: "/goals", label: "Цели" },
      ]} />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-[1100px] space-y-6">

          {/* Period selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-3 py-2 text-[13px] rounded-lg bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 [color-scheme:dark]"
              style={{ color: "var(--t-secondary)" }}
            >
              {opts.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.07] rounded-lg p-0.5">
              {(["EXPENSE", "INCOME"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setOpType(t)}
                  className={clsx(
                    "px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all",
                    opType === t ? "bg-indigo-600 text-white shadow-sm" : "hover:bg-white/[0.05]"
                  )}
                  style={{ color: opType === t ? undefined : "var(--t-secondary)" }}
                >
                  {t === "EXPENSE" ? "Расходы" : "Доходы"}
                </button>
              ))}
            </div>
          </div>

          {/* KPI cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label="Доходы"
                value={`${fmt(summary.income)} ₽`}
                delta={summary.income_delta}
                icon={TrendingUp}
                color="#10b981"
              />
              <KpiCard
                label="Расходы"
                value={`${fmt(summary.expense)} ₽`}
                delta={summary.expense_delta}
                icon={TrendingDown}
                color="#ef4444"
              />
              <KpiCard
                label="Накопления"
                value={`${summary.savings_rate}%`}
                icon={Percent}
                color="#6366f1"
              />
              <KpiCard
                label="Ср. расход/день"
                value={`${fmt(summary.avg_daily_expense)} ₽`}
                icon={CalendarDays}
                color="#f59e0b"
              />
            </div>
          )}

          {/* Additional KPIs row */}
          {summary && (
            <div className="grid grid-cols-3 gap-3">
              <KpiCard label="Баланс" value={`${fmt(summary.net)} ₽`} icon={Wallet} color={summary.net >= 0 ? "#10b981" : "#ef4444"} />
              <KpiCard label="Операций" value={String(summary.transaction_count)} icon={Receipt} color="#8b5cf6" />
              <KpiCard
                label="Расход vs прошл."
                value={summary.prev_expense > 0 ? `${summary.expense_delta > 0 ? "+" : ""}${Math.round((summary.expense - summary.prev_expense) / summary.prev_expense * 100)}%` : "—"}
                icon={summary.expense_delta <= 0 ? TrendingDown : TrendingUp}
                color={summary.expense_delta <= 0 ? "#10b981" : "#ef4444"}
              />
            </div>
          )}

          {/* Monthly trend chart */}
          {trendData && trendData.length > 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--t-faint)" }}>
                Доходы и расходы по месяцам
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={trendData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}к` : v} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="income" name="Доходы" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="expense" name="Расходы" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Net savings area chart */}
          {trendData && trendData.length > 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--t-faint)" }}>
                Чистые накопления по месяцам
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}к` : v} />
                  <Tooltip content={<ChartTooltip />} />
                  <defs>
                    <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="net" name="Баланс" stroke="#6366f1" fill="url(#netGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Two columns: pie + daily */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Category breakdown pie */}
            {breakdown && breakdown.length > 0 && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--t-faint)" }}>
                  {opType === "EXPENSE" ? "Расходы" : "Доходы"} по категориям
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={breakdown}
                      dataKey="amount"
                      nameKey="category_name"
                      cx="50%"
                      cy="50%"
                      outerRadius={95}
                      innerRadius={50}
                      paddingAngle={2}
                      label={({ category_name, percent }: any) => `${category_name} ${percent}%`}
                      labelLine={false}
                    >
                      {breakdown.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => `${fmt(Number(v))} ₽`} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Table */}
                <div className="mt-3 space-y-1.5">
                  {breakdown.slice(0, 8).map((c, i) => (
                    <div key={c.category_name} className="flex items-center gap-2 text-[12px]">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="flex-1 truncate" style={{ color: "var(--t-secondary)" }}>{c.category_name}</span>
                      <span className="tabular-nums font-medium" style={{ color: "var(--t-primary)" }}>{fmt(c.amount)} ₽</span>
                      <span className="tabular-nums w-10 text-right" style={{ color: "var(--t-faint)" }}>{c.percent}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Daily spending */}
            {dailyData && dailyData.length > 0 && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--t-faint)" }}>
                  Расходы по дням
                </h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dailyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} interval={1} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}к` : v} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="expense" name="Расходы" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="income" name="Доходы" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Category trend over months */}
          {catTrendData.length > 0 && catTrend && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--t-faint)" }}>
                Топ-5 категорий {opType === "EXPENSE" ? "расходов" : "доходов"} за 6 месяцев
              </h3>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={catTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}к` : v} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }} />
                  {catTrend.categories.map((cat, i) => (
                    <Line key={cat} type="monotone" dataKey={cat} stroke={PIE_COLORS[i]} strokeWidth={2} dot={{ r: 3 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ══ PRODUCTIVITY SECTION ══════════════════════════════════════════ */}
          {prod && (
            <>
              <div className="border-t border-white/[0.06] pt-6 mt-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--t-faint)" }}>
                  Продуктивность
                </h2>
              </div>

              {/* Task KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <KpiCard label="Активные задачи" value={String(prod.tasks.active)} icon={CheckSquare} color="#3b82f6" />
                <KpiCard label="Сделано за 7д" value={String(prod.tasks.done_7d)} icon={Zap} color="#10b981" />
                <KpiCard label="Сделано за 30д" value={String(prod.tasks.done_30d)} icon={TrendingUp} color="#6366f1" />
                <KpiCard label="Просрочено" value={String(prod.tasks.overdue)} icon={AlertTriangle} color={prod.tasks.overdue > 0 ? "#ef4444" : "#6B7280"} />
                <KpiCard label="Скорость / день" value={String(prod.tasks.velocity_7d)} icon={Zap} color="#f59e0b" />
              </div>

              {/* Tasks weekly trend */}
              {prod.tasks.weekly_trend.length > 0 && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--t-faint)" }}>
                    Завершённые задачи по неделям
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={prod.tasks.weekly_trend} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="week" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="count" name="Задач" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Habits KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  label="Привычки сегодня"
                  value={`${prod.habits.today_done}/${prod.habits.today_total}`}
                  icon={Heart}
                  color="#ec4899"
                />
                <KpiCard
                  label="Выполнение 7д"
                  value={`${prod.habits.rate_7d}%`}
                  icon={Percent}
                  color={prod.habits.rate_7d >= 80 ? "#10b981" : prod.habits.rate_7d >= 50 ? "#f59e0b" : "#ef4444"}
                />
                <KpiCard
                  label="Выполнение 30д"
                  value={`${prod.habits.rate_30d}%`}
                  icon={Percent}
                  color={prod.habits.rate_30d >= 80 ? "#10b981" : prod.habits.rate_30d >= 50 ? "#f59e0b" : "#ef4444"}
                />
                <KpiCard label="Лучшая серия" value={`${prod.habits.best_streak} дн.`} icon={Flame} color="#f97316" />
              </div>

              {/* Habits daily chart */}
              {prod.habits.daily_chart.length > 0 && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--t-faint)" }}>
                    Привычки за 14 дней
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={prod.habits.daily_chart} barGap={1}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Bar dataKey="done" name="Выполнено" fill="#ec4899" radius={[4, 4, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="total" name="Всего" fill="rgba(255,255,255,0.08)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Top habits by streak */}
              {prod.habits.top_habits.length > 0 && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--t-faint)" }}>
                    Топ привычек по серии
                  </h3>
                  <div className="space-y-2">
                    {prod.habits.top_habits.map((h, i) => (
                      <div key={i} className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-orange-500/10 shrink-0">
                          <Flame size={13} className="text-orange-400" />
                        </div>
                        <span className="flex-1 text-[13px] font-medium truncate" style={{ color: "var(--t-primary)" }}>
                          {h.title}
                        </span>
                        <span className="text-[12px] tabular-nums font-semibold" style={{ color: "var(--t-secondary)" }}>
                          {h.current_streak} дн.
                        </span>
                        <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded bg-white/[0.05]" style={{ color: "var(--t-faint)" }}>
                          рек. {h.best_streak}
                        </span>
                        <span className="text-[10px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                          {h.done_30d}/30д
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══ ACTIVITY HEATMAP ════════════════════════════════════════════ */}
          {heatmap && heatmap.days.length > 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--t-faint)" }}>
                Активность за год
              </h3>
              <div className="overflow-x-auto">
                <div className="flex gap-[2px]" style={{ minWidth: 720 }}>
                  {(() => {
                    const weeks: HeatmapDay[][] = [];
                    for (let i = 0; i < heatmap.days.length; i += 7) weeks.push(heatmap.days.slice(i, i + 7));
                    const maxCount = Math.max(1, ...heatmap.days.map(d => d.count));
                    return weeks.map((week, wi) => (
                      <div key={wi} className="flex flex-col gap-[2px]">
                        {week.map((d) => {
                          const r = d.count / maxCount;
                          const bg = d.count === 0 ? "rgba(255,255,255,0.03)"
                            : `rgba(99,102,241,${(0.15 + r * 0.65).toFixed(2)})`;
                          return (
                            <div
                              key={d.date}
                              className="w-[11px] h-[11px] rounded-[2px]"
                              style={{ background: bg }}
                              title={`${d.date}: ${d.count}`}
                            />
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-2 justify-end">
                <span className="text-[9px]" style={{ color: "var(--t-faint)" }}>Меньше</span>
                {[0, 0.2, 0.4, 0.7, 1].map((r, i) => (
                  <div key={i} className="w-[10px] h-[10px] rounded-[2px]" style={{ background: r === 0 ? "rgba(255,255,255,0.03)" : `rgba(99,102,241,${(0.15 + r * 0.65).toFixed(2)})` }} />
                ))}
                <span className="text-[9px]" style={{ color: "var(--t-faint)" }}>Больше</span>
              </div>
            </div>
          )}

          {/* ══ MONTH COMPARISON ════════════════════════════════════════════ */}
          {monthComp && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--t-faint)" }}>
                Сравнение месяцев
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {[monthComp.previous, monthComp.current].map((m, i) => (
                  <div key={i} className={clsx("rounded-lg p-4 border", i === 1 ? "border-indigo-500/20 bg-indigo-500/[0.04]" : "border-white/[0.05] bg-white/[0.02]")}>
                    <p className="text-[12px] font-semibold mb-3" style={{ color: i === 1 ? "var(--t-primary)" : "var(--t-faint)" }}>{m.label}</p>
                    <div className="space-y-2 text-[12px]">
                      <div className="flex justify-between"><span style={{ color: "var(--t-faint)" }}>Доходы</span><span className="tabular-nums font-medium text-emerald-400">{fmt(m.income)} ₽</span></div>
                      <div className="flex justify-between"><span style={{ color: "var(--t-faint)" }}>Расходы</span><span className="tabular-nums font-medium text-red-400">{fmt(m.expense)} ₽</span></div>
                      <div className="flex justify-between border-t border-white/[0.05] pt-1"><span style={{ color: "var(--t-faint)" }}>Баланс</span><span className={clsx("tabular-nums font-semibold", m.net >= 0 ? "text-emerald-400" : "text-red-400")}>{fmt(m.net)} ₽</span></div>
                      <div className="flex justify-between"><span style={{ color: "var(--t-faint)" }}>Задач</span><span className="tabular-nums" style={{ color: "var(--t-secondary)" }}>{m.tasks_done}</span></div>
                      <div className="flex justify-between"><span style={{ color: "var(--t-faint)" }}>Привычки</span><span className="tabular-nums" style={{ color: "var(--t-secondary)" }}>{m.habits_rate}%</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ WALLET BALANCES ═════════════════════════════════════════════ */}
          {walletBal && (
            <>
              <div className="border-t border-white/[0.06] pt-6 mt-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--t-faint)" }}>
                  Балансы
                </h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {walletBal.wallets.map((w, i) => (
                  <KpiCard key={i} label={w.title} value={`${fmt(w.balance)} ₽`} icon={Wallet} color={w.balance >= 0 ? "#10b981" : "#ef4444"} />
                ))}
                <KpiCard label="Всего" value={`${fmt(walletBal.total)} ₽`} icon={Wallet} color="#6366f1" />
              </div>
              {walletBal.balance_trend.length > 0 && (
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--t-faint)" }}>
                    Динамика общего баланса
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={walletBal.balance_trend.map(p => ({ ...p, label: monthLabel(p.month) }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}к` : v} />
                      <Tooltip content={<ChartTooltip />} />
                      <defs><linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
                      <Area type="monotone" dataKey="balance" name="Баланс" stroke="#10b981" fill="url(#balGrad)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}

          {/* ══ SPENDING BY WEEKDAY + PRODUCTIVITY BY WEEKDAY ═══════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {spendWeekday && spendWeekday.weekdays.some(w => w.avg > 0) && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--t-faint)" }}>
                  Расходы по дням недели (3 мес.)
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={spendWeekday.weekdays}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}к` : v} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="avg" name="Средний расход" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {prodWeekday && prodWeekday.weekdays.some(w => w.count > 0) && (
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--t-faint)" }}>
                  Задачи по дням недели (3 мес.)
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={prodWeekday.weekdays}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="count" name="Задач" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* ══ SUBSCRIPTIONS ═══════════════════════════════════════════════ */}
          {subAnalytics && subAnalytics.count > 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>Подписки</h3>
                <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--t-primary)" }}>{fmt(subAnalytics.total_monthly)} ₽/мес</span>
              </div>
              <div className="space-y-1.5">
                {subAnalytics.subscriptions.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b border-white/[0.04] last:border-0">
                    <CreditCard size={12} style={{ color: "var(--t-faint)" }} />
                    <span className="flex-1 text-[13px] truncate" style={{ color: "var(--t-secondary)" }}>{s.name}</span>
                    <span className="text-[12px] tabular-nums font-medium" style={{ color: "var(--t-primary)" }}>{s.cost > 0 ? `${fmt(s.cost)} ₽` : "—"}</span>
                    {s.days_left !== null && s.days_left <= 14 && (
                      <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", s.days_left <= 0 ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400")}>
                        {s.days_left <= 0 ? "Просрочено" : `${s.days_left} дн.`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ HABITS MATRIX ══════════════════════════════════════════════ */}
          {habitsMatrix && habitsMatrix.habits.length > 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--t-faint)" }}>
                Привычки: матрица за 30 дней
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full" style={{ minWidth: 500 }}>
                  <thead>
                    <tr>
                      <th className="text-left text-[10px] font-medium pb-2 pr-3 sticky left-0 bg-transparent" style={{ color: "var(--t-faint)", minWidth: 100 }}></th>
                      {habitsMatrix.days.map((d, i) => (
                        <th key={d} className="text-[8px] font-normal pb-1 px-0" style={{ color: "var(--t-faint)", width: 13 }}>
                          {i % 7 === 0 ? d.slice(8, 10) : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {habitsMatrix.habits.map((h) => (
                      <tr key={h.habit_id}>
                        <td className="text-[11px] py-1 pr-3 truncate" style={{ color: "var(--t-secondary)", maxWidth: 120 }}>{h.title}</td>
                        {h.days.map((v, i) => (
                          <td key={i} className="px-0 py-0.5">
                            <div
                              className="w-[10px] h-[10px] rounded-[2px] mx-auto"
                              style={{
                                background: v === 1 ? "#10b981" : v === 0 ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.04)",
                              }}
                              title={`${habitsMatrix.days[i]}: ${v === 1 ? "Done" : v === 0 ? "Missed" : "N/A"}`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3 mt-2 justify-end text-[9px]" style={{ color: "var(--t-faint)" }}>
                <span className="flex items-center gap-1"><span className="w-[8px] h-[8px] rounded-[1px] bg-emerald-500 inline-block" /> Выполнено</span>
                <span className="flex items-center gap-1"><span className="w-[8px] h-[8px] rounded-[1px] inline-block" style={{ background: "rgba(239,68,68,0.25)" }} /> Пропущено</span>
                <span className="flex items-center gap-1"><span className="w-[8px] h-[8px] rounded-[1px] inline-block" style={{ background: "rgba(255,255,255,0.04)" }} /> Нет</span>
              </div>
            </div>
          )}

          {/* ══ GOALS PROGRESS ═════════════════════════════════════════════ */}
          {goalsData && goalsData.goals.length > 0 && (
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--t-faint)" }}>
                Прогресс целей
              </h3>
              <div className="space-y-3">
                {goalsData.goals.map((g, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] font-medium" style={{ color: "var(--t-primary)" }}>{g.title}</span>
                      <span className="text-[12px] tabular-nums font-medium" style={{ color: "var(--t-secondary)" }}>
                        {fmt(g.current)} / {g.target > 0 ? `${fmt(g.target)} ${g.currency}` : "—"}
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(g.percent, 100)}%`,
                          background: g.percent >= 100 ? "#10b981" : g.percent >= 50 ? "#6366f1" : "#f59e0b",
                        }}
                      />
                    </div>
                    <p className="text-[10px] mt-0.5 text-right tabular-nums" style={{ color: "var(--t-faint)" }}>{g.percent}%</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </>
  );
}

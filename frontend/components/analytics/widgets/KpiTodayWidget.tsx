"use client";

import { useDashboard } from "@/hooks/useDashboard";
import { useHabits } from "@/hooks/useHabits";
import { StatBlock } from "@/components/primitives/StatBlock";
import type { WidgetProps } from "../types";

const CURRENCY_SYM: Record<string, string> = {
  UAH: "₴", USD: "$", EUR: "€", GBP: "£", PLN: "zł",
};

function fmt(n: number) {
  return Math.abs(n).toLocaleString("uk-UA", { maximumFractionDigits: 0 });
}

function Skeleton() {
  return (
    <div className="h-full grid grid-cols-3 gap-4 animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col justify-center gap-2">
          <div className="h-3 w-12 rounded" style={{ background: "var(--c-neutral-bg)" }} />
          <div className="h-8 w-20 rounded-lg" style={{ background: "var(--c-neutral-bg)" }} />
          <div className="h-1.5 w-full rounded-full" style={{ background: "var(--c-neutral-bg)" }} />
        </div>
      ))}
    </div>
  );
}


export function KpiTodayWidget({ instanceId: _ }: WidgetProps) {
  const { data: dash, isLoading: loadDash } = useDashboard();
  const { data: habits, isLoading: loadHabits } = useHabits();

  if (loadDash || loadHabits || !dash || !habits) return <Skeleton />;

  const { total, done, left } = dash.today.progress;
  const overdue = dash.today.overdue.length;
  const taskPct = total > 0 ? Math.round((done / total) * 100) : 0;

  const scheduled = habits.filter((h) => h.scheduled_today);
  const habitDone = habits.filter((h) => h.done_today && h.scheduled_today).length;
  const habitTotal = scheduled.length;
  const habitPct = habitTotal > 0 ? Math.round((habitDone / habitTotal) * 100) : 0;

  const finEntries = Object.entries(dash.financial_summary);
  const [mainCurrency, finBlock] = finEntries[0] ?? ["UAH", null];
  const sym = CURRENCY_SYM[mainCurrency] ?? mainCurrency;

  const netWorth = dash.fin_state.regular_total + dash.fin_state.savings_total;

  return (
    <div className="h-full grid grid-cols-3">
      {/* Tasks */}
      <div className="flex flex-col justify-center gap-1.5 pr-4 border-r" style={{ borderColor: "var(--app-border)" }}>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
          Задачи
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[28px] font-bold tabular-nums leading-none"
            style={{ color: taskPct === 100 ? "var(--c-success-ink)" : "var(--t-primary)", letterSpacing: "-0.02em" }}>
            {done}
          </span>
          <span className="text-[14px]" style={{ color: "var(--t-faint)" }}>/ {total}</span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--c-neutral-bg)" }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${taskPct}%`, background: taskPct === 100 ? "var(--c-success-ink)" : "var(--app-accent)" }} />
        </div>
        <span className="text-[11px]" style={{ color: overdue > 0 ? "var(--c-danger-ink)" : "var(--t-muted)" }}>
          {overdue > 0 ? `+${overdue} просрочено` : left === 0 && total > 0 ? "всё готово 🎉" : `осталось ${left}`}
        </span>
      </div>

      {/* Habits */}
      <div className="flex flex-col justify-center gap-1.5 px-4 border-r" style={{ borderColor: "var(--app-border)" }}>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
          Привычки
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[28px] font-bold tabular-nums leading-none"
            style={{ color: habitPct === 100 ? "var(--c-success-ink)" : "var(--t-primary)", letterSpacing: "-0.02em" }}>
            {habitDone}
          </span>
          <span className="text-[14px]" style={{ color: "var(--t-faint)" }}>/ {habitTotal}</span>
        </div>
        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--c-neutral-bg)" }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${habitPct}%`, background: habitPct === 100 ? "var(--c-success-ink)" : "var(--app-accent)" }} />
        </div>
        <span className="text-[11px]" style={{ color: "var(--t-muted)" }}>
          {habitTotal === 0 ? "нет привычек" : habitPct === 100 ? "все выполнено 🔥" : `${habitPct}% выполнено`}
        </span>
      </div>

      {/* Finance */}
      <div className="flex flex-col justify-center pl-4">
        <StatBlock
          size="compact"
          label="Финансы"
          value={`${sym} ${fmt(netWorth)}`}
          sub={finBlock ? `+${sym} ${fmt(finBlock.income)} / −${sym} ${fmt(finBlock.expense)}` : "капитал"}
        />
      </div>
    </div>
  );
}

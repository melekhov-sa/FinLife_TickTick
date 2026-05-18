"use client";

import { useDashboard } from "@/hooks/useDashboard";
import { useHabits } from "@/hooks/useHabits";
import { StatBlock } from "@/components/primitives/StatBlock";
import { useWidgetScale } from "@/components/primitives/ScaleContext";
import { CURRENCY_SYM } from "../usePrimaryCurrency";
import type { WidgetProps } from "../types";

function fmt(n: number) {
  return Math.abs(n).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
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

interface ProgressColumnProps {
  label: string;
  done: number;
  total: number;
  pct: number;
  subText: string;
  subColor: string;
  scale: number;
  bordered?: "right" | "both";
}

function ProgressColumn({ label, done, total, pct, subText, subColor, scale, bordered }: ProgressColumnProps) {
  const px = (base: number) => base * scale;
  const padClass = bordered === "right" ? "pr-4 border-r" : bordered === "both" ? "px-4 border-r" : "pl-4";
  return (
    <div
      className={`flex flex-col justify-center ${padClass}`}
      style={{ gap: px(6), borderColor: "var(--app-border)" }}
    >
      <span
        style={{
          fontSize: px(10),
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--t-faint)",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      <div className="flex items-baseline" style={{ gap: px(6) }}>
        <span
          style={{
            fontSize: px(28),
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
            color: pct === 100 ? "var(--c-success-ink)" : "var(--t-primary)",
          }}
        >
          {done}
        </span>
        <span style={{ fontSize: px(14), color: "var(--t-faint)" }}>/ {total}</span>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: Math.max(3, px(6)), background: "var(--c-neutral-bg)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: pct === 100 ? "var(--c-success-ink)" : "var(--app-accent)" }}
        />
      </div>
      <span style={{ fontSize: px(11), color: subColor }}>{subText}</span>
    </div>
  );
}

export function KpiTodayWidget({ instanceId: _ }: WidgetProps) {
  const { data: dash, isLoading: loadDash, isError: errDash } = useDashboard();
  const { data: habits, isLoading: loadHabits, isError: errHabits } = useHabits();
  const scale = useWidgetScale();

  if (loadDash || loadHabits) return <Skeleton />;
  if (errDash || errHabits || !dash || !habits) return (
    <div className="h-full flex items-center justify-center">
      <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Не удалось загрузить данные</p>
    </div>
  );

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

  const taskSub = overdue > 0
    ? `+${overdue} просрочено`
    : left === 0 && total > 0
      ? "всё готово 🎉"
      : `осталось ${left}`;

  const habitSub = habitTotal === 0
    ? "нет привычек"
    : habitPct === 100
      ? "все выполнено 🔥"
      : `${habitPct}% выполнено`;

  return (
    <div className="h-full grid grid-cols-3">
      <ProgressColumn
        label="Задачи"
        done={done}
        total={total}
        pct={taskPct}
        subText={taskSub}
        subColor={overdue > 0 ? "var(--c-danger-ink)" : "var(--t-muted)"}
        scale={scale}
        bordered="right"
      />
      <ProgressColumn
        label="Привычки"
        done={habitDone}
        total={habitTotal}
        pct={habitPct}
        subText={habitSub}
        subColor="var(--t-muted)"
        scale={scale}
        bordered="both"
      />
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

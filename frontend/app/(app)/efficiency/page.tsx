"use client";

import { AppTopbar } from "@/components/layout/AppTopbar";
import { useEfficiency } from "@/hooks/useEfficiency";
import type { MetricCard } from "@/types/api";

function scoreColor(score: number): string {
  if (score >= 85) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

function subScoreBarColor(score: number): string {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function subScoreBadge(score: number): { label: string; cls: string } {
  if (score >= 90) return { label: "Хорошо",   cls: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" };
  if (score >= 60) return { label: "Нормально", cls: "bg-amber-500/15 text-amber-400 border border-amber-500/25" };
  return              { label: "Плохо",      cls: "bg-red-500/15 text-red-400 border border-red-500/25" };
}

function formatRaw(card: MetricCard): string {
  if (card.key === "ontime") return `${card.raw_value}%`;
  if (card.key === "velocity") return `${card.raw_value} зд/д`;
  return String(Math.round(card.raw_value));
}

function ScoreRing({ score }: { score: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color =
    score >= 85 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <svg width="148" height="148" className="mx-auto drop-shadow-lg">
      <circle
        cx="74" cy="74" r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        className="text-white/[0.06]"
      />
      <circle
        cx="74" cy="74" r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 74 74)"
        style={{ filter: `drop-shadow(0 0 8px ${color}60)` }}
      />
      <text
        x="74" y="69"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="30"
        fontWeight="700"
        fill={color}
      >
        {Math.round(score)}
      </text>
      <text
        x="74" y="91"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="11"
        fill="currentColor"
        opacity="0.40"
      >
        из 100
      </text>
    </svg>
  );
}

function MetricCardRow({ card }: { card: MetricCard }) {
  const barWidth = (card.sub_score / 100) * 100;
  const badge = subScoreBadge(card.sub_score);

  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-2xl p-5 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-white/85" style={{ letterSpacing: "-0.01em" }}>
              {card.label}
            </span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <p className="text-xs text-white/68 leading-snug">{card.description}</p>
        </div>
        <div className="ml-4 text-right shrink-0">
          <div className="text-lg font-semibold text-white/90 tabular-nums" style={{ letterSpacing: "-0.03em" }}>
            {formatRaw(card)}
          </div>
          <div className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mt-0.5">
            {Math.round(card.weight * 100)}% веса
          </div>
        </div>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${subScoreBarColor(card.sub_score)}`}
          style={{
            width: `${barWidth}%`,
            boxShadow: card.sub_score >= 90
              ? "0 0 8px rgba(16,185,129,0.5)"
              : card.sub_score >= 60
              ? "0 0 8px rgba(245,158,11,0.4)"
              : "0 0 8px rgba(239,68,68,0.4)",
          }}
        />
      </div>
    </div>
  );
}

export default function EfficiencyPage() {
  const { data, isLoading, isError } = useEfficiency();

  const dateSubtitle = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <AppTopbar title="Аналитика" subtitle={dateSubtitle} />
      <main className="flex-1 overflow-auto p-6 max-w-2xl mx-auto w-full">
        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <div className="w-7 h-7 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}

        {isError && (
          <div className="text-white/68 text-sm text-center mt-12">
            Не удалось загрузить данные
          </div>
        )}

        {data && (
          <div className="space-y-5">
            {/* Score card */}
            <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-2xl p-6 text-center">
              <ScoreRing score={data.score} />
              <div className={`mt-3 text-xl font-semibold ${scoreColor(data.score)}`} style={{ letterSpacing: "-0.025em" }}>
                {data.score >= 85
                  ? "Отличный результат"
                  : data.score >= 60
                  ? "Есть куда расти"
                  : "Требует внимания"}
              </div>
              <div className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mt-2">
                Снимок за {new Date(data.snapshot_date).toLocaleDateString("ru-RU")}
              </div>
            </div>

            {/* Metrics section label */}
            <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest px-1">
              Метрики
            </p>

            {/* Metrics */}
            <div className="space-y-3">
              {data.metrics.map((m) => (
                <MetricCardRow key={m.key} card={m} />
              ))}
            </div>

            {/* Settings link */}
            <a
              href="/legacy/efficiency/settings"
              className="block text-center text-xs font-medium text-white/60 hover:text-white/55 transition-colors py-2"
            >
              Настроить пороги и веса →
            </a>
          </div>
        )}
      </main>
    </>
  );
}

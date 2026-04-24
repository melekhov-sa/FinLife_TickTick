"use client";

import { AppTopbar } from "@/components/layout/AppTopbar";
import { useStrategy } from "@/hooks/useStrategy";
import type { StrategyScoreItem, StrategyHistoryPoint, StrategyTarget } from "@/types/api";

const RU_MONTHS = [
  "", "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function scoreBarColor(score: number): string {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function scoreGlow(score: number): string {
  if (score >= 75) return "0 0 8px rgba(16,185,129,0.5)";
  if (score >= 50) return "0 0 8px rgba(245,158,11,0.4)";
  return "0 0 8px rgba(239,68,68,0.4)";
}

function LifeScoreRing({ score }: { score: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <svg width="148" height="148" className="mx-auto drop-shadow-lg">
      <circle cx="74" cy="74" r={r} fill="none" stroke="currentColor"
        strokeWidth="10" className="text-white/[0.06]" />
      <circle cx="74" cy="74" r={r} fill="none" stroke={color}
        strokeWidth="10" strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 74 74)"
        style={{ filter: `drop-shadow(0 0 8px ${color}60)` }} />
      <text x="74" y="69" textAnchor="middle" dominantBaseline="middle"
        fontSize="30" fontWeight="700" fill={color}>
        {Math.round(score)}
      </text>
      <text x="74" y="91" textAnchor="middle" dominantBaseline="middle"
        fontSize="11" fill="currentColor" opacity="0.40">Life Score</text>
    </svg>
  );
}

function ScoreCard({ item }: { item: StrategyScoreItem }) {
  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-2xl p-4 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-semibold text-white/80" style={{ letterSpacing: "-0.01em" }}>
          {item.label}
        </span>
        <span className={`text-lg font-semibold tabular-nums ${scoreColor(item.score)}`} style={{ letterSpacing: "-0.03em" }}>
          {Math.round(item.score)}
        </span>
      </div>
      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${scoreBarColor(item.score)}`}
          style={{ width: `${item.score}%`, boxShadow: scoreGlow(item.score) }}
        />
      </div>
      {item.raw_label && (
        <div className="text-xs text-white/65 mt-2">{item.raw_label}</div>
      )}
    </div>
  );
}

function MiniChart({ history }: { history: StrategyHistoryPoint[] }) {
  if (history.length === 0) return null;
  const max = 100;
  const w = 320;
  const h = 64;
  const pts = history.map((p, i) => ({
    x: (i / (history.length - 1)) * w,
    y: h - (p.life_score / max) * h,
    label: `${RU_MONTHS[p.month]}'${p.year % 100}`,
    score: p.life_score,
  }));
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
    + ` L ${pts[pts.length - 1].x} ${h} L 0 ${h} Z`;
  const last = pts[pts.length - 1];

  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-2xl p-5">
      <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-4">
        История (12 мес.)
      </p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 64 }}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#areaGrad)" />
        <path d={path} fill="none" stroke="#6366f1" strokeWidth="2" />
        {last && (
          <>
            <circle cx={last.x} cy={last.y} r="5" fill="#6366f1" opacity="0.25" />
            <circle cx={last.x} cy={last.y} r="3" fill="#6366f1" />
          </>
        )}
      </svg>
      <div className="flex justify-between text-[10px] font-medium text-white/55 mt-2">
        <span>{RU_MONTHS[history[0]?.month]} {history[0]?.year}</span>
        <span>{RU_MONTHS[history[history.length - 1]?.month]} {history[history.length - 1]?.year}</span>
      </div>
    </div>
  );
}

function TargetRow({ target }: { target: StrategyTarget }) {
  const pct = target.progress_pct ?? 0;
  const barColor = pct >= 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-indigo-500";
  return (
    <div className="py-3 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-white/80 font-medium">{target.title}</span>
        <span className={`text-xs font-semibold tabular-nums ${pct >= 100 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-white/72"}`}>
          {pct >= 100 ? "✓" : `${Math.round(pct)}%`}
        </span>
      </div>
      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`${barColor} h-full rounded-full transition-all`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <div className="text-[11px] text-white/60 mt-1 tabular-nums">
        {target.current_value !== null ? `${target.current_value}` : "—"} / цель {target.target_value}
      </div>
    </div>
  );
}

export default function StrategyPage() {
  const { data, isLoading, isError } = useStrategy();

  const dateSubtitle = new Date().toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <AppTopbar title="Аналитика" subtitle={dateSubtitle} />
      <main className="flex-1 overflow-auto p-3 md:p-6 w-full">
        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <div className="w-7 h-7 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        )}
        {isError && (
          <div className="text-white/68 text-sm text-center mt-12">
            Не удалось загрузить данные стратегии
          </div>
        )}
        {data && (
          <div className="space-y-5">
            {/* Life Score ring */}
            <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-2xl p-6 text-center">
              <LifeScoreRing score={data.life_score} />
              <div
                className={`mt-3 text-xl font-semibold ${scoreColor(data.life_score)}`}
                style={{ letterSpacing: "-0.025em" }}
              >
                {data.life_score >= 75
                  ? "Всё под контролем"
                  : data.life_score >= 50
                  ? "Есть над чем работать"
                  : "Требует внимания"}
              </div>
              <div className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mt-2">
                {RU_MONTHS[data.month]} {data.year}
              </div>
            </div>

            {/* Scores section */}
            <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest px-1">
              Области жизни
            </p>

            {/* Score grid */}
            <div className="grid grid-cols-2 gap-3">
              {data.scores.map((s) => (
                <ScoreCard key={s.key} item={s} />
              ))}
            </div>

            {/* History chart */}
            <MiniChart history={data.history} />

            {/* Targets */}
            {data.targets.length > 0 && (
              <>
                <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest px-1">
                  Цели
                </p>
                <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-2xl p-5">
                  {data.targets.map((t) => (
                    <TargetRow key={t.id} target={t} />
                  ))}
                </div>
              </>
            )}

            <a
              href="/legacy/strategy"
              className="block text-center text-xs font-medium text-white/60 hover:text-white/55 transition-colors py-2"
            >
              Подробная стратегия →
            </a>
          </div>
        )}
      </main>
    </>
  );
}

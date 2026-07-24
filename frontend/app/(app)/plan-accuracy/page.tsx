"use client";

/**
 * Точность плана: по закрытым месяцам — статьи, выбившиеся из коридора ±15%.
 * Недорасход помечаешь «вписался» / «не вписался»; перерасход всегда мимо.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Target, Check, X, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Tabs } from "@/components/primitives/Tabs";
import { Skeleton } from "@/components/primitives/Skeleton";
import { EmptyState } from "@/components/primitives/EmptyState";
import { getCategoryColor } from "@/lib/categoryColor";
import { getCategoryEmoji } from "@/lib/categoryEmoji";
import { hapticTick } from "@/lib/native";

interface Row {
  category_id: number;
  title: string;
  color: string | null;
  plan: number;
  fact: number;
  deviation_pct: number;
  over: boolean;
  status: "miss" | "pending" | "accurate";
  verdict: "FIT" | "MISS" | null;
}
interface MonthGroup { year: number; month: number; label: string; rows: Row[]; }
interface Report {
  corridor_pct: number;
  accuracy: number | null;
  counts: { accurate: number; miss: number; pending: number };
  months: MonthGroup[];
}

const RANGES = [
  { id: "6", label: "6 мес" },
  { id: "12", label: "12 мес" },
  { id: "24", label: "24 мес" },
];

function fmt(n: number) {
  return n.toLocaleString("ru-RU");
}

export default function PlanAccuracyPage() {
  const qc = useQueryClient();
  const [range, setRange] = useState("6");

  const { data, isLoading } = useQuery<Report>({
    queryKey: ["plan-accuracy", range],
    queryFn: () => api.get<Report>(`/api/v2/plan-accuracy?months=${range}`),
  });

  const verdictMut = useMutation({
    mutationFn: (p: { year: number; month: number; category_id: number; verdict: "FIT" | "MISS" | null }) =>
      api.post("/api/v2/plan-accuracy/verdict", p),
    onMutate: () => { void hapticTick(); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan-accuracy"] });
      qc.invalidateQueries({ queryKey: ["analytics", "budget-stats"] });
    },
  });

  function setVerdict(r: Row, g: MonthGroup, verdict: "FIT" | "MISS" | null) {
    // тап по уже активной кнопке — снять
    const next = r.verdict === verdict ? null : verdict;
    verdictMut.mutate({ year: g.year, month: g.month, category_id: r.category_id, verdict: next });
  }

  const c = data?.counts;

  return (
    <>
      <PageHeader
        title="Точность плана"
        subtitle={`Коридор ±${data?.corridor_pct ?? 15}% · выбивающиеся статьи`}
        density="compact"
        tabs={<Tabs items={RANGES} active={range} onChange={setRange} variant="pills" />}
      />
      <main className="flex-1 p-4 md:p-6 max-w-2xl space-y-4">
        {isLoading && (
          <div className="space-y-3">
            <Skeleton variant="rect" className="h-24 rounded-2xl" />
            <Skeleton variant="rect" className="h-40 rounded-2xl" />
          </div>
        )}

        {data && (
          <>
            {/* Сводка */}
            <div
              className="rounded-2xl border p-4 flex items-center gap-4"
              style={{ background: "var(--app-card-bg)", borderColor: "var(--app-card-border)" }}
            >
              <div className="shrink-0 text-center">
                <div className="text-[30px] font-bold tabular-nums font-display" style={{ color: "var(--app-accent)" }}>
                  {data.accuracy != null ? `${data.accuracy}%` : "—"}
                </div>
                <div className="text-[11px]" style={{ color: "var(--t-faint)" }}>точность</div>
              </div>
              <div className="flex-1 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[15px] font-bold tabular-nums" style={{ color: "var(--c-success-ink)" }}>{c?.accurate ?? 0}</div>
                  <div className="text-[10px]" style={{ color: "var(--t-faint)" }}>в плане</div>
                </div>
                <div>
                  <div className="text-[15px] font-bold tabular-nums" style={{ color: "var(--c-danger-ink)" }}>{c?.miss ?? 0}</div>
                  <div className="text-[10px]" style={{ color: "var(--t-faint)" }}>мимо</div>
                </div>
                <div>
                  <div className="text-[15px] font-bold tabular-nums" style={{ color: "var(--c-warning-ink)" }}>{c?.pending ?? 0}</div>
                  <div className="text-[10px]" style={{ color: "var(--t-faint)" }}>ждут</div>
                </div>
              </div>
            </div>

            <p className="text-[11px] px-1" style={{ color: "var(--t-faint)" }}>
              Текущий месяц не оценивается — итог 1-го числа следующего. В коридоре ±{data.corridor_pct}% статья
              считается точной автоматически. Перерасход — всегда мимо. Сильный недорасход отметь: «вписался»
              (сэкономил) или «не вписался».
            </p>

            {data.months.length === 0 && (
              <EmptyState
                icon={<Target size={26} />}
                title="Всё в коридоре"
                description="Нет статей, выбившихся из плана за выбранный период. Так держать!"
              />
            )}

            {data.months.map((g) => (
              <div key={`${g.year}-${g.month}`}>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-1.5 px-1" style={{ color: "var(--t-muted)" }}>
                  {g.label}
                </p>
                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--app-card-border)", background: "var(--app-card-bg)" }}>
                  {g.rows.map((r, i) => {
                    const emoji = getCategoryEmoji(r.title);
                    const color = getCategoryColor(r.category_id, r.color);
                    return (
                      <div
                        key={r.category_id}
                        className="px-3.5 py-3"
                        style={{ borderTop: i > 0 ? "1px solid var(--app-border-subtle, var(--app-border))" : undefined }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                          {emoji && <span className="text-[14px] leading-none">{emoji}</span>}
                          <span className="flex-1 text-[14px] font-medium truncate" style={{ color: "var(--t-primary)" }}>{r.title}</span>
                          <span className="text-[12px] tabular-nums" style={{ color: r.over ? "var(--c-danger-ink)" : "var(--t-muted)" }}>
                            {r.deviation_pct > 0 ? "+" : ""}{r.deviation_pct}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 pl-4">
                          <span className="text-[12px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                            {fmt(r.fact)} из {fmt(r.plan)} ₽
                          </span>
                          {r.status === "pending" && (
                            <span className="text-[11px] flex items-center gap-1" style={{ color: "var(--c-warning-ink)" }}>
                              <Clock size={11} /> ждёт оценки
                            </span>
                          )}
                        </div>

                        {/* Перерасход — всегда мимо, кнопок нет. Недорасход — вердикт. */}
                        {r.over ? (
                          <div className="mt-2 pl-4 text-[12px] font-semibold" style={{ color: "var(--c-danger-ink)" }}>
                            Перерасход — мимо плана
                          </div>
                        ) : (
                          <div className="mt-2 pl-4 flex gap-2">
                            <button
                              type="button"
                              onClick={() => setVerdict(r, g, "FIT")}
                              className="flex-1 h-9 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1 transition-all active:scale-[0.97]"
                              style={
                                r.verdict === "FIT"
                                  ? { background: "var(--c-success-ink)", color: "#fff" }
                                  : { background: "var(--c-success-bg)", color: "var(--c-success-ink)" }
                              }
                            >
                              <Check size={14} /> Вписался
                            </button>
                            <button
                              type="button"
                              onClick={() => setVerdict(r, g, "MISS")}
                              className="flex-1 h-9 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1 transition-all active:scale-[0.97]"
                              style={
                                r.verdict === "MISS"
                                  ? { background: "var(--c-danger-ink)", color: "#fff" }
                                  : { background: "var(--c-danger-bg)", color: "var(--c-danger-ink)" }
                              }
                            >
                              <X size={14} /> Не вписался
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </main>
    </>
  );
}

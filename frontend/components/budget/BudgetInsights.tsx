"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Brain, Lightbulb, PiggyBank, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { GoalSavingPlanSheet } from "@/components/goals/GoalSavingPlanSheet";

/**
 * Выводы по бюджету месяца и разбор от ИИ.
 *
 * Цифр в приложении хватало — не хватало смысла: таблица показывает
 * план и факт, а что из этого следует, приходилось достраивать самому.
 *
 * Считанные выводы приезжают отдельным запросом: таблица нужна сразу,
 * а выводы могут подождать лишние полсекунды. Разбор от ИИ — только по
 * кнопке: он платный и далеко не всегда нужен.
 */

interface Insight {
  code: string;
  severity: "danger" | "warning" | "info";
  category_id: number | null;
  /** Есть у подсказок про накопления — по нему открывается план цели. */
  goal_id: number | null;
  title: string;
  detail: string;
}

const TONE: Record<Insight["severity"], { color: string; bg: string }> = {
  danger:  { color: "var(--c-danger-ink)",  bg: "rgba(239,68,68,0.08)" },
  warning: { color: "var(--c-warning-ink)", bg: "rgba(245,158,11,0.10)" },
  info:    { color: "var(--t-secondary)",   bg: "var(--app-accent-weak)" },
};

export function BudgetInsights({ year, month }: { year: number; month: number }) {
  const [review, setReview] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [planGoalId, setPlanGoalId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<{ insights: Insight[] }>({
    queryKey: ["budget-insights", year, month],
    queryFn: () => api.get(`/api/v2/budget/insights?year=${year}&month=${month}`),
    staleTime: 60_000,
  });

  const { mutate: askAi, isPending } = useMutation({
    mutationFn: () =>
      api.post<{ review: string }>(`/api/v2/budget/ai-review?year=${year}&month=${month}`),
    onSuccess: (r) => { setReview(r.review); setAiError(null); },
    onError: (e: unknown) => {
      // Ключа может не быть — это не поломка, а настройка, и сказать
      // об этом надо человеческими словами.
      const msg = (e as { message?: string })?.message;
      setAiError(msg && msg.length < 200 ? msg : "Не удалось получить разбор");
    },
  });

  const insights = data?.insights ?? [];
  const nothingToSay = !isLoading && insights.length === 0;

  return (
    <div className="dash-card p-3.5 md:p-4 mb-4">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <h2
          className="text-[13px] md:text-[14px] font-semibold inline-flex items-center gap-1.5"
          style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}
        >
          <Lightbulb size={14} strokeWidth={2} style={{ color: "var(--t-muted)" }} />
          Что видно по месяцу
        </h2>
        <button
          type="button"
          onClick={() => askAi()}
          disabled={isPending}
          className="tap-grow shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: "var(--app-accent-weak)", color: "var(--app-accent)" }}
        >
          <Brain size={12} />
          {isPending ? "Думаю…" : "Разобрать"}
        </button>
      </div>

      {isLoading && (
        <p className="text-[13px]" style={{ color: "var(--t-faint)" }}>Считаю…</p>
      )}

      {nothingToSay && !review && (
        <p className="text-[13px]" style={{ color: "var(--t-faint)" }}>
          Ничего особенного: месяц идёт ровно по плану.
        </p>
      )}

      {insights.length > 0 && (
        <div className="space-y-1.5">
          {insights.map((i, idx) => {
            const tone = TONE[i.severity];
            return (
              <div
                key={`${i.code}-${i.category_id ?? "all"}-${idx}`}
                className="rounded-xl px-3 py-2"
                style={{ background: tone.bg }}
              >
                <p className="text-[13px] font-semibold inline-flex items-center gap-1.5" style={{ color: tone.color }}>
                  {i.severity !== "info" && <TriangleAlert size={12} className="shrink-0" />}
                  {i.title}
                </p>
                <p className="text-[12px] leading-snug mt-0.5" style={{ color: "var(--t-muted)" }}>
                  {i.detail}
                </p>
                {/* Подсказка про отставание без кнопки была бы наблюдением:
                    поднять взнос или сдвинуть срок всё равно надо в плане. */}
                {i.goal_id !== null && i.code === "saving_behind" && (
                  <button
                    type="button"
                    onClick={() => setPlanGoalId(i.goal_id)}
                    className="tap-grow mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold"
                    style={{ background: "var(--app-card-bg)", color: "var(--app-accent)" }}
                  >
                    <PiggyBank size={11} />
                    Настроить план
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {aiError && (
        <p className="mt-2.5 text-[12px]" style={{ color: "var(--c-danger-ink)" }}>{aiError}</p>
      )}

      {review && (
        <div
          className="mt-3 pt-3 border-t text-[13px] leading-relaxed whitespace-pre-line"
          style={{ borderColor: "var(--app-border)", color: "var(--t-secondary)" }}
        >
          {review}
        </div>
      )}

      <GoalSavingPlanSheet goalId={planGoalId} onClose={() => setPlanGoalId(null)} />
    </div>
  );
}

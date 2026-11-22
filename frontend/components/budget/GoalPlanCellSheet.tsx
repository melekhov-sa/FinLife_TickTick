"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PiggyBank } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/formErrors";

/**
 * Разбор клетки «Отложить» за месяц.
 *
 * В строке цели стоит одно число, а складывается оно из нескольких
 * накопительных планов — «на др брата» плюс «на др Пете». По итогу не
 * видно, сколько тут чего, поэтому клетка открывает разбивку.
 *
 * Здесь же правится ручная сумма: она перебивает весь расчёт целиком,
 * и держать её в другом месте значило бы прятать причину, по которой
 * расчёт не применился.
 */

export interface GoalPlanCellTarget {
  goalId: number;
  goalTitle: string;
  year: number;
  month: number;
  periodLabel: string;
}

interface PlanShare {
  plan_id: number;
  title: string;
  amount: string;
  target_amount: string;
  target_month: string;
  repeat_yearly: boolean;
}

interface Breakdown {
  goal_id: number;
  year: number;
  month: number;
  manual: string | null;
  note: string;
  computed_total: string;
  plans: PlanShare[];
  effective: string;
}

function money(raw: string | number): string {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
}

const inputCls = "w-full rounded-lg px-3 py-2 text-[14px]";
const inputStyle = {
  background: "var(--app-card-bg)",
  border: "1px solid var(--app-border)",
  color: "var(--t-primary)",
} as const;

export function GoalPlanCellSheet({
  target,
  onClose,
}: {
  target: GoalPlanCellTarget | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const open = target !== null;
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const key = open ? `${target.goalId}:${target.year}:${target.month}` : "closed";
  const { data, isLoading } = useQuery<Breakdown>({
    queryKey: ["goal-plan-breakdown", key],
    queryFn: () =>
      api.get<Breakdown>(
        `/api/v2/goals/saving-plans/breakdown?goal_id=${target!.goalId}` +
          `&year=${target!.year}&month=${target!.month}`,
      ),
    enabled: open,
  });

  // Поля заполняются тем, что уже вписано руками, а не расчётом: расчёт
  // — это как раз то, что сохранение перебьёт.
  //
  // Заполняем правкой состояния на рендере, а не эффектом: эффект
  // отрисовал бы один кадр с полями от предыдущей клетки. Закрытие
  // сбрасывает отметку, поэтому повторное открытие той же клетки
  // подтянет сохранённое, а не оставит недонабранное.
  const [filledFor, setFilledFor] = useState<string | null>(null);
  if (!open && filledFor !== null) {
    setFilledFor(null);
  } else if (open && data && filledFor !== key) {
    setFilledFor(key);
    setAmount(data.manual != null ? String(Number(data.manual)) : "");
    setNote(data.note ?? "");
    setError(null);
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ["goal-plan-breakdown"] });
    qc.invalidateQueries({ queryKey: ["budget-matrix"] });
    qc.invalidateQueries({ queryKey: ["budget"] });
  }

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: () =>
      api.post("/api/v2/budget/goal-plan", {
        year: target!.year,
        month: target!.month,
        plan_type: "goal",
        lines: [
          {
            goal_id: target!.goalId,
            plan_amount: amount.trim() ? amount.replace(",", ".") : "0",
            note: note.trim() || null,
          },
        ],
      }),
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (e) => setError(errorMessage(e, "Не удалось сохранить")),
  });

  const { mutate: clearManual, isPending: clearing } = useMutation({
    mutationFn: () =>
      api.delete(
        `/api/v2/budget/goal-plan?goal_id=${target!.goalId}` +
          `&year=${target!.year}&month=${target!.month}`,
      ),
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (e) => setError(errorMessage(e, "Не удалось убрать ручную сумму")),
  });

  const hasManual = data?.manual != null;
  const typed = amount.trim().length > 0;
  // Ноль без комментария бэкенд не хранит: такая клетка выглядит пустой,
  // и оставшаяся строка молча глушила бы накопительный план.
  const zeroWithoutNote = typed && Number(amount.replace(",", ".")) === 0 && !note.trim();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving || clearing) return;
    setError(null);
    save();
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Отложить"
      detent="half"
      onSubmit={submit}
      footer={
        <div className="flex gap-2">
          {hasManual && (
            <button
              type="button"
              onClick={() => clearManual()}
              disabled={clearing || saving}
              className="rounded-lg px-3 py-2.5 text-[13px] font-medium disabled:opacity-50"
              style={{ border: "1px solid var(--app-border)", color: "var(--t-secondary)" }}
            >
              {clearing ? "Убираю…" : "Вернуть расчётную"}
            </button>
          )}
          <button
            type="submit"
            disabled={saving || clearing}
            className="flex-1 rounded-lg py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--app-accent)" }}
          >
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      }
    >
      {target && (
        <div className="space-y-4">
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--t-primary)" }}>
              {target.goalTitle}
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--t-muted)" }}>
              {target.periodLabel}
              {data && ` · в бюджете ${money(data.effective)} ₽`}
            </p>
          </div>

          {isLoading && (
            <p className="text-[13px]" style={{ color: "var(--t-faint)" }}>
              Считаю…
            </p>
          )}

          {/* ── Из чего складывается расчёт ── */}
          {data && (
            <div
              className="rounded-xl px-3 py-2.5"
              style={{ background: "var(--app-accent-weak)" }}
            >
              <p
                className="text-[11px] font-semibold uppercase tracking-wide inline-flex items-center gap-1.5 mb-1.5"
                style={{ color: "var(--app-accent)" }}
              >
                <PiggyBank size={12} />
                Из планов накоплений
              </p>

              {data.plans.length === 0 ? (
                <p className="text-[12px]" style={{ color: "var(--t-muted)" }}>
                  В этом месяце ни один план не копит.
                </p>
              ) : (
                <>
                  <div className="space-y-1">
                    {data.plans.map((p) => (
                      <div
                        key={p.plan_id}
                        className="flex items-baseline justify-between gap-2 text-[12.5px]"
                      >
                        <span className="min-w-0 truncate" style={{ color: "var(--t-secondary)" }}>
                          {p.title || "Без названия"}
                        </span>
                        <span
                          className="tabular-nums shrink-0 font-medium"
                          style={{ color: "var(--t-primary)" }}
                        >
                          {money(p.amount)} ₽
                        </span>
                      </div>
                    ))}
                  </div>
                  {data.plans.length > 1 && (
                    <div
                      className="flex items-baseline justify-between gap-2 text-[12.5px] mt-1.5 pt-1.5 font-semibold"
                      style={{ borderTop: "1px solid var(--app-border)", color: "var(--app-accent)" }}
                    >
                      <span>Итого по планам</span>
                      <span className="tabular-nums">{money(data.computed_total)} ₽</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Ручная сумма ── */}
          <div className="space-y-2">
            <label className="block">
              <span className="block text-[12px] mb-1" style={{ color: "var(--t-muted)" }}>
                Ручная сумма
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                placeholder={data ? money(data.computed_total) : "0"}
                className={inputCls + " font-semibold tabular-nums"}
                style={inputStyle}
              />
            </label>

            <label className="block">
              <span className="block text-[12px] mb-1" style={{ color: "var(--t-muted)" }}>
                Комментарий
              </span>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={typed && Number(amount.replace(",", ".")) === 0
                ? "обязателен для нуля — почему не откладываем"
                : "почему в этом месяце иначе"}
                className={inputCls}
                style={inputStyle}
              />
            </label>

            <p className="text-[11px] leading-snug" style={{ color: "var(--t-faint)" }}>
              {zeroWithoutNote
                ? "Ноль без комментария — это пустая клетка: в бюджете останется расчёт по планам. Чтобы в этом месяце не откладывать вопреки плану, напишите комментарий."
                : typed
                ? "Ручная сумма перебивает весь расчёт по планам за этот месяц — целиком, а не отдельный план."
                : "Пусто — в бюджете останется расчёт по планам."}
            </p>
          </div>

          {error && (
            <p className="text-[12px] font-medium" style={{ color: "var(--c-danger-ink)" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </BottomSheet>
  );
}

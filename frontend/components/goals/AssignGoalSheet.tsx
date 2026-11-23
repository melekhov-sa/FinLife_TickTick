"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Select } from "@/components/ui/Select";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/formErrors";

/**
 * Привязать к цели деньги, лежащие на копилке «без цели».
 *
 * Переводы на накопительный кошелёк без указанной цели падают в
 * системную цель «Без цели» — и там незаметно копятся. Разложить их
 * можно было только обычным переводом, вручную выбрав один и тот же
 * кошелёк с двух сторон; догадаться до этого нереально.
 *
 * Операция создаётся именно переводом кошелёк→тот же кошелёк со сменой
 * цели: баланс кошелька не меняется, двигается только принадлежность
 * суммы. Проектор целей разносит стороны независимо, поэтому это
 * честный перенос, а не правка задним числом.
 */

export interface AssignGoalTarget {
  walletId: number;
  walletTitle: string;
  currency: string;
  fromGoalId: number;
  fromGoalTitle: string;
  amount: number;
}

interface GoalOption {
  goal_id: number;
  title: string;
  currency: string;
  is_system: boolean;
  is_archived: boolean;
}

function money(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);
}

export function AssignGoalSheet({
  target,
  onClose,
}: {
  target: AssignGoalTarget | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const open = target !== null;
  const [goalId, setGoalId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: goals } = useQuery<GoalOption[]>({
    queryKey: ["goals", false],
    queryFn: () => api.get<GoalOption[]>("/api/v2/goals?include_archived=false"),
    enabled: open,
    staleTime: 60_000,
  });

  // Заполняем правкой состояния на рендере, а не эффектом: иначе первый
  // кадр показал бы сумму от предыдущего кошелька.
  const key = open ? `${target.walletId}:${target.fromGoalId}` : "closed";
  const [filledFor, setFilledFor] = useState<string | null>(null);
  if (!open && filledFor !== null) {
    setFilledFor(null);
  } else if (open && filledFor !== key) {
    setFilledFor(key);
    setAmount(String(target.amount));
    setGoalId("");
    setError(null);
  }

  const { mutate: assign, isPending } = useMutation({
    mutationFn: () =>
      api.post("/api/v2/transactions", {
        operation_type: "TRANSFER",
        amount: amount.replace(",", "."),
        description: "Привязка к цели",
        occurred_at: null,
        from_wallet_id: target!.walletId,
        to_wallet_id: target!.walletId,
        from_goal_id: target!.fromGoalId,
        to_goal_id: Number(goalId),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: ["savings"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["budget-matrix"] });
      qc.invalidateQueries({ queryKey: ["budget"] });
      onClose();
    },
    onError: (e) => setError(errorMessage(e, "Не удалось привязать")),
  });

  const value = Number(amount.replace(",", "."));
  const tooMuch = open && value > target.amount;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    if (!goalId) {
      setError("Выберите цель");
      return;
    }
    if (!(value > 0)) {
      setError("Укажите сумму");
      return;
    }
    if (tooMuch) {
      setError("Больше, чем лежит без цели");
      return;
    }
    setError(null);
    assign();
  }

  const options = (goals ?? [])
    .filter(
      (g) =>
        !g.is_system &&
        !g.is_archived &&
        (!target || g.currency === target.currency) &&
        (!target || g.goal_id !== target.fromGoalId),
    )
    .map((g) => ({ value: String(g.goal_id), label: g.title }));

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Привязать к цели"
      detent="half"
      onSubmit={submit}
      footer={
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--app-accent)" }}
        >
          {isPending ? "Привязываю…" : "Привязать"}
        </button>
      }
    >
      {target && (
        <div className="space-y-4">
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--t-primary)" }}>
              {target.walletTitle}
            </p>
            <p className="text-[12px] mt-0.5" style={{ color: "var(--t-muted)" }}>
              «{target.fromGoalTitle}»: {money(target.amount)} {target.currency === "RUB" ? "₽" : target.currency}
            </p>
          </div>

          <div>
            <span className="block text-[12px] mb-1" style={{ color: "var(--t-muted)" }}>
              На какую цель
            </span>
            <Select
              value={goalId}
              onChange={setGoalId}
              placeholder="Выберите цель"
              options={options}
            />
            {options.length === 0 && (
              <p className="text-[11px] mt-1" style={{ color: "var(--t-faint)" }}>
                Нет подходящих целей в этой валюте — заведите цель на вкладке «Цели».
              </p>
            )}
          </div>

          <label className="block">
            <span className="block text-[12px] mb-1" style={{ color: "var(--t-muted)" }}>
              Сколько привязать
            </span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-lg px-3 py-2 text-[15px] font-semibold tabular-nums"
              style={{
                background: "var(--app-card-bg)",
                border: `1px solid ${tooMuch ? "var(--c-danger-ink)" : "var(--app-border)"}`,
                color: "var(--t-primary)",
              }}
            />
            <button
              type="button"
              onClick={() => setAmount(String(target.amount))}
              className="text-[11px] font-semibold mt-1"
              style={{ color: "var(--app-accent)" }}
            >
              Всё — {money(target.amount)}
            </button>
          </label>

          <p className="text-[11px] leading-snug" style={{ color: "var(--t-faint)" }}>
            Деньги останутся на этом же кошельке — поменяется только цель, к
            которой они относятся. В бюджете это пройдёт как перенос между
            целями.
          </p>

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

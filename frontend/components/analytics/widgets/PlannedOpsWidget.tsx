"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { WidgetProps } from "../types";

interface PlannedOp {
  id: number; template_id: number; title: string; kind: string;
  amount: string; scheduled_date: string; status: string;
  is_overdue: boolean; wallet_id: number | null; category_id: number | null;
}

const CURRENCY_SYM: Record<string, string> = { UAH: "₴", USD: "$", EUR: "€", GBP: "£", PLN: "zł" };

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}М`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}к`;
  return String(Math.round(n));
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const diff = Math.round((d.getTime() - today.setHours(0, 0, 0, 0)) / 86_400_000);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  if (diff === -1) return "вчера";
  if (diff < 0) return `${Math.abs(diff)}д назад`;
  return `через ${diff}д`;
}

function Skeleton() {
  return (
    <div className="h-full flex flex-col gap-2 animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg shrink-0" style={{ background: "var(--c-neutral-bg)" }} />
          <div className="flex-1 flex flex-col gap-1">
            <div className="h-3 w-28 rounded" style={{ background: "var(--c-neutral-bg)" }} />
            <div className="h-2.5 w-16 rounded" style={{ background: "var(--c-neutral-bg)" }} />
          </div>
          <div className="h-3 w-12 rounded shrink-0" style={{ background: "var(--c-neutral-bg)" }} />
        </div>
      ))}
    </div>
  );
}

export function PlannedOpsWidget({ instanceId: _ }: WidgetProps) {
  const { data, isLoading } = useQuery<PlannedOp[]>({
    queryKey: ["planned-ops-upcoming"],
    queryFn: () => api.get<PlannedOp[]>("/api/v2/planned-ops/upcoming"),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || !data) return <Skeleton />;

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>Нет предстоящих операций</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-1.5 overflow-hidden">
      <span className="text-[11px] font-semibold shrink-0" style={{ color: "var(--t-secondary)" }}>
        Предстоящие платежи
      </span>
      <div className="flex-1 flex flex-col gap-1.5 overflow-hidden">
        {data.slice(0, 6).map((op) => {
          const amount = parseFloat(op.amount);
          const isExpense = op.kind === "EXPENSE";
          const sym = "₴";
          return (
            <div key={op.id} className="flex items-center gap-2 min-w-0">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px] shrink-0"
                style={{ background: op.is_overdue ? "color-mix(in srgb, var(--c-danger-ink) 15%, transparent)" : "var(--c-neutral-bg)" }}
              >
                {isExpense ? "↑" : "↓"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium truncate" style={{ color: "var(--t-primary)" }}>
                  {op.title}
                </p>
                <p className="text-[10px]" style={{ color: op.is_overdue ? "var(--c-danger-ink)" : "var(--t-faint)" }}>
                  {fmtDate(op.scheduled_date)}
                </p>
              </div>
              <span
                className="text-[12px] font-semibold tabular-nums shrink-0"
                style={{ color: isExpense ? "var(--c-danger-ink)" : "var(--c-success-ink)" }}
              >
                {isExpense ? "-" : "+"}{sym}{fmt(amount)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

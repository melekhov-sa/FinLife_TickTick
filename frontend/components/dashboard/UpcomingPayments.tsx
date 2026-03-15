"use client";

import { clsx } from "clsx";
import type { UpcomingPayment } from "@/types/api";

interface Props {
  payments: UpcomingPayment[];
}

export function UpcomingPayments({ payments }: Props) {
  if (payments.length === 0) {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
        <h2
          className="text-sm font-semibold text-white/85 mb-3"
          style={{ letterSpacing: "-0.01em" }}
        >
          Предстоящие платежи
        </h2>
        <p className="text-xs text-white/25 text-center py-3">Нет платежей на ближайшие 30 дней</p>
        <div className="mt-3 pt-3 border-t border-white/[0.05]">
          <a href="/legacy/operations" className="text-xs font-medium text-white/30 hover:text-white/55 transition-colors">
            Все операции →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
      <h2
        className="text-sm font-semibold text-white/85 mb-4"
        style={{ letterSpacing: "-0.01em" }}
      >
        Предстоящие платежи
      </h2>
      <div className="space-y-1">
        {payments.map((p) => (
          <div
            key={p.occurrence_id}
            className="flex items-center gap-3 py-2 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] rounded-lg px-1.5 -mx-1.5 transition-colors"
          >
            <div
              className={clsx(
                "w-2 h-2 rounded-full shrink-0",
                p.days_until < 0
                  ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                  : p.days_until === 0
                  ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]"
                  : "bg-white/20"
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/80 font-medium truncate">{p.title}</p>
              <p className="text-[11px] text-white/30 mt-0.5">
                {p.days_until < 0
                  ? `просрочено ${Math.abs(p.days_until)}д`
                  : p.days_until === 0
                  ? "Сегодня"
                  : `через ${p.days_until}д`}
                <span className="mx-1 text-white/15">·</span>
                {p.kind_label}
              </p>
            </div>
            <span
              className={clsx(
                "text-sm font-semibold shrink-0 tabular-nums",
                p.days_until < 0
                  ? "text-red-400"
                  : p.days_until === 0
                  ? "text-amber-400"
                  : "text-white/70"
              )}
              style={{ letterSpacing: "-0.02em" }}
            >
              {p.amount_formatted}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-white/[0.05]">
        <a href="/legacy/operations" className="text-xs font-medium text-white/30 hover:text-white/55 transition-colors">
          Все операции →
        </a>
      </div>
    </div>
  );
}

"use client";

import { clsx } from "clsx";
import type { UpcomingPayment } from "@/types/api";

interface Props {
  payments: UpcomingPayment[];
}

export function UpcomingPayments({ payments }: Props) {
  if (payments.length === 0) return null;

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
      <h2 className="text-sm font-medium text-white/60 mb-4">Upcoming Payments</h2>
      <div className="space-y-3">
        {payments.map((p) => (
          <div key={p.occurrence_id} className="flex items-center gap-3">
            <div
              className={clsx(
                "w-1.5 h-1.5 rounded-full shrink-0",
                p.days_until < 0
                  ? "bg-red-500"
                  : p.days_until === 0
                  ? "bg-amber-400"
                  : "bg-white/20"
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white/70 truncate">{p.title}</p>
              <p className="text-xs text-white/30">
                {p.days_until < 0
                  ? `${Math.abs(p.days_until)}d overdue`
                  : p.days_until === 0
                  ? "Today"
                  : `in ${p.days_until}d`}
                {" · "}
                {p.kind_label}
              </p>
            </div>
            <span className="text-sm font-medium text-white/60 shrink-0 tabular-nums">
              {p.amount_formatted}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

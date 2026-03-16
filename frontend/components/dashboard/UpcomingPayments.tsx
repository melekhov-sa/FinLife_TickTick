"use client";

import { clsx } from "clsx";
import type { UpcomingPayment } from "@/types/api";

interface Props {
  payments: UpcomingPayment[];
}

function kindPill(kind: string, kindLabel: string, amountFormatted: string) {
  const isExpense  = kind === "EXPENSE"  || kind === "expense";
  const isTransfer = kind === "TRANSFER" || kind === "transfer";
  const isIncome   = kind === "INCOME"   || kind === "income";

  const cls = clsx(
    "text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap shrink-0 border",
    isExpense  ? "bg-red-500/12   border-red-500/25   text-red-400"
    : isIncome  ? "bg-emerald-500/12 border-emerald-500/25 text-emerald-400"
    : isTransfer ? "bg-indigo-500/12  border-indigo-500/25  text-indigo-400"
    :              "bg-white/[0.07]  border-white/[0.10]"
  );

  return (
    <span
      className={cls}
      style={!isExpense && !isIncome && !isTransfer ? { color: "var(--t-faint)" } : undefined}
    >
      {kindLabel} {amountFormatted}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "numeric" });
}

export function UpcomingPayments({ payments }: Props) {
  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--t-muted)" }}>
        Ближайшие платежи
      </p>

      {payments.length === 0 ? (
        <p className="text-[13px] py-2" style={{ color: "var(--t-faint)" }}>Нет платежей на ближайшие 30 дней</p>
      ) : (
        <div className="space-y-0.5">
          {payments.map((p) => (
            <div
              key={p.occurrence_id}
              className="flex items-center gap-2.5 py-2 border-b border-white/[0.04] last:border-0"
            >
              {/* Icon */}
              <span className="text-base shrink-0">📅</span>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate leading-snug" style={{ color: "var(--t-primary)" }}>{p.title}</p>
                <p className="text-xs mt-0.5 tabular-nums" style={{ color: "var(--t-muted)" }}>
                  {p.days_until < 0
                    ? `просрочено ${Math.abs(p.days_until)} дн.`
                    : p.days_until === 0
                    ? "Сегодня"
                    : `через ${p.days_until} дн.`}
                  {" "}
                  <span className="text-white/18">({formatDate(p.scheduled_date)})</span>
                </p>
              </div>

              {/* Amount pill */}
              {kindPill(p.kind, p.kind_label, p.amount_formatted)}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-2.5 border-t border-white/[0.05]">
        <a href="/legacy/planned-operations" className="text-xs font-medium hover:text-indigo-400 transition-colors" style={{ color: "var(--t-muted)" }}>
          Все плановые →
        </a>
      </div>
    </div>
  );
}

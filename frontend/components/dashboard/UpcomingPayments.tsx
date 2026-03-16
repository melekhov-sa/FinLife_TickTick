"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import type { UpcomingPayment } from "@/types/api";

interface Props {
  payments: UpcomingPayment[];
}

const KIND_GROUP: Record<string, string> = {
  TRANSFER: "Переводы",
  transfer: "Переводы",
  INCOME:   "Доходы",
  income:   "Доходы",
  EXPENSE:  "Расходы",
  expense:  "Расходы",
};

const KIND_COLOR: Record<string, string> = {
  TRANSFER: "text-indigo-400",
  transfer: "text-indigo-400",
  INCOME:   "money-income",
  income:   "money-income",
  EXPENSE:  "money-expense",
  expense:  "money-expense",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "numeric" });
}

function PaymentRow({ p }: { p: UpcomingPayment }) {
  const colorCls = KIND_COLOR[p.kind] ?? "";
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03] rounded-lg px-1.5 -mx-1.5 transition-colors">
      <span className="text-base shrink-0">📅</span>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-[500] leading-snug truncate" style={{ color: "var(--t-primary)" }}>{p.title}</p>
        <p className="text-[12px] tabular-nums" style={{ color: "var(--t-muted)" }}>
          {p.days_until < 0
            ? `просрочено ${Math.abs(p.days_until)} дн.`
            : p.days_until === 0
            ? "Сегодня"
            : `через ${p.days_until} дн.`}
          {" "}
          <span style={{ color: "var(--t-faint)" }}>({formatDate(p.scheduled_date)})</span>
        </p>
      </div>
      <span className={clsx("text-[13px] font-semibold tabular-nums shrink-0", colorCls)}>
        {p.amount_formatted}
      </span>
    </div>
  );
}

export function UpcomingPayments({ payments }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // Group by kind label
  const groups: Record<string, UpcomingPayment[]> = {};
  for (const p of payments) {
    const label = KIND_GROUP[p.kind] ?? p.kind_label ?? "Прочее";
    if (!groups[label]) groups[label] = [];
    groups[label].push(p);
  }
  const groupEntries = Object.entries(groups);

  return (
    <div className="bg-white/[0.03] rounded-[14px] border border-white/[0.06] p-4">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-semibold" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
          Ближайшие платежи
        </h2>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.06] transition-colors"
          style={{ color: "var(--t-faint)" }}
        >
          <ChevronDown size={14} className={clsx("transition-transform duration-200", collapsed && "rotate-180")} />
        </button>
      </div>

      {!collapsed && (
        <>
          {payments.length === 0 ? (
            <p className="text-[13px] py-2" style={{ color: "var(--t-faint)" }}>Нет платежей на ближайшие 30 дней</p>
          ) : groupEntries.length === 1 ? (
            // Single group — no header
            <div>
              {payments.map((p) => <PaymentRow key={p.occurrence_id} p={p} />)}
            </div>
          ) : (
            // Multiple groups — show category headers
            <div className="space-y-3">
              {groupEntries.map(([label, items]) => (
                <div key={label}>
                  <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--t-faint)" }}>
                    {label}
                  </p>
                  {items.map((p) => <PaymentRow key={p.occurrence_id} p={p} />)}
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 pt-2.5 border-t border-white/[0.05]">
            <a href="/legacy/planned-operations" className="text-[12px] font-medium hover:text-indigo-400 transition-colors" style={{ color: "var(--t-muted)" }}>
              Все плановые →
            </a>
          </div>
        </>
      )}
    </div>
  );
}

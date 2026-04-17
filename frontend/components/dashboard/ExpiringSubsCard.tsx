"use client";

import { clsx } from "clsx";
import type { ExpiringSub } from "@/types/api";

interface Props {
  subs: ExpiringSub[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "numeric", year: "numeric" });
}

export function ExpiringSubsCard({ subs }: Props) {
  return (
    <div className="bg-slate-50 dark:bg-white/[0.03] rounded-[14px] border-[1.5px] border-slate-300 dark:border-white/[0.09] p-4">
      <p className="block-title" style={{ color: "var(--t-muted)" }}>
        Скоро заканчивается
      </p>

      {subs.length === 0 ? (
        <p className="text-[13px] py-2" style={{ color: "var(--t-faint)" }}>Нет истекающих подписок</p>
      ) : (
        <div className="space-y-0.5">
          {subs.map((s) => (
            <div
              key={s.member_id}
              className="flex items-start justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0"
            >
              <div className="min-w-0">
                <p className="t-main font-semibold truncate leading-snug" style={{ color: "var(--t-primary)" }}>
                  {s.subscription_title}
                  {" "}
                  <span className="text-xs font-normal" style={{ color: "var(--t-muted)" }}>до {formatDate(s.paid_until)}</span>
                </p>
                <p className="t-secondary mt-0.5 truncate" style={{ color: "var(--t-muted)" }}>{s.contact_name}</p>
              </div>
              <span
                className={clsx(
                  "text-xs font-semibold shrink-0 tabular-nums px-1.5 py-0.5 rounded-md border",
                  s.days_left <= 3
                    ? "bg-red-500/12 border-red-500/20 text-red-400"
                    : s.days_left <= 14
                    ? "bg-amber-500/12 border-amber-500/20 text-amber-400"
                    : "bg-white/[0.06] border-white/[0.08]"
                )}
                style={s.days_left > 14 ? { color: "var(--t-secondary)" } : undefined}
              >
                {s.days_left === 0 ? "сегодня" : `${s.days_left} дн.`}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-2.5 border-t border-white/[0.05]">
        <a href="/subscriptions" className="text-xs font-medium hover:text-indigo-400 transition-colors" style={{ color: "var(--t-muted)" }}>
          Все подписки →
        </a>
      </div>
    </div>
  );
}

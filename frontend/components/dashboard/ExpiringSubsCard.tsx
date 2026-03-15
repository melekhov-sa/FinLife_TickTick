"use client";

import { clsx } from "clsx";
import type { ExpiringSub } from "@/types/api";

interface Props {
  subs: ExpiringSub[];
}

export function ExpiringSubsCard({ subs }: Props) {
  if (subs.length === 0) {
    return (
      <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
        <h2
          className="text-sm font-semibold text-white/85 mb-3"
          style={{ letterSpacing: "-0.01em" }}
        >
          Скоро истекают
        </h2>
        <p className="text-xs text-white/25 text-center py-3">Нет истекающих подписок</p>
        <div className="mt-3 pt-3 border-t border-white/[0.05]">
          <a href="/subscriptions" className="text-xs font-medium text-white/30 hover:text-white/55 transition-colors">
            Все подписки →
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
        Окончания по участникам
      </h2>
      <div className="space-y-1">
        {subs.map((s) => (
          <div
            key={s.member_id}
            className="flex items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] rounded-lg px-1.5 -mx-1.5 transition-colors"
          >
            <div
              className={clsx(
                "w-2 h-2 rounded-full shrink-0",
                s.days_left <= 3
                  ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                  : s.days_left <= 7
                  ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]"
                  : "bg-white/20"
              )}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white/80 truncate">{s.contact_name}</p>
              <p className="text-[11px] text-white/30 truncate mt-0.5">{s.subscription_title}</p>
            </div>
            <span
              className={clsx(
                "text-xs font-semibold shrink-0 tabular-nums",
                s.days_left <= 3
                  ? "text-red-400"
                  : s.days_left <= 7
                  ? "text-amber-400"
                  : "text-white/35"
              )}
            >
              {s.days_left === 0 ? "сегодня" : `${s.days_left} дн.`}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-white/[0.05]">
        <a href="/subscriptions" className="text-xs font-medium text-white/30 hover:text-white/55 transition-colors">
          Все подписки →
        </a>
      </div>
    </div>
  );
}

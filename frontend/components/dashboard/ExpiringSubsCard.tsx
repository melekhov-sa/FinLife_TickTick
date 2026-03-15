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
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-4">
      <p className="text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-3">
        Скоро заканчивается
      </p>

      {subs.length === 0 ? (
        <p className="text-xs text-white/50 py-2">Нет истекающих подписок</p>
      ) : (
        <div className="space-y-0.5">
          {subs.map((s) => (
            <div
              key={s.member_id}
              className="flex items-start justify-between gap-3 py-2 border-b border-white/[0.04] last:border-0"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white/82 truncate leading-snug">
                  {s.subscription_title}
                  {" "}
                  <span className="text-[11px] text-white/60 font-normal">до {formatDate(s.paid_until)}</span>
                </p>
                <p className="text-[11px] text-white/60 mt-0.5 truncate">{s.contact_name}</p>
              </div>
              <span
                className={clsx(
                  "text-[11px] font-semibold shrink-0 tabular-nums px-1.5 py-0.5 rounded-md border",
                  s.days_left <= 3
                    ? "bg-red-500/12 border-red-500/20 text-red-400"
                    : s.days_left <= 14
                    ? "bg-amber-500/12 border-amber-500/20 text-amber-400"
                    : "bg-white/[0.06] border-white/[0.08] text-white/65"
                )}
              >
                {s.days_left === 0 ? "сегодня" : `${s.days_left} дн.`}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-2.5 border-t border-white/[0.05]">
        <a href="/subscriptions" className="text-[11px] font-medium text-white/58 hover:text-indigo-400 transition-colors">
          Все подписки →
        </a>
      </div>
    </div>
  );
}

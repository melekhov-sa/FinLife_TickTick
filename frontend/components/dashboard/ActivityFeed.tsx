"use client";

import { clsx } from "clsx";
import type { FeedGroup } from "@/types/api";

interface Props {
  feed: FeedGroup[];
}

export function ActivityFeed({ feed }: Props) {
  if (feed.length === 0) return null;

  return (
    <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-5">
      <h2 className="text-sm font-medium text-white/60 mb-4">Activity</h2>
      <div className="space-y-5">
        {feed.map((group) => (
          <div key={group.date}>
            <p className="text-[10px] text-white/25 uppercase tracking-wider mb-2">
              {group.label}
            </p>
            <div className="space-y-2">
              {group.events.map((ev, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-sm mt-0.5 shrink-0">{ev.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/70 truncate">{ev.title}</p>
                    {ev.subtitle && (
                      <p className="text-xs text-white/30 truncate">{ev.subtitle}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {ev.amount_label && (
                      <p
                        className={clsx(
                          "text-xs font-medium tabular-nums",
                          ev.amount_css === "income"
                            ? "text-emerald-400/70"
                            : ev.amount_css === "expense"
                            ? "text-red-400/70"
                            : "text-white/40"
                        )}
                      >
                        {ev.amount_label}
                      </p>
                    )}
                    <p className="text-[10px] text-white/20">{ev.time_str}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { clsx } from "clsx";
import type { FeedGroup } from "@/types/api";

interface Props {
  feed: FeedGroup[];
}

export function ActivityFeed({ feed }: Props) {
  if (feed.length === 0) return null;

  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-5">
      <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--t-primary)", letterSpacing: "-0.01em" }}>
        Активность
      </h2>
      <div className="space-y-5">
        {feed.map((group) => (
          <div key={group.date}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--t-label)" }}>
              {group.label}
            </p>
            <div className="space-y-1.5">
              {group.events.map((ev, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors group"
                >
                  <span className="text-base shrink-0">{ev.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate leading-snug" style={{ color: "var(--t-secondary)" }}>{ev.title}</p>
                    {ev.subtitle && (
                      <p className="text-xs truncate leading-snug" style={{ color: "var(--t-muted)" }}>{ev.subtitle}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {ev.amount_label && (
                      <p
                        className={clsx(
                          "text-xs font-semibold tabular-nums",
                          ev.amount_css === "income"
                            ? "text-emerald-400"
                            : ev.amount_css === "expense"
                            ? "text-red-400"
                            : ""
                        )}
                        style={!ev.amount_css || ev.amount_css === "neutral" ? { color: "var(--t-muted)" } : undefined}
                      >
                        {ev.amount_label}
                      </p>
                    )}
                    <p className="text-[10px] tabular-nums" style={{ color: "var(--t-faint)" }}>{ev.time_str}</p>
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

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
      <h2 className="block-title" style={{ color: "var(--t-primary)" }}>
        Активность
      </h2>
      <div className="space-y-5">
        {feed.map((group) => (
          <div key={group.date}>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--t-label)" }}>
              {group.label}
            </p>
            <div className="space-y-1.5">
              {group.events.map((ev, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 py-[14px] px-4 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] transition-colors group"
                >
                  <span className="text-base shrink-0">{ev.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="t-main truncate leading-snug" style={{ color: "var(--t-secondary)" }}>{ev.title}</p>
                    {ev.subtitle && (
                      <p className="t-secondary truncate leading-snug" style={{ color: "var(--t-muted)" }}>{ev.subtitle}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    {ev.amount_label && (
                      <p
                        className={clsx(
                          "text-[13px] font-semibold tabular-nums",
                          ev.amount_css === "income"
                            ? "money-income"
                            : ev.amount_css === "expense"
                            ? "money-expense"
                            : ""
                        )}
                        style={!ev.amount_css || ev.amount_css === "neutral" ? { color: "var(--t-muted)" } : undefined}
                      >
                        {ev.amount_label}
                      </p>
                    )}
                    <p className="text-[11px] tabular-nums" style={{ color: "var(--t-faint)" }}>{ev.time_str}</p>
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

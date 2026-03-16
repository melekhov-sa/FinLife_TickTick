"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { clsx } from "clsx";
import type { FeedGroup } from "@/types/api";

interface Props {
  feed: FeedGroup[];
}

function FeedItemMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOut(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOut);
    return () => document.removeEventListener("mousedown", onOut);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-white/[0.08]"
        style={{ color: "var(--t-faint)" }}
        title="Действия"
      >
        <MoreHorizontal size={13} />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-50 bg-[#1a2233] border border-white/[0.10] rounded-xl shadow-xl py-1 min-w-[140px]">
          <a href="/legacy/operations" className="block px-4 py-2 text-[13px] font-medium hover:bg-white/[0.05] transition-colors" style={{ color: "var(--t-secondary)" }}>
            Редактировать
          </a>
          <button className="w-full text-left block px-4 py-2 text-[13px] font-medium text-red-400/80 hover:text-red-400 hover:bg-white/[0.05] transition-colors">
            Удалить
          </button>
        </div>
      )}
    </div>
  );
}

export function ActivityFeed({ feed }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  if (feed.length === 0) return null;

  return (
    <div className="bg-white/[0.03] rounded-[14px] border border-white/[0.06] p-5">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-semibold" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
          Активность
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
        <div className="space-y-5">
          {feed.map((group) => (
            <div key={group.date}>
              <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--t-label)" }}>
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.events.map((ev, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-3 px-3.5 rounded-xl hover:bg-white/[0.03] transition-colors group"
                  >
                    <span className="text-base shrink-0">{ev.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-[500] truncate leading-snug" style={{ color: "var(--t-secondary)" }}>
                        {ev.title}
                      </p>
                      {ev.subtitle && (
                        <p className="text-[12px] truncate leading-snug opacity-65" style={{ color: "var(--t-muted)" }}>
                          {ev.subtitle}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
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
                      <FeedItemMenu />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

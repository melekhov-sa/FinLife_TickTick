"use client";

import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { clsx } from "clsx";
import type { FeedGroup, FeedEvent } from "@/types/api";

interface Props {
  feed: FeedGroup[];
}

type ActivityType = "finance" | "tasks" | "transfers";

interface TypedGroup {
  type: ActivityType;
  icon: string;
  label: string;
  items: FeedEvent[];
  total: number | null; // sum for finance, null for tasks
  count: number;
}

function classifyEvent(ev: FeedEvent): ActivityType {
  if (ev.amount_css === "income" || ev.amount_css === "expense") return "finance";
  if (ev.icon === "🔄") return "transfers";
  return "tasks";
}

function parseAmount(label: string): number {
  // "−1 350,00 ₽" or "+500,00 ₽" → number
  const cleaned = label
    .replace(/\s/g, "")
    .replace("₽", "")
    .replace(",", ".")
    .replace("−", "-")
    .replace("\u2212", "-");
  return parseFloat(cleaned) || 0;
}

const GROUP_META: Record<ActivityType, { icon: string; label: string }> = {
  finance:   { icon: "💰", label: "Финансы" },
  tasks:     { icon: "✅", label: "Задачи" },
  transfers: { icon: "🔁", label: "Переводы" },
};

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `${n < 0 ? "−" : "+"}${formatted} ₽`;
}

function ActivityGroup({ group }: { group: TypedGroup }) {
  const preview = group.items.slice(0, 3);
  const hasMore = group.items.length > 3;

  return (
    <div>
      {/* Group header */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[13px]">{group.icon}</span>
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--t-faint)", opacity: 0.7 }}>
          {group.label}
        </span>
        <span className="text-[10px] font-semibold tabular-nums bg-slate-100 dark:bg-white/[0.06] px-1.5 py-px rounded-full" style={{ color: "var(--t-muted)" }}>
          {group.count}
        </span>
        {group.total !== null && (
          <span className={clsx(
            "text-[12px] font-semibold tabular-nums ml-auto",
            group.total < 0 ? "money-expense" : "money-income"
          )}>
            {formatMoney(group.total)}
          </span>
        )}
      </div>

      {/* Items */}
      {preview.map((ev, i) => (
        <div
          key={i}
          className="flex items-center gap-2 py-1 pl-6"
        >
          <span className="text-[12px] font-medium truncate flex-1 min-w-0" style={{ color: "var(--t-secondary)" }}>
            {ev.title}
          </span>
          {ev.amount_label && (
            <span className={clsx(
              "text-[11px] font-semibold tabular-nums shrink-0",
              ev.amount_css === "income" ? "money-income" : ev.amount_css === "expense" ? "money-expense" : ""
            )} style={!ev.amount_css || ev.amount_css === "neutral" ? { color: "var(--t-muted)" } : undefined}>
              {ev.amount_label}
            </span>
          )}
          <span className="text-[9px] tabular-nums shrink-0" style={{ color: "var(--t-faint)" }}>
            {ev.time_str}
          </span>
        </div>
      ))}

      {hasMore && (
        <p className="text-[10px] font-medium pl-6 pt-0.5" style={{ color: "var(--t-faint)" }}>
          +{group.items.length - 3} ещё
        </p>
      )}
    </div>
  );
}

export function ActivityFeed({ feed }: Props) {
  const [expanded, setExpanded] = useState(false);

  // Flatten all events and classify into typed groups
  const typedGroups = useMemo<TypedGroup[]>(() => {
    const allEvents = feed.flatMap((g) => g.events);
    const buckets: Record<ActivityType, FeedEvent[]> = { finance: [], tasks: [], transfers: [] };
    for (const ev of allEvents) {
      buckets[classifyEvent(ev)].push(ev);
    }

    const result: TypedGroup[] = [];
    const order: ActivityType[] = ["finance", "tasks", "transfers"];
    for (const type of order) {
      const items = buckets[type];
      if (items.length === 0) continue;

      let total: number | null = null;
      if (type === "finance") {
        total = items.reduce((sum, ev) => sum + (ev.amount_label ? parseAmount(ev.amount_label) : 0), 0);
      }

      result.push({
        type,
        ...GROUP_META[type],
        items,
        total,
        count: items.length,
      });
    }
    return result;
  }, [feed]);

  if (feed.length === 0) return null;

  // Full chronological view (expanded)
  const fullView = (
    <div className="space-y-3">
      {feed.map((group) => (
        <div key={group.date}>
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--t-label)" }}>
            {group.label}
          </p>
          {group.events.map((ev, i) => (
            <div key={i} className="flex items-center gap-2.5 py-1.5 px-1 rounded-md hover:bg-slate-50/50 dark:hover:bg-white/[0.03] transition-colors">
              <span className="text-[13px] shrink-0">{ev.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate" style={{ color: "var(--t-secondary)" }}>{ev.title}</p>
                {ev.subtitle && (
                  <p className="text-[11px] truncate" style={{ color: "var(--t-muted)", opacity: 0.65 }}>{ev.subtitle}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                {ev.amount_label && (
                  <p className={clsx(
                    "text-[12px] font-semibold tabular-nums",
                    ev.amount_css === "income" ? "money-income" : ev.amount_css === "expense" ? "money-expense" : ""
                  )} style={!ev.amount_css || ev.amount_css === "neutral" ? { color: "var(--t-muted)" } : undefined}>
                    {ev.amount_label}
                  </p>
                )}
                <p className="text-[9px] tabular-nums" style={{ color: "var(--t-faint)" }}>{ev.time_str}</p>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="bg-white dark:bg-white/[0.03] rounded-xl md:rounded-[14px] border border-slate-200 dark:border-white/[0.06] p-3.5 md:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[13px] md:text-[14px] font-semibold" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
          Активность
        </h2>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          style={{ color: "var(--t-faint)" }}
        >
          <ChevronDown size={14} className={clsx("transition-transform duration-200", expanded && "rotate-180")} />
        </button>
      </div>

      {!expanded ? (
        /* Compact grouped view */
        <div className="space-y-2.5">
          {typedGroups.map((g) => (
            <ActivityGroup key={g.type} group={g} />
          ))}

          {typedGroups.length > 0 && (
            <button
              onClick={() => setExpanded(true)}
              className="w-full text-center py-1.5 text-[11px] font-medium transition-colors hover:text-indigo-500 touch-manipulation"
              style={{ color: "var(--t-faint)" }}
            >
              Показать все →
            </button>
          )}
        </div>
      ) : (
        /* Full chronological view */
        fullView
      )}
    </div>
  );
}

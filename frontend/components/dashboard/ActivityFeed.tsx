"use client";

import { useState, useMemo } from "react";
import { clsx } from "clsx";
import type { FeedGroup, FeedEvent } from "@/types/api";

interface Props {
  feed: FeedGroup[];
}

// ── Classification ───────────────────────────────────────────────────────────

type ItemType = "expense" | "income" | "transfer" | "task" | "habit" | "goal";

function classifyEvent(ev: FeedEvent): ItemType {
  if (ev.amount_css === "expense") return "expense";
  if (ev.amount_css === "income") return "income";
  if (ev.amount_css === "transfer") return "transfer";
  if (ev.icon === "💪") return "habit";
  if (ev.icon === "🏆") return "goal";
  return "task";
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function parseFinanceSubtitle(sub: string): { wallet: string; category: string } {
  const parts = sub.split(" · ");
  if (parts.length >= 2) return { wallet: parts[0], category: parts.slice(1).join(" · ") };
  return { wallet: sub, category: "" };
}

function parseAmount(label: string): number {
  const cleaned = label.replace(/\s/g, "").replace("₽", "").replace(",", ".").replace("−", "-").replace("\u2212", "-");
  return parseFloat(cleaned) || 0;
}

function formatTotal(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return `${n < 0 ? "−" : "+"}${formatted} ₽`;
}

// ── Single-line row renderers ────────────────────────────────────────────────

function FinanceRow({ ev }: { ev: FeedEvent }) {
  const type = classifyEvent(ev);
  const { category } = parseFinanceSubtitle(ev.subtitle);
  const isGenericTitle = ev.title === "Расход" || ev.title === "Доход";
  const mainText = isGenericTitle ? (category || ev.title) : ev.title;

  return (
    <div className="flex items-center gap-2 py-[5px] border-t first:border-0 border-slate-100/60 dark:border-white/[0.04]">
      <span className="text-[14px] shrink-0">{ev.icon}</span>
      <span className="text-[14px] font-medium truncate flex-1 min-w-0" style={{ color: "var(--t-primary)" }}>
        {mainText}
      </span>
      <span className="text-[12px] tabular-nums shrink-0" style={{ color: "var(--t-faint)" }}>
        {ev.time_str}
      </span>
      {ev.amount_label && (
        <span className={clsx(
          "text-[13px] font-semibold tabular-nums shrink-0 min-w-[80px] text-right",
          type === "income" ? "money-income" : "money-expense"
        )}>
          {ev.amount_label}
        </span>
      )}
    </div>
  );
}

function TransferRow({ ev }: { ev: FeedEvent }) {
  const isGenericTitle = ev.title === "Перевод";
  const mainText = isGenericTitle ? ev.subtitle : ev.title;

  return (
    <div className="flex items-center gap-2 py-[5px] border-t first:border-0 border-slate-100/60 dark:border-white/[0.04]">
      <span className="text-[14px] shrink-0">🔄</span>
      <span className="text-[14px] font-medium truncate flex-1 min-w-0" style={{ color: "var(--t-primary)" }}>
        {mainText}
      </span>
      <span className="text-[12px] tabular-nums shrink-0" style={{ color: "var(--t-faint)" }}>
        {ev.time_str}
      </span>
      {ev.amount_label && (
        <span className="text-[13px] font-semibold tabular-nums shrink-0 min-w-[80px] text-right" style={{ color: "var(--t-muted)" }}>
          {ev.amount_label}
        </span>
      )}
    </div>
  );
}

function TaskRow({ ev }: { ev: FeedEvent }) {
  return (
    <div className="flex items-center gap-2 py-[5px] border-t first:border-0 border-slate-100/60 dark:border-white/[0.04]">
      <span className="text-[14px] shrink-0">{ev.icon}</span>
      <span className="text-[14px] font-medium truncate flex-1 min-w-0" style={{ color: "var(--t-primary)" }}>
        {ev.title}
      </span>
      <span className="text-[12px] tabular-nums shrink-0" style={{ color: "var(--t-faint)" }}>
        {ev.time_str}
      </span>
    </div>
  );
}

function EventRow({ ev }: { ev: FeedEvent }) {
  const type = classifyEvent(ev);
  if (type === "expense" || type === "income") return <FinanceRow ev={ev} />;
  if (type === "transfer") return <TransferRow ev={ev} />;
  return <TaskRow ev={ev} />;
}

// ── Type group within a day ──────────────────────────────────────────────────

type GroupType = "finance" | "tasks" | "transfers";

const GROUP_LABELS: Record<GroupType, string> = {
  finance: "Финансы", tasks: "Задачи", transfers: "Переводы",
};

function toGroupType(t: ItemType): GroupType {
  if (t === "expense" || t === "income") return "finance";
  if (t === "transfer") return "transfers";
  return "tasks";
}

interface InnerGroup {
  groupType: GroupType;
  items: FeedEvent[];
  total: number | null;
}

function buildInnerGroups(events: FeedEvent[]): InnerGroup[] {
  const buckets: Record<GroupType, FeedEvent[]> = { finance: [], tasks: [], transfers: [] };
  for (const ev of events) buckets[toGroupType(classifyEvent(ev))].push(ev);

  const result: InnerGroup[] = [];
  for (const gt of ["finance", "tasks", "transfers"] as GroupType[]) {
    const items = buckets[gt];
    if (items.length === 0) continue;

    let total: number | null = null;
    if (gt === "finance") {
      total = items.reduce((s, ev) => s + (ev.amount_label ? parseAmount(ev.amount_label) : 0), 0);
    }

    result.push({ groupType: gt, items, total });
  }
  return result;
}

function InnerGroupSection({ group }: { group: InnerGroup }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? group.items : group.items.slice(0, 3);
  const hiddenCount = group.items.length - 3;

  return (
    <div className="mt-1.5 first:mt-0">
      {/* Group header */}
      <div className="flex items-center gap-1.5 mb-px">
        <span className="text-[11px] font-bold uppercase tracking-[0.05em]" style={{ color: "var(--t-muted)", opacity: 0.5 }}>
          {GROUP_LABELS[group.groupType]}
        </span>
        <span className="text-[11px]" style={{ color: "var(--t-faint)", opacity: 0.4 }}>·</span>
        <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--t-muted)", opacity: 0.5 }}>
          {group.items.length}
        </span>

        {group.total !== null && (
          <span className={clsx(
            "text-[13px] font-semibold tabular-nums ml-auto",
            group.total < 0 ? "money-expense" : "money-income"
          )}>
            {formatTotal(group.total)}
          </span>
        )}
      </div>

      {visible.map((ev, i) => <EventRow key={`${ev.occurred_at}-${ev.title}-${i}`} ev={ev} />)}

      {!showAll && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="text-[12px] font-medium pt-0.5 pl-6 transition-colors hover:text-indigo-500 touch-manipulation"
          style={{ color: "var(--t-faint)" }}
        >
          Показать ещё {hiddenCount} →
        </button>
      )}
    </div>
  );
}

// ── Day block ────────────────────────────────────────────────────────────────

function DayBlock({ group, isFirst }: { group: FeedGroup; isFirst: boolean }) {
  const innerGroups = useMemo(() => buildInnerGroups(group.events), [group.events]);

  return (
    <div className={clsx(!isFirst && "pt-2.5 mt-2 border-t border-slate-100 dark:border-white/[0.05]")}>
      <p className="text-[14px] font-bold mb-0.5" style={{ color: "var(--t-primary)" }}>
        {group.label}
      </p>
      {innerGroups.map((ig) => (
        <InnerGroupSection key={ig.groupType} group={ig} />
      ))}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function ActivityFeed({ feed }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (feed.length === 0) return null;

  const visibleDays = showAll ? feed : feed.slice(0, 2);
  const hiddenDayCount = feed.length - 2;

  return (
    <div className="bg-white dark:bg-white/[0.03] rounded-xl md:rounded-[14px] border border-slate-200 dark:border-white/[0.06] p-3 md:p-4">
      <h2 className="text-[15px] md:text-[16px] font-semibold mb-2" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
        Активность
      </h2>

      <div>
        {visibleDays.map((group, i) => (
          <DayBlock key={group.date} group={group} isFirst={i === 0} />
        ))}
      </div>

      {!showAll && hiddenDayCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full text-center py-1.5 mt-2 text-[13px] font-medium transition-colors hover:text-indigo-500 touch-manipulation"
          style={{ color: "var(--t-faint)" }}
        >
          Показать всю историю →
        </button>
      )}
      {showAll && feed.length > 2 && (
        <button
          onClick={() => setShowAll(false)}
          className="w-full text-center py-1 mt-1.5 text-[12px] font-medium transition-colors hover:text-indigo-500"
          style={{ color: "var(--t-faint)" }}
        >
          Скрыть
        </button>
      )}
    </div>
  );
}

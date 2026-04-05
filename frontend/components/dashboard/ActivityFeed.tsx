"use client";

import { useState, useMemo } from "react";
import { ChevronDown } from "lucide-react";
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

// ── Parsing helpers ──────────────────────────────────────────────────────────

/** "Альфа · Еда" → { wallet: "Альфа", category: "Еда" } */
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

// ── Chips ────────────────────────────────────────────────────────────────────

const CHIP_STYLES: Record<string, string> = {
  expense:  "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10",
  income:   "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10",
  transfer: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10",
  habit:    "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10",
  goal:     "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10",
  repeat:   "text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/[0.06]",
};

const CHIP_LABELS: Record<string, string> = {
  expense: "Расход", income: "Доход", transfer: "Перевод",
  habit: "Привычка", goal: "Цель", repeat: "Повтор",
};

function Chip({ type }: { type: string }) {
  return (
    <span className={clsx("text-[8px] font-bold uppercase tracking-wider px-1 py-px rounded shrink-0", CHIP_STYLES[type])}>
      {CHIP_LABELS[type]}
    </span>
  );
}

// ── Item renderers ───────────────────────────────────────────────────────────

function FinanceRow({ ev }: { ev: FeedEvent }) {
  const type = classifyEvent(ev);
  const { wallet, category } = parseFinanceSubtitle(ev.subtitle);
  // If title is not generic "Расход"/"Доход", use it as the main text (user description)
  const isGenericTitle = ev.title === "Расход" || ev.title === "Доход";
  const mainText = isGenericTitle ? (category || wallet || ev.title) : ev.title;
  const secondaryText = isGenericTitle ? (category ? wallet : "") : ev.subtitle;

  return (
    <div className="flex items-center gap-2 py-1.5 border-t first:border-0 border-slate-100 dark:border-white/[0.05]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium truncate" style={{ color: "var(--t-secondary)" }}>
            {mainText}
          </span>
          <Chip type={type} />
        </div>
        {secondaryText && (
          <p className="text-[10px] truncate mt-px" style={{ color: "var(--t-faint)" }}>{secondaryText}</p>
        )}
      </div>
      <div className="text-right shrink-0 flex items-baseline gap-1.5">
        {ev.amount_label && (
          <span className={clsx(
            "text-[11px] font-semibold tabular-nums",
            type === "income" ? "money-income" : "money-expense"
          )}>
            {ev.amount_label}
          </span>
        )}
        <span className="text-[9px] tabular-nums" style={{ color: "var(--t-faint)" }}>{ev.time_str}</span>
      </div>
    </div>
  );
}

function TransferRow({ ev }: { ev: FeedEvent }) {
  // subtitle = "Альфа → Сбер"
  const isGenericTitle = ev.title === "Перевод";
  const mainText = isGenericTitle ? ev.subtitle : ev.title;
  const secondaryText = isGenericTitle ? "" : ev.subtitle;

  return (
    <div className="flex items-center gap-2 py-1.5 border-t first:border-0 border-slate-100 dark:border-white/[0.05]">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-medium truncate" style={{ color: "var(--t-secondary)" }}>
            {mainText}
          </span>
          <Chip type="transfer" />
        </div>
        {secondaryText && (
          <p className="text-[10px] truncate mt-px" style={{ color: "var(--t-faint)" }}>{secondaryText}</p>
        )}
      </div>
      <div className="text-right shrink-0 flex items-baseline gap-1.5">
        {ev.amount_label && (
          <span className="text-[11px] font-semibold tabular-nums" style={{ color: "var(--t-muted)" }}>
            {ev.amount_label}
          </span>
        )}
        <span className="text-[9px] tabular-nums" style={{ color: "var(--t-faint)" }}>{ev.time_str}</span>
      </div>
    </div>
  );
}

function TaskRow({ ev }: { ev: FeedEvent }) {
  const type = classifyEvent(ev);
  const chipType = type === "habit" ? "habit" : type === "goal" ? "goal"
    : ev.subtitle.includes("Повтор") ? "repeat" : null;

  return (
    <div className="flex items-center gap-2 py-1.5 border-t first:border-0 border-slate-100 dark:border-white/[0.05]">
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="text-[12px] font-medium truncate" style={{ color: "var(--t-secondary)" }}>
          {ev.title}
        </span>
        {chipType && <Chip type={chipType} />}
      </div>
      <span className="text-[9px] tabular-nums shrink-0" style={{ color: "var(--t-faint)" }}>{ev.time_str}</span>
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

const GROUP_META: Record<GroupType, { icon: string; label: string }> = {
  finance:   { icon: "💰", label: "Финансы" },
  tasks:     { icon: "✅", label: "Задачи" },
  transfers: { icon: "🔁", label: "Переводы" },
};

function toGroupType(t: ItemType): GroupType {
  if (t === "expense" || t === "income") return "finance";
  if (t === "transfer") return "transfers";
  return "tasks";
}

interface InnerGroup {
  groupType: GroupType;
  items: FeedEvent[];
  expenseCount: number;
  incomeCount: number;
  transferCount: number;
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
    let expenseCount = 0, incomeCount = 0, transferCount = 0;
    if (gt === "finance") {
      total = items.reduce((s, ev) => s + (ev.amount_label ? parseAmount(ev.amount_label) : 0), 0);
      expenseCount = items.filter(ev => ev.amount_css === "expense").length;
      incomeCount = items.filter(ev => ev.amount_css === "income").length;
    } else if (gt === "transfers") {
      transferCount = items.length;
    }

    result.push({ groupType: gt, items, expenseCount, incomeCount, transferCount, total });
  }
  return result;
}

function InnerGroupSection({ group, defaultExpanded }: { group: InnerGroup; defaultExpanded: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const meta = GROUP_META[group.groupType];
  const visible = showAll ? group.items : group.items.slice(0, 3);
  const hiddenCount = group.items.length - 3;

  return (
    <div>
      {/* Group header */}
      <div className="flex items-center gap-1.5 mt-2 first:mt-0 mb-0.5">
        <span className="text-[11px]">{meta.icon}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--t-faint)", opacity: 0.65 }}>
          {meta.label}
        </span>
        <span className="text-[9px] font-semibold tabular-nums bg-slate-100 dark:bg-white/[0.06] px-1 py-px rounded-full" style={{ color: "var(--t-muted)" }}>
          {group.items.length}
        </span>

        {/* Finance sub-chips */}
        {group.groupType === "finance" && (
          <div className="flex items-center gap-1 ml-0.5">
            {group.expenseCount > 0 && (
              <span className="text-[8px] font-bold text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-1 py-px rounded">
                {group.expenseCount} расх.
              </span>
            )}
            {group.incomeCount > 0 && (
              <span className="text-[8px] font-bold text-emerald-500 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1 py-px rounded">
                {group.incomeCount} дох.
              </span>
            )}
          </div>
        )}

        {group.total !== null && (
          <span className={clsx(
            "text-[11px] font-semibold tabular-nums ml-auto",
            group.total < 0 ? "money-expense" : "money-income"
          )}>
            {formatTotal(group.total)}
          </span>
        )}
      </div>

      {/* Items */}
      {visible.map((ev, i) => <EventRow key={i} ev={ev} />)}

      {!showAll && hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="text-[10px] font-medium pt-1 transition-colors hover:text-indigo-500 touch-manipulation"
          style={{ color: "var(--t-faint)" }}
        >
          Показать ещё {hiddenCount} →
        </button>
      )}
    </div>
  );
}

// ── Day block ────────────────────────────────────────────────────────────────

function DayBlock({ group, defaultExpanded }: { group: FeedGroup; defaultExpanded: boolean }) {
  const innerGroups = useMemo(() => buildInnerGroups(group.events), [group.events]);

  return (
    <div>
      {/* Day header */}
      <p className="text-[12px] font-bold mb-1" style={{ color: "var(--t-primary)" }}>
        {group.label}
      </p>

      {innerGroups.map((ig) => (
        <InnerGroupSection key={ig.groupType} group={ig} defaultExpanded={defaultExpanded} />
      ))}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ActivityFeed({ feed }: Props) {
  const [showAll, setShowAll] = useState(false);

  if (feed.length === 0) return null;

  // Show first 2-3 days by default (days that have activity)
  const visibleDays = showAll ? feed : feed.slice(0, 3);
  const hiddenDayCount = feed.length - 3;

  return (
    <div className="bg-white dark:bg-white/[0.03] rounded-xl md:rounded-[14px] border border-slate-200 dark:border-white/[0.06] p-3.5 md:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[13px] md:text-[14px] font-semibold" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
          Активность
        </h2>
      </div>

      {/* Day blocks */}
      <div className="space-y-3">
        {visibleDays.map((group, i) => (
          <DayBlock key={group.date} group={group} defaultExpanded={i < 2} />
        ))}
      </div>

      {/* Show all / collapse */}
      {!showAll && hiddenDayCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full text-center py-2 mt-2 text-[11px] font-medium transition-colors hover:text-indigo-500 touch-manipulation"
          style={{ color: "var(--t-faint)" }}
        >
          Показать всю историю →
        </button>
      )}
      {showAll && feed.length > 3 && (
        <button
          onClick={() => setShowAll(false)}
          className="w-full text-center py-1.5 mt-2 text-[10px] font-medium transition-colors hover:text-indigo-500"
          style={{ color: "var(--t-faint)" }}
        >
          Скрыть
        </button>
      )}
    </div>
  );
}

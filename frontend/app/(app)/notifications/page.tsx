"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, BellOff, ClipboardList, CreditCard, Banknote, Calendar,
  AlertTriangle, Eye,
} from "lucide-react";
import { clsx } from "clsx";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { useNotifications, useMarkRead, useMarkAllRead } from "@/hooks/useNotifications";
import type { NotificationItem } from "@/types/api";
import { Button } from "@/components/primitives/Button";
import { Badge } from "@/components/primitives/Badge";
import { Skeleton } from "@/components/primitives/Skeleton";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNotifMeta(n: NotificationItem) {
  const { rule_code, severity } = n;

  let Icon = Bell;
  if (rule_code === "TASK_OVERDUE")               Icon = ClipboardList;
  else if (rule_code.startsWith("SUB_MEMBER"))    Icon = CreditCard;
  else if (rule_code === "PAYMENT_DUE_TOMORROW")  Icon = Banknote;
  else if (rule_code.startsWith("EVENT"))         Icon = Calendar;
  else if (severity === "error" || severity === "warning") Icon = AlertTriangle;

  let iconColor = "text-indigo-400";
  let iconBg    = "bg-indigo-500/10";
  let leftBar   = "bg-indigo-500/40";
  if (severity === "error")   { iconColor = "text-red-400";   iconBg = "bg-red-500/10";   leftBar = "bg-red-500/50"; }
  if (severity === "warning") { iconColor = "text-amber-400"; iconBg = "bg-amber-500/10"; leftBar = "bg-amber-500/40"; }

  let href: string | null = null;
  if (rule_code === "TASK_OVERDUE")              href = "/tasks";
  else if (rule_code.startsWith("SUB_MEMBER"))   href = "/subscriptions";
  else if (rule_code === "PAYMENT_DUE_TOMORROW") href = "/money";

  return { Icon, iconColor, iconBg, leftBar, href };
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d === 1) return "вчера";
  return `${d} дн назад`;
}

function groupLabel(iso: string): string {
  const d = new Date(iso);
  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo   = new Date(today); weekAgo.setDate(today.getDate() - 7);
  if (d >= today)     return "Сегодня";
  if (d >= yesterday) return "Вчера";
  if (d >= weekAgo)   return "На этой неделе";
  return "Ранее";
}

type FilterValue = "all" | "unread" | "important";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all",       label: "Все" },
  { value: "unread",    label: "Непрочитанные" },
  { value: "important", label: "Важные" },
];

// ── NotificationRow ───────────────────────────────────────────────────────────

function NotificationRow({
  n,
  onRead,
  onClick,
  isLast,
}: {
  n: NotificationItem;
  onRead: () => void;
  onClick: () => void;
  isLast: boolean;
}) {
  const { Icon, iconColor, iconBg, leftBar } = getNotifMeta(n);

  return (
    <div
      className={clsx(
        "group relative flex items-start gap-3.5 px-4 py-3 cursor-pointer transition-colors",
        isLast ? "" : "border-b border-white/[0.04]",
        n.is_read ? "opacity-50 hover:opacity-70" : "hover:bg-white/[0.03]"
      )}
      onClick={onClick}
    >
      {/* Unread bar */}
      {!n.is_read && (
        <div className={clsx("absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full", leftBar)} />
      )}

      {/* Icon */}
      <div className={clsx("w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5", iconBg)}>
        <Icon size={15} className={iconColor} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={clsx(
          "text-[14px] leading-snug truncate",
          n.is_read ? "font-normal" : "font-semibold"
        )} style={{ color: "var(--t-primary)", letterSpacing: "-0.01em" }}>
          {n.title}
        </p>
        <p className="text-[13px] mt-0.5 leading-snug line-clamp-2" style={{ color: "var(--t-muted)" }}>
          {n.body_inapp}
        </p>
      </div>

      {/* Right col */}
      <div className="shrink-0 flex flex-col items-end gap-1.5 mt-0.5">
        <span className="text-[12px] tabular-nums" style={{ color: "var(--t-faint)" }}>
          {timeAgo(n.created_at)}
        </span>
        {!n.is_read && (
          <div className="w-2 h-2 rounded-full bg-indigo-500" />
        )}
      </div>

      {/* Hover actions */}
      {!n.is_read && (
        <button
          onClick={(e) => { e.stopPropagation(); onRead(); }}
          className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.07]"
          style={{ color: "var(--t-faint)" }}
          title="Отметить прочитанным"
        >
          <Eye size={13} />
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterValue>("all");
  const { data: notifications, isLoading } = useNotifications();
  const { mutate: markRead } = useMarkRead();
  const { mutate: markAll }  = useMarkAllRead();

  const all         = notifications ?? [];
  const unreadCount = all.filter((n) => !n.is_read).length;

  const filtered = all.filter((n) => {
    if (filter === "unread")    return !n.is_read;
    if (filter === "important") return n.severity === "error" || n.severity === "warning";
    return true;
  });

  // Group by day
  const groups: { label: string; items: NotificationItem[] }[] = [];
  const GROUP_ORDER = ["Сегодня", "Вчера", "На этой неделе", "Ранее"];
  for (const n of filtered) {
    const lbl = groupLabel(n.created_at);
    let grp = groups.find((g) => g.label === lbl);
    if (!grp) { grp = { label: lbl, items: [] }; groups.push(grp); }
    grp.items.push(n);
  }
  groups.sort((a, b) => GROUP_ORDER.indexOf(a.label) - GROUP_ORDER.indexOf(b.label));

  function handleClick(n: NotificationItem) {
    if (!n.is_read) markRead(n.id);
    const { href } = getNotifMeta(n);
    if (href) router.push(href);
  }

  return (
    <>
      <AppTopbar title="Уведомления" />
      <main className="flex-1 overflow-auto p-3 md:p-6 w-full">

        {/* Header bar */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {unreadCount > 0 ? (
              <Badge variant="danger" size="md">{unreadCount} непрочитанных</Badge>
            ) : (
              <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>
                Все прочитано
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button onClick={() => markAll()} variant="outline" size="sm">
              Очистить все
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1 mb-5 w-fit">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                filter === value
                  ? "bg-white/[0.09] text-white shadow-sm"
                  : "text-white/55 hover:text-white/80"
              )}
            >
              {label}
              {value === "unread" && unreadCount > 0 && (
                <span className="ml-1.5 text-[10px] font-bold text-red-400 tabular-nums">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} variant="rect" height={68} className="rounded-2xl" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
              <BellOff size={24} style={{ color: "var(--t-faint)" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--t-muted)" }}>
              {filter === "unread" ? "Нет непрочитанных" : filter === "important" ? "Нет важных уведомлений" : "Нет уведомлений"}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--t-faint)" }}>
              Когда что-то важное произойдёт — вы узнаете
            </p>
          </div>
        )}

        {/* Grouped list */}
        {!isLoading && groups.length > 0 && (
          <div className="space-y-5">
            {groups.map((group) => (
              <div key={group.label}>
                {/* Only show group header when there are multiple groups */}
                {groups.length > 1 && (
                  <p className="text-[11px] font-semibold uppercase tracking-widest mb-2 px-1"
                    style={{ color: "var(--t-faint)" }}>
                    {group.label}
                  </p>
                )}
                <div className="bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-2xl overflow-hidden">
                  {group.items.map((n, i) => (
                    <NotificationRow
                      key={n.id}
                      n={n}
                      onRead={() => markRead(n.id)}
                      onClick={() => handleClick(n)}
                      isLast={i === group.items.length - 1}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell, BellOff, ClipboardList, CreditCard, Banknote, Calendar,
  AlertTriangle, CheckCheck, X,
} from "lucide-react";
import { clsx } from "clsx";
import type { NotificationItem } from "@/types/api";
import { useNotifications, useNotificationsBadge, useMarkRead, useMarkAllRead } from "@/hooks/useNotifications";

// ── Type meta ─────────────────────────────────────────────────────────────────

function getNotifMeta(n: NotificationItem) {
  const { rule_code, severity } = n;

  let Icon = Bell;
  if (rule_code === "TASK_OVERDUE")                     Icon = ClipboardList;
  else if (rule_code.startsWith("SUB_MEMBER"))          Icon = CreditCard;
  else if (rule_code === "PAYMENT_DUE_TOMORROW")        Icon = Banknote;
  else if (rule_code.startsWith("EVENT"))               Icon = Calendar;
  else if (severity === "error" || severity === "warning") Icon = AlertTriangle;

  let iconColor = "text-indigo-400";
  let iconBg    = "bg-indigo-500/10";
  if (severity === "error")   { iconColor = "text-red-400";   iconBg = "bg-red-500/10"; }
  if (severity === "warning") { iconColor = "text-amber-400"; iconBg = "bg-amber-500/10"; }

  let href: string | null = null;
  if (rule_code === "TASK_OVERDUE")              href = "/tasks";
  else if (rule_code.startsWith("SUB_MEMBER"))   href = "/subscriptions";
  else if (rule_code === "PAYMENT_DUE_TOMORROW") href = "/money";

  return { Icon, iconColor, iconBg, href };
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "только что";
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч`;
  const d = Math.floor(h / 24);
  if (d === 1) return "вчера";
  return `${d} д`;
}

// ── Popover ───────────────────────────────────────────────────────────────────

interface PopoverProps {
  anchorRect: DOMRect;
  onClose: () => void;
}

function NotificationPopover({ anchorRect, onClose }: PopoverProps) {
  const router = useRouter();
  const { data: notifications } = useNotifications();
  const { mutate: markRead }    = useMarkRead();
  const { mutate: markAll }     = useMarkAllRead();

  const preview = (notifications ?? []).slice(0, 8);
  const unreadCount = (notifications ?? []).filter((n) => !n.is_read).length;

  // Position: drop down from bell, align right
  const right  = Math.max(8, window.innerWidth - anchorRect.right);
  const top    = anchorRect.bottom + 8;

  function handleClick(n: NotificationItem) {
    if (!n.is_read) markRead(n.id);
    const meta = getNotifMeta(n);
    if (meta.href) { router.push(meta.href); }
    onClose();
  }

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return createPortal(
    <div
      className="fixed inset-0 z-[200]"
      onClick={onClose}
    >
      <div
        className={clsx(
          "flex flex-col overflow-hidden bg-white dark:bg-[#161d2b] border border-slate-200 dark:border-white/[0.07]",
          isMobile
            ? "fixed inset-x-0 bottom-0 rounded-t-2xl max-h-[85dvh]"
            : "absolute rounded-2xl"
        )}
        style={isMobile ? {
          boxShadow: "0 -10px 40px rgba(0,0,0,0.15)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        } : {
          top,
          right,
          width: 380,
          maxHeight: "calc(100vh - 80px)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile handle bar */}
        {isMobile && (
          <div className="flex justify-center pt-2.5 pb-1 shrink-0">
            <div className="w-9 h-1 rounded-full bg-slate-300 dark:bg-white/[0.15]" />
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>
              Уведомления
            </span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-semibold bg-red-500/15 text-red-500 dark:bg-red-500/20 dark:text-red-400 rounded-full px-1.5 leading-[1.7] tabular-nums">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={() => markAll()}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                style={{ color: "var(--t-faint)" }}
              >
                <CheckCheck size={12} />
                Всё прочитано
              </button>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors touch-manipulation"
              style={{ color: "var(--t-faint)" }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }}>
          {preview.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <BellOff size={24} className="mb-2.5" style={{ color: "var(--t-faint)" }} />
              <p className="text-[13px] font-medium" style={{ color: "var(--t-muted)" }}>Нет уведомлений</p>
              <p className="text-[12px] mt-0.5" style={{ color: "var(--t-faint)" }}>Всё под контролем</p>
            </div>
          )}
          {preview.map((n, i) => {
            const { Icon, iconColor, iconBg } = getNotifMeta(n);
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={clsx(
                  "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors touch-manipulation",
                  i < preview.length - 1 && "border-b border-slate-100 dark:border-white/[0.04]",
                  n.is_read ? "opacity-50 hover:opacity-70" : "hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                )}
              >
                <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", iconBg)}>
                  <Icon size={14} className={iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold leading-snug" style={{ color: "var(--t-primary)" }}>
                    {n.title}
                  </p>
                  <p className="text-[12px] mt-0.5 leading-snug line-clamp-2" style={{ color: "var(--t-muted)" }}>
                    {n.body_inapp}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5 mt-0.5">
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                    {timeAgo(n.created_at)}
                  </span>
                  {!n.is_read && (
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-200 dark:border-white/[0.06] px-4 py-2.5">
          <Link
            href="/notifications"
            onClick={onClose}
            className="block w-full text-center text-[13px] font-medium py-2 rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.05]"
            style={{ color: "var(--t-muted)" }}
          >
            Все уведомления →
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Bell button ───────────────────────────────────────────────────────────────

export function NotificationBell() {
  const [open, setOpen]       = useState(false);
  const btnRef                = useRef<HTMLButtonElement>(null);
  const [rect, setRect]       = useState<DOMRect | null>(null);
  const { data: badge }       = useNotificationsBadge();
  const unread                = badge?.unread_count ?? 0;

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  function toggle() {
    if (!open && btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect());
    }
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-white/[0.12] active:bg-white/[0.2] touch-manipulation"
        style={{ color: unread > 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)" }}
        title="Уведомления"
      >
        <Bell size={15} />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold tabular-nums px-[3px] leading-none"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && rect && (
        <NotificationPopover anchorRect={rect} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

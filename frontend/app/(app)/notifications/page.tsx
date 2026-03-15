"use client";

import { Bell, BellOff } from "lucide-react";
import { clsx } from "clsx";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { useNotifications, useMarkRead } from "@/hooks/useNotifications";

const SEVERITY_STYLE: Record<string, { border: string; dot: string }> = {
  info:    { border: "border-l-indigo-500/50",  dot: "bg-indigo-500" },
  warning: { border: "border-l-amber-500/50",   dot: "bg-amber-400" },
  error:   { border: "border-l-red-500/50",     dot: "bg-red-500" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} дн назад`;
}

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useNotifications();
  const { mutate: markRead } = useMarkRead();

  const unreadCount = notifications?.filter((n) => !n.is_read).length ?? 0;

  return (
    <>
      <AppTopbar title="Уведомления" />
      <main className="flex-1 overflow-auto p-6 max-w-2xl">
        {/* Header stats */}
        {notifications && notifications.length > 0 && unreadCount > 0 && (
          <div className="flex items-center gap-2 mb-5">
            <span className="text-[10px] font-semibold text-indigo-400/80 bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded-full uppercase tracking-widest">
              {unreadCount} непрочитанных
            </span>
          </div>
        )}

        {isLoading && (
          <div className="space-y-2.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-white/[0.03] rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {notifications && notifications.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-5">
              <BellOff size={24} className="text-white/50" />
            </div>
            <p className="text-sm font-medium text-white/60">Уведомлений нет</p>
            <p className="text-xs text-white/50 mt-1">Когда что-то важное произойдёт — вы узнаете</p>
          </div>
        )}

        {notifications && notifications.length > 0 && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
            {notifications.map((n, i) => {
              const style = SEVERITY_STYLE[n.severity] ?? { border: "border-l-white/20", dot: "bg-white/25" };
              return (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && markRead(n.id)}
                  className={clsx(
                    "flex items-start gap-4 px-5 py-4 border-l-2 cursor-pointer transition-colors",
                    style.border,
                    i < notifications.length - 1 && "border-b border-white/[0.04]",
                    n.is_read
                      ? "opacity-45 hover:opacity-60"
                      : "hover:bg-white/[0.03]"
                  )}
                >
                  <div className={clsx("w-2 h-2 rounded-full shrink-0 mt-2", style.dot)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white/85" style={{ letterSpacing: "-0.01em" }}>
                      {n.title}
                    </p>
                    <p className="text-xs text-white/72 mt-0.5 leading-snug line-clamp-2">{n.body_inapp}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5 mt-0.5">
                    <span className="text-[10px] font-medium text-white/55 tabular-nums">
                      {timeAgo(n.created_at)}
                    </span>
                    {!n.is_read && (
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

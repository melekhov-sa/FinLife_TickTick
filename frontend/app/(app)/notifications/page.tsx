"use client";

import { clsx } from "clsx";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { useNotifications, useMarkRead } from "@/hooks/useNotifications";

const SEVERITY_STYLE: Record<string, string> = {
  info:    "border-l-indigo-500/40",
  warning: "border-l-amber-500/40",
  error:   "border-l-red-500/40",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useNotifications();
  const { mutate: markRead } = useMarkRead();

  return (
    <>
      <AppTopbar title="Notifications" />
      <main className="flex-1 p-6 max-w-2xl">
        {isLoading && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-white/[0.03] rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {notifications && notifications.length === 0 && (
          <div className="text-center py-24">
            <p className="text-sm text-white/25">No notifications</p>
          </div>
        )}

        {notifications && notifications.length > 0 && (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                className={clsx(
                  "flex items-start gap-4 p-4 rounded-xl border-l-2 cursor-pointer transition-colors",
                  SEVERITY_STYLE[n.severity] ?? "border-l-white/20",
                  n.is_read
                    ? "bg-white/[0.02] opacity-50"
                    : "bg-white/[0.04] hover:bg-white/[0.06]"
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white/80">{n.title}</p>
                  <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{n.body_inapp}</p>
                </div>
                <span className="text-[10px] text-white/25 shrink-0 mt-0.5">
                  {timeAgo(n.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

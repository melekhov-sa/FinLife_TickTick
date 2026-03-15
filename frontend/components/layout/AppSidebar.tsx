"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Target,
  BarChart3,
  Bell,
  Wallet,
  BookOpen,
  Settings,
  LogOut,
  Sun,
  Moon,
  Repeat2,
  CalendarDays,
  CreditCard,
  ClipboardList,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/dashboard",      label: "Дашборд",       icon: LayoutDashboard },
  { href: "/plan",           label: "План",           icon: ClipboardList },
  { href: "/projects",       label: "Проекты",       icon: FolderKanban },
  { href: "/tasks",          label: "Задачи",        icon: CheckSquare },
  { href: "/strategy",       label: "Стратегия",     icon: Target },
  { href: "/efficiency",     label: "Эффективность", icon: BarChart3 },
  { href: "/habits",         label: "Привычки",      icon: Repeat2 },
  { href: "/events",         label: "События",       icon: CalendarDays },
  { href: "/subscriptions",  label: "Подписки",      icon: CreditCard },
  { href: "/money",          label: "Финансы",       icon: Wallet },
  { href: "/notifications",  label: "Уведомления",   icon: Bell },
  { href: "/knowledge",      label: "База знаний",   icon: BookOpen },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const { data: badge } = useQuery<{ unread_count: number }>({
    queryKey: ["notifications-badge"],
    queryFn: () => api.get("/api/v2/notifications/badge"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside
      className="flex flex-col h-full w-[220px] select-none shrink-0 border-r"
      style={{
        background: "var(--app-sidebar-bg)",
        borderColor: "var(--app-border)",
        boxShadow: isDark ? "1px 0 20px rgba(0,0,0,0.3)" : "1px 0 0 rgba(0,0,0,0.06)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-[18px] mb-1">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
        >
          <span className="text-white text-xs font-bold tracking-tight">FL</span>
        </div>
        <span
          className="font-semibold text-sm"
          style={{
            color: isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.82)",
            letterSpacing: "-0.02em",
          }}
        >
          FinLife
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2.5 space-y-px overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          const isNotifications = href === "/notifications";
          const unread = isNotifications ? (badge?.unread_count ?? 0) : 0;

          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                active
                  ? isDark
                    ? "bg-indigo-500/[0.14] text-white"
                    : "bg-indigo-50 text-indigo-700"
                  : isDark
                    ? "text-white/40 hover:text-white/72 hover:bg-white/[0.05]"
                    : "text-black/45 hover:text-black/75 hover:bg-black/[0.045]"
              )}
            >
              {/* Active left accent bar */}
              {active && (
                <span
                  className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-indigo-500"
                />
              )}
              <Icon
                size={15}
                className={clsx(
                  "shrink-0 transition-colors",
                  active ? "text-indigo-400" : "text-current opacity-75"
                )}
              />
              <span className="flex-1 truncate">{label}</span>
              {isNotifications && unread > 0 && (
                <span className="text-[10px] font-semibold bg-indigo-500/25 text-indigo-300 rounded-full px-1.5 py-px min-w-[18px] text-center leading-none">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div
        className="px-2.5 pb-4 space-y-px pt-2 border-t"
        style={{ borderColor: "var(--app-border)" }}
      >
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className={clsx(
            "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all",
            isDark
              ? "text-white/30 hover:text-white/60 hover:bg-white/[0.05]"
              : "text-black/40 hover:text-black/65 hover:bg-black/[0.045]"
          )}
        >
          {isDark
            ? <Sun size={15} className="shrink-0 opacity-75" />
            : <Moon size={15} className="shrink-0 opacity-75" />}
          {isDark ? "Светлая тема" : "Тёмная тема"}
        </button>

        <Link
          href="/profile"
          className={clsx(
            "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all",
            pathname === "/profile"
              ? isDark ? "bg-indigo-500/[0.14] text-white" : "bg-indigo-50 text-indigo-700"
              : isDark ? "text-white/30 hover:text-white/60 hover:bg-white/[0.05]" : "text-black/40 hover:text-black/65 hover:bg-black/[0.045]"
          )}
        >
          <Settings size={15} className="shrink-0 opacity-75" />
          Профиль
        </Link>

        <a
          href="/logout"
          className={clsx(
            "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all",
            isDark
              ? "text-white/30 hover:text-red-400/60 hover:bg-red-500/[0.07]"
              : "text-black/35 hover:text-red-600/70 hover:bg-red-50"
          )}
        >
          <LogOut size={15} className="shrink-0 opacity-75" />
          Выйти
        </a>
      </div>
    </aside>
  );
}

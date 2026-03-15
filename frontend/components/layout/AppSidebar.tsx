"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Bell,
  Target,
  Sun,
  Moon,
  LogOut,
  PieChart,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

// Primary nav — with icons
const PRIMARY_NAV = [
  { href: "/dashboard",   label: "Дашборд",       icon: LayoutDashboard },
  { href: "/plan",        label: "План",           icon: ClipboardList },
  { href: "/legacy/budget", label: "Бюджет",       icon: PieChart },
  { href: "/strategy",    label: "Стратегия",      icon: Target },
  { href: "/efficiency",  label: "Эффективность",  icon: BarChart3 },
  { href: "/notifications", label: "Уведомления",  icon: Bell, badge: true },
];

// Grouped nav — text only, denser
const SECTIONS = [
  {
    label: "ФИНАНСЫ",
    items: [
      { href: "/money",                       label: "Деньги" },
      { href: "/legacy/transactions",         label: "Операции" },
      { href: "/legacy/categories",           label: "Категории" },
      { href: "/legacy/goals",                label: "Цели" },
      { href: "/subscriptions",               label: "Подписки" },
      { href: "/legacy/planned-operations",   label: "Плановые операции" },
    ],
  },
  {
    label: "ДЕЛА",
    items: [
      { href: "/tasks",                       label: "Задачи" },
      { href: "/projects",                    label: "Проекты" },
      { href: "/habits",                      label: "Привычки" },
      { href: "/events",                      label: "События" },
      { href: "/legacy/piggybanks",           label: "Копилки" },
      { href: "/legacy/task-categories",      label: "Категории дел" },
      { href: "/legacy/task-templates",       label: "Шаблоны задач" },
      { href: "/legacy/postpone-reasons",     label: "Причины переноса" },
      { href: "/knowledge",                   label: "База знаний" },
    ],
  },
  {
    label: "СИСТЕМА",
    items: [
      { href: "/legacy/contacts",             label: "Контакты" },
      { href: "/profile",                     label: "Профиль" },
    ],
  },
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
    if (href.startsWith("/legacy/")) return pathname === href;
    return pathname.startsWith(href);
  }

  const linkBase = clsx(
    "flex items-center gap-2 px-3 py-1.5 rounded-md text-[12.5px] transition-all duration-100 leading-snug"
  );

  const activeStyle = isDark
    ? "bg-indigo-500/[0.13] text-white font-medium"
    : "bg-indigo-50 text-indigo-700 font-medium";

  const inactiveStyle = isDark
    ? "text-white/38 hover:text-white/70 hover:bg-white/[0.05] font-normal"
    : "text-black/45 hover:text-black/72 hover:bg-black/[0.04] font-normal";

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
      <div className="flex items-center gap-2.5 px-4 py-4 mb-0.5 shrink-0">
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

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-px pb-2">

        {/* Primary nav (with icons) */}
        {PRIMARY_NAV.map(({ href, label, icon: Icon, badge: hasBadge }) => {
          const active = isActive(href);
          const unread = hasBadge ? (badge?.unread_count ?? 0) : 0;
          return (
            <Link
              key={href}
              href={href}
              className={clsx(linkBase, active ? activeStyle : inactiveStyle, "relative")}
            >
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r-full bg-indigo-500" />
              )}
              {Icon && (
                <Icon
                  size={14}
                  className={clsx("shrink-0", active ? "text-indigo-400" : "opacity-60")}
                />
              )}
              <span className="flex-1 truncate">{label}</span>
              {unread > 0 && (
                <span className="text-[10px] font-semibold bg-indigo-500/20 text-indigo-400 rounded-full px-1.5 leading-[1.6]">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );
        })}

        {/* Grouped sections */}
        {SECTIONS.map((section) => (
          <div key={section.label} className="pt-3">
            <p
              className="px-3 mb-1 text-[10px] font-semibold tracking-widest"
              style={{ color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.28)" }}
            >
              {section.label}
            </p>
            {section.items.map(({ href, label }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={clsx(linkBase, "relative pl-4", active ? activeStyle : inactiveStyle)}
                >
                  {active && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r-full bg-indigo-500" />
                  )}
                  <span className="truncate">{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div
        className="px-2 pb-3 pt-2 space-y-px border-t shrink-0"
        style={{ borderColor: "var(--app-border)" }}
      >
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className={clsx(linkBase, inactiveStyle, "w-full")}
        >
          {isDark
            ? <Sun size={14} className="shrink-0 opacity-60" />
            : <Moon size={14} className="shrink-0 opacity-60" />}
          {isDark ? "Светлая тема" : "Тёмная тема"}
        </button>
        <a
          href="/logout"
          className={clsx(
            linkBase,
            isDark
              ? "text-white/25 hover:text-red-400/60 hover:bg-red-500/[0.07]"
              : "text-black/30 hover:text-red-600/60 hover:bg-red-50"
          )}
        >
          <LogOut size={14} className="shrink-0 opacity-60" />
          Выйти
        </a>
      </div>
    </aside>
  );
}

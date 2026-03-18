"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Target,
  Sun,
  Moon,
  LogOut,
  PieChart,
} from "lucide-react";
import { useTheme } from "next-themes";

// Primary nav — with icons
const PRIMARY_NAV = [
  { href: "/dashboard",   label: "Дашборд",       icon: LayoutDashboard },
  { href: "/plan",        label: "План",           icon: ClipboardList },
  { href: "/budget",        label: "Бюджет",        icon: PieChart },
  { href: "/strategy",    label: "Стратегия",      icon: Target },
  { href: "/efficiency",  label: "Эффективность",  icon: BarChart3 },
];

// Grouped nav — text only, denser
const SECTIONS = [
  {
    label: "ФИНАНСЫ",
    items: [
      { href: "/money",                     label: "Деньги" },
      { href: "/wallets",                   label: "Кошельки" },
      { href: "/goals",                     label: "Цели" },
      { href: "/planned-ops",               label: "Плановые операции" },
      { href: "/legacy/budget",             label: "Бюджет (расшир.)" },
      { href: "/categories",                label: "Статьи расходов/доходов" },
      { href: "/subscriptions",             label: "Подписки" },
    ],
  },
  {
    label: "ДЕЛА",
    items: [
      { href: "/tasks",                     label: "Задачи" },
      { href: "/recurring-tasks",           label: "Повторяющиеся" },
      { href: "/projects",                  label: "Проекты" },
      { href: "/habits",                    label: "Привычки" },
      { href: "/events",                    label: "События" },
      { href: "/work-categories",           label: "Категории дел" },
      { href: "/task-presets",              label: "Шаблоны задач" },
      { href: "/knowledge",                 label: "База знаний" },
    ],
  },
  {
    label: "СИСТЕМА",
    items: [
      { href: "/profile",                   label: "Профиль" },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

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
    ? "text-white/70 hover:text-white/90 hover:bg-white/[0.05] font-normal"
    : "text-black/60 hover:text-black/85 hover:bg-black/[0.04] font-normal";

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
        {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
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
            </Link>
          );
        })}

        {/* Grouped sections */}
        {SECTIONS.map((section) => (
          <div key={section.label} className="pt-3">
            <p
              className="px-3 mb-1 text-[10px] font-semibold tracking-widest"
              style={{ color: isDark ? "rgba(255,255,255,0.52)" : "rgba(0,0,0,0.42)" }}
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
              ? "text-white/72 hover:text-red-400/70 hover:bg-red-500/[0.07]"
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  PieChart,
  BarChart3,
  Settings,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import { useTheme } from "next-themes";

const NAV_ITEMS = [
  { href: "/dashboard",  label: "Дашборд",    icon: LayoutDashboard },
  { href: "/plan",       label: "План",        icon: ClipboardList },
  { href: "/money",      label: "Деньги",      icon: Wallet },
  { href: "/budget",     label: "Бюджет",      icon: PieChart },
  { href: "/analytics",  label: "Аналитика",   icon: BarChart3 },
  { href: "/settings",   label: "Настройки",   icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    if (href === "/money") {
      return pathname.startsWith("/money") || pathname.startsWith("/wallets")
        || pathname.startsWith("/subscriptions") || pathname.startsWith("/categories");
    }
    if (href === "/budget") {
      return pathname.startsWith("/budget") || pathname.startsWith("/planned-ops");
    }
    if (href === "/analytics") {
      return pathname.startsWith("/analytics") || pathname.startsWith("/efficiency")
        || pathname.startsWith("/strategy") || pathname.startsWith("/goals");
    }
    if (href === "/settings") {
      return pathname.startsWith("/settings") || pathname.startsWith("/profile")
        || pathname.startsWith("/notifications");
    }
    return pathname.startsWith(href);
  }

  const linkBase = clsx(
    "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-100 leading-snug"
  );

  const activeStyle = isDark
    ? "bg-indigo-500/[0.12] text-white font-medium"
    : "bg-indigo-50 text-indigo-700 font-medium";

  const inactiveStyle = isDark
    ? "text-white/60 hover:text-white/90 hover:bg-white/[0.05] font-normal"
    : "text-black/50 hover:text-black/80 hover:bg-black/[0.04] font-normal";

  return (
    <aside
      className="flex flex-col h-full w-[200px] select-none shrink-0 border-r"
      style={{
        background: "var(--app-sidebar-bg)",
        borderColor: "var(--app-border)",
        boxShadow: isDark ? "1px 0 20px rgba(0,0,0,0.3)" : "1px 0 0 rgba(0,0,0,0.06)",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 mb-1 shrink-0">
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

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2.5 space-y-0.5 pb-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
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
              <Icon
                size={16}
                strokeWidth={active ? 2 : 1.7}
                className={clsx("shrink-0", active ? "text-indigo-400" : "opacity-50")}
              />
              <span className="flex-1 truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div
        className="px-2.5 pb-3 pt-2 space-y-0.5 border-t shrink-0"
        style={{ borderColor: "var(--app-border)" }}
      >
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className={clsx(linkBase, inactiveStyle, "w-full")}
        >
          {isDark
            ? <Sun size={15} className="shrink-0 opacity-50" />
            : <Moon size={15} className="shrink-0 opacity-50" />}
          {isDark ? "Светлая тема" : "Тёмная тема"}
        </button>
        <a
          href="/logout"
          className={clsx(
            linkBase,
            isDark
              ? "text-white/50 hover:text-red-400/70 hover:bg-red-500/[0.07]"
              : "text-black/30 hover:text-red-600/60 hover:bg-red-50"
          )}
        >
          <LogOut size={15} className="shrink-0 opacity-50" />
          Выйти
        </a>
      </div>
    </aside>
  );
}

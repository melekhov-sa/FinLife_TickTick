"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  PieChart,
  FolderKanban,
  Heart,
} from "lucide-react";
import { useTheme } from "next-themes";

const NAV_ITEMS = [
  { href: "/dashboard",  label: "Дашборд",    icon: LayoutDashboard },
  { href: "/plan",       label: "План",        icon: ClipboardList },
  { href: "/money",      label: "Деньги",      icon: Wallet },
  { href: "/budget",     label: "Бюджет",      icon: PieChart },
  { href: "/projects",   label: "Проекты",     icon: FolderKanban },
  { href: "/habits",     label: "Привычки",    icon: Heart },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
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
    return pathname.startsWith(href);
  }

  return (
    <aside
      className="flex flex-col h-full w-[200px] select-none shrink-0 border-r"
      style={{
        background: isDark ? "#0a0f1e" : "#F8F9FB",
        borderColor: isDark ? "rgba(255,255,255,0.06)" : "#E2E8F0",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 mb-2 shrink-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
        >
          <span className="text-white text-xs font-bold tracking-tight">FL</span>
        </div>
        <span
          className="font-semibold text-sm"
          style={{
            color: isDark ? "rgba(255,255,255,0.9)" : "#1E293B",
            letterSpacing: "-0.02em",
          }}
        >
          FinLife
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-100 leading-snug relative",
                active
                  ? isDark
                    ? "bg-indigo-500/[0.18] text-white font-semibold"
                    : "bg-indigo-100/70 text-indigo-700 font-semibold"
                  : isDark
                    ? "text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] font-normal"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 font-normal"
              )}
            >
              {active && (
                <span className={clsx(
                  "absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full",
                  isDark ? "bg-indigo-400" : "bg-indigo-600"
                )} />
              )}
              <Icon
                size={17}
                strokeWidth={active ? 2.2 : 1.8}
                className={clsx(
                  "shrink-0 transition-colors",
                  active
                    ? isDark ? "text-indigo-300" : "text-indigo-600"
                    : isDark ? "text-slate-400" : "text-slate-500"
                )}
              />
              <span className="flex-1 truncate">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 pb-3" />
    </aside>
  );
}

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
} from "lucide-react";
import { useTheme } from "next-themes";

const TABS = [
  { href: "/dashboard", label: "Главная",    icon: LayoutDashboard },
  { href: "/plan",      label: "План",       icon: ClipboardList },
  { href: "/money",     label: "Деньги",     icon: Wallet },
  { href: "/budget",    label: "Бюджет",     icon: PieChart },
  { href: "/analytics", label: "Аналитика",  icon: BarChart3 },
];

export function MobileNav() {
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
    if (href === "/analytics") {
      return pathname.startsWith("/analytics") || pathname.startsWith("/efficiency")
        || pathname.startsWith("/strategy") || pathname.startsWith("/goals");
    }
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex items-stretch"
      style={{
        background: isDark ? "rgba(10,13,28,0.95)" : "rgba(255,255,255,0.95)",
        borderTop: `0.5px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-3 min-h-[52px] transition-colors active:opacity-70 touch-manipulation"
          >
            <Icon
              size={22}
              strokeWidth={active ? 2.2 : 1.7}
              className={clsx(
                "transition-colors",
                active
                  ? "text-indigo-500"
                  : isDark ? "text-white/60" : "text-black/50"
              )}
            />
            <span
              className={clsx(
                "text-[10px] font-medium",
                active
                  ? "text-indigo-500"
                  : isDark ? "text-white/50" : "text-black/40"
              )}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

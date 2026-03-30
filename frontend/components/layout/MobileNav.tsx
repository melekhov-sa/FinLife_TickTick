"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  PieChart,
  UserCircle,
} from "lucide-react";
import { useTheme } from "next-themes";

const TABS = [
  { href: "/dashboard", label: "Главная",    icon: LayoutDashboard },
  { href: "/plan",      label: "План",       icon: ClipboardList },
  { href: "/money",     label: "Деньги",     icon: Wallet },
  { href: "/budget",    label: "Бюджет",     icon: PieChart },
  { href: "/settings",  label: "Профиль",    icon: UserCircle },
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
    if (href === "/settings") {
      return pathname.startsWith("/settings") || pathname.startsWith("/profile")
        || pathname.startsWith("/notifications");
    }
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex items-end"
      style={{
        background: isDark ? "rgba(10,13,28,0.92)" : "rgba(255,255,255,0.92)",
        borderTop: `0.5px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center gap-0 py-2 transition-colors"
          >
            <Icon
              size={20}
              strokeWidth={active ? 2.2 : 1.8}
              className={clsx(
                "transition-colors",
                active
                  ? "text-indigo-500"
                  : isDark ? "text-white/40" : "text-black/30"
              )}
            />
            <span
              className={clsx(
                "text-[9px] font-medium mt-0.5",
                active
                  ? "text-indigo-500"
                  : isDark ? "text-white/40" : "text-black/30"
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

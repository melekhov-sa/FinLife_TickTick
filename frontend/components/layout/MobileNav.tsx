"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  ClipboardList,
  CheckSquare,
  Wallet,
  Menu,
} from "lucide-react";
import { useState } from "react";
import { useTheme } from "next-themes";

const TABS = [
  { href: "/dashboard", label: "Главная",  icon: LayoutDashboard },
  { href: "/plan",      label: "План",     icon: ClipboardList },
  { href: "/tasks",     label: "Задачи",   icon: CheckSquare },
  { href: "/money",     label: "Финансы",  icon: Wallet },
];

const MORE_ITEMS = [
  { href: "/projects",       label: "Проекты" },
  { href: "/habits",         label: "Привычки" },
  { href: "/events",         label: "События" },
  { href: "/subscriptions",  label: "Подписки" },
  { href: "/efficiency",     label: "Эффективность" },
  { href: "/strategy",       label: "Стратегия" },
  { href: "/notifications",  label: "Уведомления" },
  { href: "/knowledge",      label: "База знаний" },
  { href: "/budget",         label: "Бюджет" },
  { href: "/legacy/budget",  label: "Бюджет (расшир.)" },
  { href: "/legacy/planned-ops", label: "Плановые" },
  { href: "/legacy/tasks?mode=recurring", label: "Повторяющиеся" },
  { href: "/legacy/transactions", label: "Операции" },
  { href: "/profile",        label: "Профиль" },
];

export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <>
      {/* Overlay */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* More sheet */}
      {moreOpen && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t p-4 pb-[calc(64px+env(safe-area-inset-bottom))]"
          style={{
            background: isDark ? "#0f1221" : "#ffffff",
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
          }}
        >
          <div className="w-8 h-0.5 rounded-full mx-auto mb-3"
            style={{ background: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)" }}
          />
          <div className="grid grid-cols-3 gap-0.5">
            {MORE_ITEMS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                className={clsx(
                  "flex items-center justify-center py-2.5 px-2 rounded-xl text-[12px] font-medium text-center transition-colors",
                  isActive(href)
                    ? isDark ? "bg-indigo-500/15 text-indigo-400" : "bg-indigo-50 text-indigo-600"
                    : isDark ? "text-white/55 hover:bg-white/[0.05]" : "text-black/50 hover:bg-black/[0.04]"
                )}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Bottom tab bar */}
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

        {/* More tab */}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className="flex-1 flex flex-col items-center gap-0 py-2 transition-colors"
        >
          <Menu
            size={20}
            strokeWidth={moreOpen ? 2.2 : 1.8}
            className={clsx(
              "transition-colors",
              moreOpen
                ? "text-indigo-500"
                : isDark ? "text-white/40" : "text-black/30"
            )}
          />
          <span
            className={clsx(
              "text-[9px] font-medium mt-0.5",
              moreOpen
                ? "text-indigo-500"
                : isDark ? "text-white/40" : "text-black/30"
            )}
          >
            Ещё
          </span>
        </button>
      </nav>
    </>
  );
}

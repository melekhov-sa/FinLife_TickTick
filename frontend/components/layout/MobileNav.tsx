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
          className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t p-5 pb-[calc(80px+env(safe-area-inset-bottom))]"
          style={{
            background: isDark ? "#0f1221" : "#ffffff",
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)",
          }}
        >
          <div className="w-10 h-1 rounded-full mx-auto mb-4"
            style={{ background: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)" }}
          />
          <div className="grid grid-cols-3 gap-1">
            {MORE_ITEMS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMoreOpen(false)}
                className={clsx(
                  "flex items-center justify-center py-3 px-2 rounded-xl text-[13px] font-medium text-center transition-colors",
                  isActive(href)
                    ? isDark ? "bg-indigo-500/15 text-indigo-400" : "bg-indigo-50 text-indigo-600"
                    : isDark ? "text-white/60 hover:bg-white/[0.05]" : "text-black/55 hover:bg-black/[0.04]"
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
        className="fixed bottom-0 left-0 right-0 z-30 flex items-end border-t"
        style={{
          background: isDark ? "rgba(10,13,28,0.96)" : "rgba(255,255,255,0.96)",
          borderColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors"
            >
              <Icon
                size={22}
                className={clsx(
                  "transition-colors",
                  active
                    ? "text-indigo-500"
                    : isDark ? "text-white/65" : "text-black/35"
                )}
              />
              <span
                className={clsx(
                  "text-[10px] font-medium",
                  active
                    ? "text-indigo-500"
                    : isDark ? "text-white/65" : "text-black/35"
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
          className="flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors"
        >
          <Menu
            size={22}
            className={clsx(
              "transition-colors",
              moreOpen
                ? "text-indigo-500"
                : isDark ? "text-white/65" : "text-black/35"
            )}
          />
          <span
            className={clsx(
              "text-[10px] font-medium",
              moreOpen
                ? "text-indigo-500"
                : isDark ? "text-white/65" : "text-black/35"
            )}
          >
            Ещё
          </span>
        </button>
      </nav>
    </>
  );
}

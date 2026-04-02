"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  Plus,
  MoreHorizontal,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useKeyboardVisible } from "@/lib/useKeyboardVisible";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { CreateOperationModal } from "@/components/modals/CreateOperationModal";

const LEFT_TABS = [
  { href: "/dashboard", label: "Главная", icon: LayoutDashboard },
  { href: "/plan",      label: "План",    icon: ClipboardList },
];

const RIGHT_TABS = [
  { href: "/money",  label: "Деньги", icon: Wallet },
  { href: "/more",   label: "Ещё",    icon: MoreHorizontal },
];

const MORE_ITEMS = [
  { href: "/budget",      label: "Бюджет" },
  { href: "/analytics",   label: "Аналитика" },
  { href: "/projects",    label: "Проекты" },
  { href: "/habits",      label: "Привычки" },
  { href: "/events",      label: "События" },
  { href: "/subscriptions", label: "Подписки" },
  { href: "/settings",    label: "Настройки" },
  { href: "/profile",     label: "Профиль" },
];

export function MobileNav() {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const keyboardVisible = useKeyboardVisible();

  const [showPlus, setShowPlus] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showOpModal, setShowOpModal] = useState(false);

  // Modals must render OUTSIDE the early return — otherwise they get
  // unmounted when keyboard opens (focusin on input → keyboardVisible → return null)
  const modals = (
    <>
      {showTaskModal && <CreateTaskModal onClose={() => setShowTaskModal(false)} />}
      {showOpModal && <CreateOperationModal onClose={() => setShowOpModal(false)} />}
    </>
  );

  if (keyboardVisible) return modals;

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
    if (href === "/money") {
      return pathname.startsWith("/money") || pathname.startsWith("/wallets")
        || pathname.startsWith("/subscriptions") || pathname.startsWith("/categories");
    }
    if (href === "/more") {
      return ["/budget", "/analytics", "/efficiency", "/strategy", "/goals",
              "/projects", "/habits", "/events", "/settings", "/profile",
              "/notifications", "/work-categories", "/task-presets"].some(p => pathname.startsWith(p));
    }
    return pathname.startsWith(href);
  }

  const tabCls = "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:opacity-70 touch-manipulation min-h-[48px]";

  function TabLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof LayoutDashboard }) {
    const active = isActive(href);

    if (href === "/more") {
      return (
        <button
          onClick={() => { setShowMore(v => !v); setShowPlus(false); }}
          className={tabCls}
          aria-label={label}
        >
          <Icon size={22} strokeWidth={active ? 2.2 : 1.7} className={clsx("transition-colors", active ? "text-indigo-600" : isDark ? "text-slate-400" : "text-slate-400")} />
          <span className={clsx("text-[10px] font-medium", active ? "text-indigo-600" : isDark ? "text-slate-500" : "text-slate-400")}>{label}</span>
        </button>
      );
    }

    return (
      <Link href={href} aria-label={label} className={tabCls} onClick={() => { setShowMore(false); setShowPlus(false); }}>
        <Icon size={22} strokeWidth={active ? 2.2 : 1.7} className={clsx("transition-colors", active ? "text-indigo-600" : isDark ? "text-slate-400" : "text-slate-400")} />
        <span className={clsx("text-[10px] font-medium", active ? "text-indigo-600" : isDark ? "text-slate-500" : "text-slate-400")}>{label}</span>
      </Link>
    );
  }

  return (
    <>
      {modals}

      {/* Plus menu */}
      {showPlus && <>
        <div className="fixed inset-0 z-40 bg-black/30 touch-manipulation" onClick={() => setShowPlus(false)} />
        <div className="fixed z-50 left-1/2 -translate-x-1/2 flex flex-col gap-3 items-center" style={{ bottom: `calc(80px + env(safe-area-inset-bottom, 0px))` }}>
          <button
            className="w-48 py-4 rounded-2xl text-[16px] font-semibold shadow-xl touch-manipulation bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 active:scale-95 transition-transform"
            onClick={() => { setShowPlus(false); setShowTaskModal(true); }}
          >
            Задача
          </button>
          <button
            className="w-48 py-4 rounded-2xl text-[16px] font-semibold shadow-xl touch-manipulation bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 active:scale-95 transition-transform"
            onClick={() => { setShowPlus(false); setShowOpModal(true); }}
          >
            Операция
          </button>
        </div>
      </>}

      {/* More menu */}
      {showMore && <>
        <div className="fixed inset-0 z-40 touch-manipulation" onClick={() => setShowMore(false)} />
        <div className="fixed z-50 right-3 rounded-2xl border shadow-xl overflow-hidden bg-white dark:bg-[#161d2b] border-slate-200 dark:border-white/[0.08]" style={{ bottom: `calc(80px + env(safe-area-inset-bottom, 0px))`, minWidth: 200 }}>
          {MORE_ITEMS.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setShowMore(false)}
              className={clsx(
                "block px-4 py-3 text-[14px] font-medium border-b last:border-0 transition-colors touch-manipulation",
                "border-slate-100 dark:border-white/[0.04]",
                pathname.startsWith(item.href)
                  ? "text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </>}

      {/* Bottom nav bar */}
      <nav
        id="mobile-nav"
        className="fixed left-0 right-0 z-30"
        style={{
          bottom: 0,
          background: isDark ? "rgba(10,13,28,0.97)" : "rgba(255,255,255,0.98)",
          borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#E2E8F0"}`,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div className="flex items-end h-[56px] relative">
          {LEFT_TABS.map(t => <TabLink key={t.href} {...t} />)}

          <div className="flex-1 flex items-end justify-center pb-1">
            <button
              onClick={() => { setShowPlus(v => !v); setShowMore(false); }}
              className={clsx(
                "w-[52px] h-[52px] rounded-full flex items-center justify-center shadow-lg -translate-y-2 transition-all touch-manipulation",
                showPlus
                  ? "bg-slate-700 dark:bg-slate-300 rotate-45"
                  : "bg-indigo-600 dark:bg-indigo-500"
              )}
              style={{ boxShadow: "0 4px 14px rgba(99,102,241,0.35)" }}
              aria-label="Добавить"
            >
              <Plus size={26} strokeWidth={2.5} className={showPlus ? "text-white dark:text-slate-800" : "text-white"} />
            </button>
          </div>

          {RIGHT_TABS.map(t => <TabLink key={t.href} {...t} />)}
        </div>
      </nav>
    </>
  );
}

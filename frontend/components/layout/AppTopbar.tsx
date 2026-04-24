"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { User, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMe } from "@/hooks/useMe";
import { NotificationBell } from "@/components/layout/NotificationBell";

interface AppTopbarProps {
  /** Заголовок раздела (белым). Если не передан — ничего не рендерим. */
  title?: string;
  /** Мелкая белая подпись справа от заголовка, 50% opacity */
  subtitle?: string;
  /** Доп. действия между actions и иконками (колокольчик/аватар) */
  actions?: ReactNode;
}

export function AppTopbar({ title, subtitle, actions }: AppTopbarProps) {
  const { data: me } = useMe();
  const email = me?.email ?? "";
  const initial = email[0]?.toUpperCase() ?? "?";

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) =>
      e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header
      className="relative shrink-0 flex items-center justify-between px-4 sm:px-6"
      style={{
        background: "var(--app-topbar-bg)",
        boxShadow: "var(--shadow-topbar)",
        height: 56,
        paddingTop: "env(safe-area-inset-top, 0px)",
        zIndex: 30,
      }}
    >
      {/* Декоративный блик */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(600px 120px at 20% 0%, rgba(255,255,255,.14), transparent 70%)",
        }}
      />

      {/* Заголовок + подпись */}
      <div className="flex items-baseline gap-3 min-w-0 relative">
        {title && (
          <h1
            className="text-[15px] sm:text-[16px] font-semibold truncate"
            style={{
              color: "var(--app-topbar-text)",
              letterSpacing: "-0.015em",
            }}
          >
            {title}
          </h1>
        )}
        {subtitle && (
          <span
            className="hidden sm:inline text-[12px] truncate"
            style={{ color: "rgba(255,255,255,.6)" }}
          >
            {subtitle}
          </span>
        )}
      </div>

      {/* Правая часть */}
      <div className="flex items-center gap-1.5 sm:gap-2 relative">
        {actions}

        {/* Существующий компонент уведомлений */}
        <NotificationBell />

        {/* Аватар + dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="Профиль"
            onClick={() => setMenuOpen((v) => !v)}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-[1.04]"
            style={{
              background: "#FFFFFF",
              boxShadow:
                "0 1px 2px rgba(16,24,40,.1), 0 4px 12px -4px rgba(16,24,40,.2)",
            }}
          >
            <span
              className="text-[13px] font-bold"
              style={{ color: "#6366F1" }}
            >
              {initial}
            </span>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-2 w-56 rounded-xl overflow-hidden border"
              style={{
                background: "var(--app-card-bg)",
                borderColor: "var(--app-border)",
                boxShadow:
                  "0 1px 2px rgba(16,24,40,.04), 0 16px 40px -8px rgba(16,24,40,.2)",
                zIndex: 50,
              }}
            >
              {email && (
                <div
                  className="px-4 py-3 border-b"
                  style={{ borderColor: "var(--app-border)" }}
                >
                  <p
                    className="text-[11px] truncate"
                    style={{ color: "var(--t-muted)" }}
                  >
                    {email}
                  </p>
                </div>
              )}

              <div className="py-1">
                <MenuLink
                  href="/profile"
                  icon={<User size={15} strokeWidth={1.8} />}
                  onNavigate={() => setMenuOpen(false)}
                >
                  Мой профиль
                </MenuLink>
                <MenuLink
                  href="/settings"
                  icon={<Settings size={15} strokeWidth={1.8} />}
                  onNavigate={() => setMenuOpen(false)}
                >
                  Настройки
                </MenuLink>
              </div>

              <div
                className="py-1 border-t"
                style={{ borderColor: "var(--app-border)" }}
              >
                <Link
                  href="/logout"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium text-left transition-colors",
                    "hover:bg-rose-50 dark:hover:bg-rose-500/10"
                  )}
                  style={{ color: "#DC2626" }}
                >
                  <LogOut size={15} strokeWidth={1.8} />
                  <span>Выйти</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuLink({
  href,
  icon,
  children,
  onNavigate,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onNavigate}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium nav-hover text-left transition-colors"
      style={{ color: "var(--t-secondary)" }}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}

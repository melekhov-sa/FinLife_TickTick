"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { User, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMe } from "@/hooks/useMe";
import { usePageTitleMeta } from "@/contexts/PageTitle";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { SearchBar } from "@/components/layout/SearchBar";
import { Avatar } from "@/components/primitives/Avatar";
import { Popover } from "@/components/primitives/Popover";

export function AppTopbar() {
  const { data: me } = useMe();
  const email = me?.email ?? "";
  const vacation = !!me?.vacation;
  const pageMeta = usePageTitleMeta();

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header
      className="relative shrink-0 flex items-center justify-between px-4 sm:px-6"
      style={{
        background: vacation
          ? "linear-gradient(120deg, #06b6d4 0%, #0ea5e9 45%, #f59e0b 100%)"
          : "var(--app-topbar-bg)",
        boxShadow: "var(--shadow-topbar)",
        minHeight: "calc(56px + env(safe-area-inset-top, 0px))",
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

      {/* Левая часть: title на десктопе, лого на мобиле (если нет title) */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Десктоп: title + eyebrow из PageTitleContext */}
        {pageMeta?.title && (
          <div className="hidden md:flex flex-col justify-center min-w-0">
            {pageMeta.eyebrow && (
              <span className="text-[10px] font-medium leading-none mb-0.5 truncate" style={{ color: "var(--app-topbar-text)", opacity: 0.72 }}>
                {pageMeta.eyebrow}
              </span>
            )}
            <span className="font-display text-[15px] font-semibold leading-tight truncate" style={{ color: "var(--app-topbar-text)" }}>
              {pageMeta.title}
            </span>
          </div>
        )}

        {/* Мобиле: title вместо лого если есть, иначе лого FL */}
        {pageMeta?.title ? (
          <div className="md:hidden flex flex-col justify-center min-w-0">
            {pageMeta.eyebrow && (
              <span className="text-[10px] font-medium leading-none mb-0.5 truncate" style={{ color: "var(--app-topbar-text)", opacity: 0.72 }}>
                {pageMeta.eyebrow}
              </span>
            )}
            <span className="font-display text-[15px] font-semibold leading-tight truncate" style={{ color: "var(--app-topbar-text)" }}>
              {pageMeta.title}
            </span>
          </div>
        ) : (
          <div className="md:hidden flex items-center gap-2">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: "var(--app-accent-gradient)" }}
            >
              <span className="text-[#fff] text-[10px] font-bold tracking-tight">FL</span>
            </span>
          </div>
        )}

        {vacation && (
          <span
            className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
            style={{ background: "rgba(255,255,255,0.22)", color: "#fff" }}
            title="Вы в отпуске"
          >
            🏖 Отпуск
          </span>
        )}
      </div>

      {/* Правая часть */}
      <div className="flex items-center gap-1.5 sm:gap-2 relative ml-auto">
        <SearchBar />

        {/* Существующий компонент уведомлений */}
        <NotificationBell />

        {/* Аватар + dropdown */}
        <Popover
          open={menuOpen}
          onOpenChange={setMenuOpen}
          side="bottom"
          align="end"
          className="!p-0 mt-2 w-56 overflow-hidden"
          trigger={
            <button
              type="button"
              aria-label="Профиль"
              className="rounded-full transition-transform hover:scale-[1.04]"
              style={{
                boxShadow:
                  "0 1px 2px rgba(16,24,40,.1), 0 4px 12px -4px rgba(16,24,40,.2)",
              }}
            >
              <Avatar
                name={email}
                size="md"
                className="!bg-white !text-[var(--app-accent)] font-bold"
              />
            </button>
          }
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
        </Popover>
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

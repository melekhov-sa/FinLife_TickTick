"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useMe } from "@/hooks/useMe";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { User, Settings, LogOut, Sun, Moon } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";

interface AppTopbarProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function AppTopbar({ title, subtitle, actions }: AppTopbarProps) {
  const { data: me } = useMe();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [menuOpen, setMenuOpen] = useState(false);

  const textPrimary = isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.8)";
  const textMuted = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)";

  const initial = me?.email?.[0]?.toUpperCase() ?? "?";
  const email = me?.email ?? "";
  const name = email.split("@")[0];

  return (
    <header
      className="h-11 md:h-14 flex items-center justify-between px-4 md:px-6 shrink-0 border-b"
      style={{
        background: "var(--app-topbar-bg)",
        borderColor: "var(--app-border)",
        boxShadow: isDark ? "0 1px 12px rgba(0,0,0,0.2)" : "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {(title || subtitle) && (
        <div className="flex items-baseline gap-2 md:gap-3 min-w-0">
          {title && (
            <h1 className="text-[13px] md:text-sm font-semibold truncate" style={{ color: textPrimary, letterSpacing: "-0.01em" }}>
              {title}
            </h1>
          )}
          {subtitle && (
            <span className="text-[11px] md:text-xs shrink-0" style={{ color: textMuted }}>
              {subtitle}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-1.5 md:gap-2 ml-auto shrink-0">
        {actions && <div className="flex items-center gap-1.5 md:gap-2">{actions}</div>}
        <NotificationBell />

        {/* Avatar + Dropdown */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-indigo-500/20 flex items-center justify-center hover:bg-indigo-500/30 transition-colors"
          >
            <span className="text-indigo-400 text-[11px] md:text-xs font-semibold">
              {initial}
            </span>
          </button>

          {menuOpen && (
            <>
            {/* Invisible overlay to close menu on outside tap */}
            <div className="fixed inset-0 z-[60]" onClick={() => setMenuOpen(false)} />
            <div
              className="absolute right-0 top-full mt-2 w-56 rounded-xl border shadow-2xl z-[70] overflow-hidden"
              style={{
                background: isDark ? "#0f1221" : "#ffffff",
                borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
              }}
            >
              {/* User info */}
              <div className="px-4 py-3 border-b" style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
                <p className="text-[13px] font-semibold truncate" style={{ color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)" }}>
                  {name}
                </p>
                <p className="text-[11px] truncate mt-0.5" style={{ color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" }}>
                  {email}
                </p>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <Link
                  href="/profile"
                  onClick={() => setMenuOpen(false)}
                  className={clsx(
                    "flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors",
                    isDark ? "text-white/70 hover:bg-white/[0.05] hover:text-white/90" : "text-black/60 hover:bg-black/[0.04] hover:text-black/85"
                  )}
                >
                  <User size={14} className="opacity-50" /> Мой профиль
                </Link>
                <Link
                  href="/settings"
                  onClick={() => setMenuOpen(false)}
                  className={clsx(
                    "flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors",
                    isDark ? "text-white/70 hover:bg-white/[0.05] hover:text-white/90" : "text-black/60 hover:bg-black/[0.04] hover:text-black/85"
                  )}
                >
                  <Settings size={14} className="opacity-50" /> Настройки
                </Link>
                <button
                  onClick={() => { setTheme(isDark ? "light" : "dark"); setMenuOpen(false); }}
                  className={clsx(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors",
                    isDark ? "text-white/70 hover:bg-white/[0.05] hover:text-white/90" : "text-black/60 hover:bg-black/[0.04] hover:text-black/85"
                  )}
                >
                  {isDark ? <Sun size={14} className="opacity-50" /> : <Moon size={14} className="opacity-50" />}
                  {isDark ? "Светлая тема" : "Тёмная тема"}
                </button>
              </div>

              {/* Logout */}
              <div className="border-t py-1" style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
                <a
                  href="/logout"
                  onClick={() => setMenuOpen(false)}
                  className={clsx(
                    "flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors",
                    isDark ? "text-white/50 hover:text-red-400 hover:bg-red-500/[0.07]" : "text-black/40 hover:text-red-600 hover:bg-red-50"
                  )}
                >
                  <LogOut size={14} className="opacity-50" /> Выйти
                </a>
              </div>
            </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

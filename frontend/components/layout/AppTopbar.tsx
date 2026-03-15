"use client";

import { Bell } from "lucide-react";
import { useTheme } from "next-themes";
import { useMe } from "@/hooks/useMe";

interface AppTopbarProps {
  title?: string;
  subtitle?: string;
}

export function AppTopbar({ title, subtitle }: AppTopbarProps) {
  const { data: me } = useMe();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const textPrimary = isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.8)";
  const textMuted   = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)";

  return (
    <header
      className="h-14 flex items-center justify-between px-6 shrink-0 border-b"
      style={{
        background: "var(--app-topbar-bg)",
        borderColor: "var(--app-border)",
        boxShadow: isDark ? "0 1px 12px rgba(0,0,0,0.2)" : "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      {(title || subtitle) && (
        <div className="flex items-baseline gap-3">
          {title && (
            <h1 className="text-sm font-semibold" style={{ color: textPrimary, letterSpacing: "-0.01em" }}>
              {title}
            </h1>
          )}
          {subtitle && (
            <span className="text-xs" style={{ color: textMuted }}>
              {subtitle}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-3 ml-auto">
        <button
          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
          style={{ color: textMuted }}
        >
          <Bell size={15} />
        </button>
        <div className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center">
          <span className="text-indigo-400 text-xs font-medium">
            {me?.email?.[0]?.toUpperCase() ?? "?"}
          </span>
        </div>
      </div>
    </header>
  );
}

"use client";

import { useTheme } from "next-themes";
import { useMe } from "@/hooks/useMe";
import { NotificationBell } from "@/components/layout/NotificationBell";

interface AppTopbarProps {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function AppTopbar({ title, subtitle, actions }: AppTopbarProps) {
  const { data: me } = useMe();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const textPrimary = isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.8)";
  const textMuted   = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)";

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
        <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-indigo-500/20 flex items-center justify-center">
          <span className="text-indigo-400 text-[10px] md:text-xs font-medium">
            {me?.email?.[0]?.toUpperCase() ?? "?"}
          </span>
        </div>
      </div>
    </header>
  );
}

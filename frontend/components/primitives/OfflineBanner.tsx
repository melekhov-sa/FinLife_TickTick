"use client";

import { Check, WifiOff } from "lucide-react";
import type { OnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * OfflineBanner
 *
 * Полоска под AppTopbar.
 *   • state="offline"   → янтарная: «Нет интернета — изменения не сохраняются» + кнопка «Повторить»
 *   • state="restored"  → зелёная:  «Соединение восстановлено» (через 1.5 сек уходит, см. useOnlineStatus)
 *   • state="hidden"    → не рендерится
 *
 * Сам state удобно брать из useOnlineStatus().
 */

export interface OfflineBannerProps {
  state: OnlineStatus;
  onRetry?: () => void;
}

export function OfflineBanner({ state, onRetry }: OfflineBannerProps) {
  if (state === "hidden") return null;
  const isOffline = state === "offline";

  return (
    <div
      role={isOffline ? "alert" : "status"}
      aria-live="polite"
      style={{
        height: 44,
        background: isOffline ? "var(--c-warning-bg)" : "var(--c-success-bg)",
        color: isOffline ? "var(--c-warning-fg)" : "var(--c-success-fg)",
        borderBottom: `1px solid ${
          isOffline ? "rgba(217,119,6,.2)" : "rgba(5,150,105,.2)"
        }`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        fontSize: 13,
        fontWeight: 500,
        padding: "0 16px",
        animation: "fl-banner-down .25s cubic-bezier(.22,.61,.36,1)",
      }}
    >
      {isOffline ? (
        <WifiOff size={15} strokeWidth={1.9} />
      ) : (
        <Check size={15} strokeWidth={2.2} />
      )}
      <span>
        {isOffline
          ? "Нет интернета — изменения не сохраняются"
          : "Соединение восстановлено"}
      </span>
      {isOffline && onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginLeft: 6,
            padding: "2px 10px",
            borderRadius: 6,
            border: "1px solid currentColor",
            background: "transparent",
            color: "currentColor",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Повторить
        </button>
      )}

      <style>{`
        @keyframes fl-banner-down {
          from { transform: translateY(-100%); opacity: 0 }
          to   { transform: translateY(0);     opacity: 1 }
        }
      `}</style>
    </div>
  );
}

export default OfflineBanner;

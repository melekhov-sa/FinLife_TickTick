"use client";

import { useEffect, useState } from "react";
import { isNative, onNetworkChange } from "@/lib/native";

/**
 * useOnlineStatus
 *
 * Возвращает состояние сетевого баннера: "offline" | "restored" | "hidden".
 *
 * Логика:
 *   • При маунте: если оффлайн — state="offline", иначе "hidden".
 *   • Событие 'offline'   → state="offline".
 *   • Событие 'online'    → state="restored" (зелёный «Соединение восстановлено»).
 *   • Через 1500 мс после "restored" → "hidden".
 */

export type OnlineStatus = "offline" | "restored" | "hidden";

const RESTORED_DURATION_MS = 1500;

export function useOnlineStatus(): OnlineStatus {
  const [status, setStatus] = useState<OnlineStatus>(() => {
    if (typeof navigator === "undefined") return "hidden";
    return navigator.onLine ? "hidden" : "offline";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Нативная оболочка: точный статус из Capacitor Network
    // (navigator.onLine в WKWebView ненадёжен)
    if (isNative()) {
      let dispose: (() => void) | undefined;
      let first = true;
      void onNetworkChange((connected) => {
        setStatus((prev) => {
          if (!connected) return "offline";
          const wasFirst = first;
          first = false;
          if (wasFirst) return prev; // стартовый «онлайн» — не показывать «восстановлено»
          return prev === "offline" ? "restored" : prev;
        });
        first = false;
      }).then((d) => { dispose = d; });
      return () => dispose?.();
    }

    const onOffline = () => setStatus("offline");
    const onOnline = () => setStatus("restored");

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  useEffect(() => {
    if (status !== "restored") return;
    const t = setTimeout(() => setStatus("hidden"), RESTORED_DURATION_MS);
    return () => clearTimeout(t);
  }, [status]);

  return status;
}

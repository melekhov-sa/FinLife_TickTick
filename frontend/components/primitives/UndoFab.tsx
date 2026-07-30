"use client";

/**
 * Большая круглая плавающая кнопка «Отменить» — как в TickTick.
 * Появляется после выполнения задачи на несколько секунд, крупная (легко попасть),
 * без текста. Тап — откат. Глобальная: showUndo(onUndo) из любого места.
 */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { clsx } from "clsx";
import { Undo2 } from "lucide-react";

interface UndoContextValue {
  /** Показать кнопку undo. onUndo вызывается по тапу; duration — мс до авто-скрытия. */
  showUndo: (onUndo: () => void, duration?: number) => void;
}

const UndoContext = createContext<UndoContextValue | null>(null);

export function useUndoFab(): UndoContextValue {
  const ctx = useContext(UndoContext);
  if (!ctx) throw new Error("useUndoFab must be used inside <UndoFabProvider>");
  return ctx;
}

export function UndoFabProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const onUndoRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setExiting(true);
    setTimeout(() => { setVisible(false); setExiting(false); onUndoRef.current = null; }, 160);
  }, []);

  const showUndo = useCallback((onUndo: () => void, duration = 8000) => {
    onUndoRef.current = onUndo;
    setExiting(false);
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => hide(), duration);
  }, [hide]);

  return (
    <UndoContext.Provider value={{ showUndo }}>
      {children}
      {visible && (
        <button
          type="button"
          aria-label="Отменить"
          title="Отменить"
          onClick={() => { const fn = onUndoRef.current; hide(); fn?.(); }}
          className={clsx(
            "fixed left-4 z-30 rounded-full flex items-center justify-center text-white",
            "shadow-[0_10px_28px_-8px_rgba(245,158,11,0.65)] active:scale-95 transition-all duration-150",
            "touch-manipulation motion-reduce:transition-none",
            exiting ? "opacity-0 scale-90" : "animate-pop",
          )}
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)",
            width: 52,
            height: 52,
            background: "#F59E0B",
          }}
        >
          <Undo2 size={24} strokeWidth={2.4} />
        </button>
      )}
    </UndoContext.Provider>
  );
}

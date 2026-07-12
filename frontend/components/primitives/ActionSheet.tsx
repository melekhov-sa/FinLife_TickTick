"use client";

import { createPortal } from "react-dom";
import { hapticTick } from "@/lib/native";

/**
 * ActionSheet — подтверждения в стиле iOS: стопка действий снизу,
 * деструктивное — красным, отдельная кнопка «Отмена».
 */

export interface ActionSheetAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

export function ActionSheet({
  open,
  onClose,
  title,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  /** Короткое пояснение сверху (например, название удаляемого объекта). */
  title?: string;
  actions: ActionSheetAction[];
}) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10001] flex items-end justify-center bg-black/50 animate-overlay-fade"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md px-3 animate-sheet-up"
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Группа действий */}
        <div
          className="rounded-2xl overflow-hidden mb-2"
          style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}
        >
          {title && (
            <p
              className="px-4 py-3 text-[12px] text-center border-b"
              style={{ color: "var(--t-muted)", borderColor: "var(--app-border-subtle)" }}
            >
              {title}
            </p>
          )}
          {actions.map((a, i) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                void hapticTick();
                onClose();
                a.onClick();
              }}
              className="w-full px-4 py-3.5 text-[16px] font-medium text-center transition-colors nav-hover"
              style={{
                color: a.destructive ? "#EF4444" : "var(--app-accent)",
                borderTop: i > 0 || title ? "1px solid var(--app-border-subtle)" : undefined,
              }}
            >
              {a.label}
            </button>
          ))}
        </div>

        {/* Отмена — отдельной кнопкой, как в iOS */}
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-2xl px-4 py-3.5 text-[16px] font-semibold text-center transition-transform active:scale-[0.99]"
          style={{
            background: "var(--app-card-bg)",
            border: "1px solid var(--app-border)",
            color: "var(--t-primary)",
          }}
        >
          Отмена
        </button>
      </div>
    </div>,
    document.body
  );
}

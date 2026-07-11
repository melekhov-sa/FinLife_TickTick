"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { hapticSuccess } from "@/lib/native";

interface Props {
  kind: "task" | "habit" | "task_occ";
  id: number;
  title: string;
  onClose: () => void;
  /** If provided, called after successful completion instead of invalidating queries directly.
   *  The parent is responsible for delayed invalidation and animation. */
  onCompleted?: (kind: "task" | "habit" | "task_occ", id: number) => void;
}

const KIND_LABELS: Record<string, string> = {
  task: "задачу",
  habit: "привычку",
  task_occ: "задачу",
};

async function completeItem(kind: Props["kind"], id: number) {
  if (kind === "task") return api.post(`/api/v2/tasks/${id}/complete`);
  if (kind === "habit") return api.post(`/api/v2/habits/occurrences/${id}/complete`);
  if (kind === "task_occ") return api.post(`/api/v2/task-occurrences/${id}/complete`);
}

export function ConfirmCompleteModal({ kind, id, title, onClose, onCompleted }: Props) {
  const qc = useQueryClient();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await completeItem(kind, id);
      // Haptic feedback: нативный (Capacitor) + web vibrate как fallback
      void hapticSuccess();
      try {
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate(10);
        }
      } catch { /* ignore — not supported on all platforms */ }

      if (onCompleted) {
        // Parent handles animation + delayed invalidation
        onCompleted(kind, id);
        onClose();
      } else {
        // Legacy path: immediate invalidation (used by habits and other callers)
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        qc.invalidateQueries({ queryKey: ["plan"] });
        onClose();
      }
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setLoading(false);
    }
  }

  if (typeof document === "undefined") return null;

  // Портал в body: fixed-оверлей не должен зависеть от transform/filter
  // у предков (см. баг с animate-rise на дашборде).
  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl shadow-2xl p-6 animate-pop"
        style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/[0.15] border border-emerald-500/20 flex items-center justify-center text-lg">
            ✓
          </div>
          <div>
            <p className="text-[13px] font-semibold" style={{ color: "var(--t-primary)" }}>
              Отметить {KIND_LABELS[kind]} как выполненную?
            </p>
            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--t-muted)" }}>{title}</p>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-emerald-600 hover:bg-emerald-500 text-[#fff] disabled:opacity-50 transition-all active:scale-[0.97] motion-reduce:transform-none"
          >
            {loading ? "Сохраняем…" : "Выполнено ✓"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium rounded-xl transition-colors nav-hover"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--t-secondary)",
            }}
          >
            Отмена
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

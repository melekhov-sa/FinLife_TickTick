"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  kind: "task" | "habit" | "task_occ";
  id: number;
  title: string;
  onClose: () => void;
}

const KIND_LABELS: Record<string, string> = {
  task: "задачу",
  habit: "привычку",
  task_occ: "задачу",
};

async function completeItem(kind: Props["kind"], id: number) {
  if (kind === "task") {
    return fetch(`/api/v2/tasks/${id}/complete`, { method: "POST", credentials: "include" });
  }
  if (kind === "habit") {
    return fetch(`/api/v2/habits/occurrences/${id}/complete`, { method: "POST", credentials: "include" });
  }
  if (kind === "task_occ") {
    return fetch(`/api/v2/task-occurrences/${id}/complete`, { method: "POST", credentials: "include" });
  }
}

export function ConfirmCompleteModal({ kind, id, title, onClose }: Props) {
  const qc = useQueryClient();
  const overlayRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      const res = await completeItem(kind, id);
      if (!res || !res.ok) {
        const data = await res?.json().catch(() => ({}));
        setError(data?.detail ?? "Ошибка при выполнении");
        return;
      }
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-sm mx-4 bg-[#1a1d23] border border-white/[0.09] rounded-2xl shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/[0.15] border border-emerald-500/20 flex items-center justify-center text-lg">
            ✓
          </div>
          <div>
            <p className="text-[13px] font-semibold text-white/90">
              Отметить {KIND_LABELS[kind]} как выполненную?
            </p>
            <p className="text-xs text-white/55 mt-0.5 line-clamp-2">{title}</p>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 transition-colors"
          >
            {loading ? "Сохраняем…" : "Выполнено ✓"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/68 hover:bg-white/[0.08] transition-colors"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

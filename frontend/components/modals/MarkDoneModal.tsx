"use client";

import { useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { useMarkMaintenanceDone } from "@/hooks/useMaintenance";

interface Props {
  itemId: number;
  itemTitle: string;
  onClose: () => void;
}

export function MarkDoneModal({ itemId, itemTitle, onClose }: Props) {
  const [note, setNote] = useState("");
  const { mutate, isPending } = useMarkMaintenanceDone();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutate({ id: itemId, note: note.trim() || undefined }, { onSuccess: onClose });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl shadow-2xl p-5 max-h-[calc(100dvh-48px)] overflow-y-auto overscroll-contain"
        style={{ background: "var(--app-card-bg)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-500" />
            <h2 className="text-[16px] font-bold" style={{ color: "var(--t-primary)" }}>
              Выполнено
            </h2>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08]">
            <X size={16} style={{ color: "var(--t-faint)" }} />
          </button>
        </div>

        <p className="text-[13px] mb-4 truncate" style={{ color: "var(--t-muted)" }}>{itemTitle}</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
              Заметка (необязательно)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Что сделали, где, у кого…"
              className="w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-indigo-400 resize-none"
              style={{ borderColor: "rgba(99,102,241,0.25)", background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" }}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border text-[14px] font-medium transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.06]"
              style={{ borderColor: "rgba(99,102,241,0.2)", color: "var(--t-muted)" }}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[14px] font-medium transition-colors disabled:opacity-50"
            >
              {isPending ? "Сохранение…" : "Подтвердить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

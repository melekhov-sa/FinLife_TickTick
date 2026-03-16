"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkCategoryItem } from "@/types/api";
import { Select } from "@/components/ui/Select";

interface Props {
  onClose: () => void;
}

const DUE_KINDS = [
  { value: "NONE", label: "Без срока" },
  { value: "DATE", label: "Дата" },
  { value: "DATETIME", label: "Дата и время" },
];

const inputCls =
  "w-full px-3 h-9 text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors [color-scheme:dark]";
const labelCls = "block text-xs font-medium text-white/72 uppercase tracking-wider mb-1.5";

export function CreateTaskModal({ onClose }: Props) {
  const qc = useQueryClient();
  const overlayRef = useRef<HTMLDivElement>(null);

  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [dueKind, setDueKind] = useState("NONE");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: categories } = useQuery<WorkCategoryItem[]>({
    queryKey: ["work-categories"],
    queryFn: () => fetch("/api/v2/work-categories", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Введите название задачи"); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v2/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          note: note.trim() || null,
          due_kind: dueKind,
          due_date: dueDate || null,
          due_time: dueTime || null,
          category_id: categoryId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Ошибка при создании задачи");
        return;
      }
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-md mx-4 bg-[#1a1d23] border border-white/[0.09] rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.06]">
          <h2 className="text-base font-semibold text-white/90" style={{ letterSpacing: "-0.02em" }}>
            Создать задачу
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-white/65 hover:text-white/65 hover:bg-white/[0.07] transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Title */}
          <div>
            <label className={labelCls}>Название *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Название задачи"
              className={`${inputCls} h-10`}
              autoFocus
            />
          </div>

          {/* Category */}
          {categories && categories.length > 0 && (
            <div>
              <label className={labelCls}>Категория</label>
              <Select
                value={categoryId}
                onChange={(v) => setCategoryId(v ? Number(v) : "")}
                placeholder="— без категории —"
                options={[
                  { value: "", label: "— без категории —" },
                  ...categories.map((c) => ({ value: String(c.category_id), label: c.title, emoji: c.emoji ?? undefined })),
                ]}
              />
            </div>
          )}

          {/* Due kind */}
          <div>
            <label className={labelCls}>Когда</label>
            <div className="flex gap-1.5">
              {DUE_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => { setDueKind(k.value); if (k.value === "NONE") { setDueDate(""); setDueTime(""); } }}
                  className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
                    dueKind === k.value
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-white/[0.03] border-white/[0.08] text-white/72 hover:text-white/65 hover:bg-white/[0.05]"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date picker */}
          {dueKind !== "NONE" && (
            <div className={`grid gap-3 ${dueKind === "DATETIME" ? "grid-cols-2" : "grid-cols-1"}`}>
              <div>
                <label className={labelCls}>Дата</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} />
              </div>
              {dueKind === "DATETIME" && (
                <div>
                  <label className={labelCls}>Время</label>
                  <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={inputCls} />
                </div>
              )}
            </div>
          )}

          {/* Note toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowNote(!showNote)}
              className="text-xs font-medium text-white/65 hover:text-white/60 transition-colors"
            >
              {showNote ? "▾ Заметка" : "▸ Добавить заметку"}
            </button>
            {showNote && (
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Заметка к задаче"
                rows={2}
                className={`w-full px-3 py-2 text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors resize-none mt-2`}
              />
            )}
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
            >
              {saving ? "Создаём…" : "Создать задачу"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm font-medium rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/68 hover:text-white/65 hover:bg-white/[0.08] transition-colors"
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

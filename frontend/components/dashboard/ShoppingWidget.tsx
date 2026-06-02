"use client";

import { clsx } from "clsx";
import { Plus } from "lucide-react";
import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ShoppingItem } from "@/types/api";
import { api } from "@/lib/api";

interface Props {
  listId: number;
  items: ShoppingItem[];
}

export function ShoppingWidget({ listId, items }: Props) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/api/v2/lists/items/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  const addItem = useMutation({
    mutationFn: (t: string) =>
      api.post(`/api/v2/lists/${listId}/items`, { title: t }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setTitle("");
      inputRef.current?.focus();
    },
  });

  function openAdd() {
    setAdding(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function submit() {
    const t = title.trim();
    if (!t || addItem.isPending) return;
    addItem.mutate(t);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); submit(); }
    if (e.key === "Escape") { setAdding(false); setTitle(""); }
  }

  return (
    <div className="bg-white dark:bg-white/[0.05] rounded-[14px] border border-slate-200 dark:border-white/[0.09] shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="block-title" style={{ color: "var(--t-muted)" }}>
          Ближайшие покупки
        </p>
        <button
          type="button"
          onClick={openAdd}
          aria-label="Добавить покупку"
          className="w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-indigo-500/10"
          style={{ color: "var(--t-muted)" }}
        >
          <Plus size={15} strokeWidth={2.2} />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-[13px] py-1" style={{ color: "var(--t-faint)" }}>Список пуст</p>
      ) : (
        <div className="space-y-0.5">
          {items.map((item) => {
            const isDone = item.status === "done";
            return (
              <label
                key={item.id}
                className={clsx(
                  "flex items-center gap-2.5 py-1.5 cursor-pointer group",
                  toggle.isPending && "opacity-60 pointer-events-none",
                )}
              >
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() =>
                    toggle.mutate({ id: item.id, status: isDone ? "open" : "done" })
                  }
                  className="w-4 h-4 rounded accent-indigo-500 shrink-0 cursor-pointer"
                />
                <span
                  className={clsx(
                    "text-[13px] leading-snug",
                    isDone
                      ? "line-through opacity-40"
                      : "group-hover:opacity-80 transition-opacity",
                  )}
                  style={{ color: "var(--t-primary)" }}
                >
                  {item.title}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {adding && (
        <div
          className="flex items-center gap-2 mt-2 rounded-lg border px-2.5 py-1.5 transition-colors focus-within:border-indigo-400/70"
          style={{ borderColor: "rgba(99,102,241,0.22)", background: "rgba(255,255,255,0.04)" }}
        >
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => { if (!title.trim()) { setAdding(false); } }}
            placeholder="Название товара…"
            className="flex-1 min-w-0 bg-transparent text-[13px] outline-none placeholder:opacity-40"
            style={{ color: "var(--t-primary)" }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!title.trim() || addItem.isPending}
            className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors disabled:opacity-40"
            style={{ color: "var(--app-accent)" }}
          >
            Добавить
          </button>
        </div>
      )}

      <div className="mt-3 pt-2.5 border-t border-white/[0.05]">
        <a
          href={`/lists/${listId}`}
          className="text-xs font-medium hover:text-indigo-400 transition-colors"
          style={{ color: "var(--t-muted)" }}
        >
          Открыть список →
        </a>
      </div>
    </div>
  );
}

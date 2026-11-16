"use client";

import { clsx } from "clsx";
import { Plus, ShoppingCart } from "lucide-react";
import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ShoppingItem } from "@/types/api";
import { api } from "@/lib/api";
import { ShoppingItemSheet } from "@/components/dashboard/ShoppingItemSheet";

const MONEY = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

/** «до 20.12», и «просрочено», если дата покупки уже прошла. */
function wantByLabel(iso: string): { text: string; overdue: boolean } {
  const target = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const text = target.toLocaleDateString("ru-RU", { day: "numeric", month: "numeric" });
  return { text: `до ${text}`, overdue: target < today };
}

interface Props {
  listId: number;
  items: ShoppingItem[];
}

export function ShoppingWidget({ listId, items }: Props) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  // Позиция, у которой правим цену и дату: тап по названию, не по галочке.
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
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
    <div className="dash-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[14px] font-semibold inline-flex items-center gap-1.5" style={{ letterSpacing: "-0.01em", color: "var(--t-primary)" }}>
          <ShoppingCart size={14} strokeWidth={2} style={{ color: "var(--t-muted)" }} />
          Ближайшие покупки
        </p>
        <button
          type="button"
          onClick={openAdd}
          aria-label="Добавить покупку"
          className="w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--app-accent-weak)]0/10"
          style={{ color: "var(--t-muted)" }}
        >
          <Plus size={15} strokeWidth={2.2} />
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-[13px] py-1" style={{ color: "var(--t-faint)" }}>Список пуст</p>
      ) : (
        <div className="space-y-0.5">
          {items.slice(0, 5).map((item) => {
            const isDone = item.status === "done";
            const due = item.want_by ? wantByLabel(item.want_by) : null;
            const hasMeta = item.price != null || due !== null;
            return (
              <div
                key={item.id}
                className={clsx(
                  "flex items-center gap-2.5 py-1.5 group",
                  toggle.isPending && "opacity-60 pointer-events-none",
                )}
              >
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() =>
                    toggle.mutate({ id: item.id, status: isDone ? "open" : "done" })
                  }
                  aria-label={isDone ? "Вернуть в список" : "Отметить купленным"}
                  className="w-4 h-4 rounded accent-[var(--app-accent)] shrink-0 cursor-pointer"
                />
                {/* Тап по названию правит цену и дату. Галочка выше — отдельная
                    цель, иначе «куплено» и «открыть» дрались бы за один тап. */}
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  className="flex-1 min-w-0 text-left"
                  title="Цена и дата покупки"
                >
                  <span
                    className={clsx(
                      "text-[13px] leading-snug block truncate",
                      isDone
                        ? "line-through opacity-40"
                        : "group-hover:opacity-80 transition-opacity",
                    )}
                    style={{ color: "var(--t-primary)" }}
                  >
                    {item.title}
                  </span>
                  {!isDone && hasMeta && (
                    <span className="text-[11px] leading-snug flex items-center gap-1.5">
                      {item.price != null && (
                        <span className="tabular-nums" style={{ color: "var(--t-muted)" }}>
                          {MONEY.format(item.price)} ₽
                        </span>
                      )}
                      {item.price != null && due && (
                        <span style={{ color: "var(--t-faint)" }}>·</span>
                      )}
                      {due && (
                        <span
                          className="tabular-nums"
                          style={{ color: due.overdue ? "var(--c-danger-ink)" : "var(--t-faint)" }}
                        >
                          {due.text}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <div
          className="flex items-center gap-2 mt-2 rounded-lg border px-2.5 py-1.5 transition-colors focus-within:border-[color-mix(in_srgb,var(--app-accent)_70%,transparent)]"
          style={{ borderColor: "color-mix(in srgb, var(--app-accent) 22%, transparent)", background: "rgba(255,255,255,0.04)" }}
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

      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/[0.05]">
        <a
          href={`/lists/${listId}`}
          className="text-xs font-medium hover:text-[var(--app-accent)] transition-colors"
          style={{ color: "var(--t-muted)" }}
        >
          {items.length > 5 ? `Открыть список · ещё ${items.length - 5}` : "Открыть список"} →
        </a>
      </div>

      <ShoppingItemSheet item={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

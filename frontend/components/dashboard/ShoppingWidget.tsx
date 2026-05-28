"use client";

import { clsx } from "clsx";
import { ShoppingCart } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ShoppingItem } from "@/types/api";
import { api } from "@/lib/api";

interface Props {
  listId: number;
  items: ShoppingItem[];
}

export function ShoppingWidget({ listId, items }: Props) {
  const qc = useQueryClient();

  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/api/v2/lists/items/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
  });

  return (
    <div className="bg-white dark:bg-white/[0.05] rounded-[14px] border border-slate-200 dark:border-white/[0.09] shadow-sm p-4">
      <p className="block-title mb-3" style={{ color: "var(--t-muted)" }}>
        Ближайшие покупки
      </p>

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

"use client";

import type { ReactNode } from "react";
import { X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineEditField } from "@/components/primitives/InlineEditField";
import type { WidgetDef, WidgetInstance } from "./types";

interface WidgetCardProps {
  instance: WidgetInstance;
  def: WidgetDef;
  editing: boolean;
  onRemove: () => void;
  onRename: (title: string) => void;
  children: ReactNode;
}

export function WidgetCard({
  instance,
  def,
  editing,
  onRemove,
  onRename,
  children,
}: WidgetCardProps) {
  const title = instance.title ?? def.title;

  return (
    <div
      className={cn(
        "h-full flex flex-col rounded-2xl overflow-hidden transition-[border-color]",
        editing && "ring-1 ring-[var(--app-accent)]/40",
      )}
      style={{
        background: "var(--app-card-bg)",
        border: `1px solid ${editing ? "var(--app-accent)" : "var(--app-border)"}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0">
        {editing && (
          <span
            className="widget-drag-handle shrink-0 cursor-grab active:cursor-grabbing touch-none"
            style={{ color: "var(--t-faint)" }}
          >
            <GripVertical size={14} strokeWidth={1.8} />
          </span>
        )}

        <span className="text-base leading-none select-none">{def.emoji}</span>

        <div className="flex-1 min-w-0">
          {editing ? (
            <InlineEditField
              value={title}
              onSave={onRename}
              size="sm"
              allowEmpty={false}
              textClassName="font-semibold"
            />
          ) : (
            <span
              className="block text-[13px] font-semibold truncate"
              style={{ color: "var(--t-primary)" }}
            >
              {title}
            </span>
          )}
        </div>

        {editing && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded-full p-1 transition-colors hover:bg-[var(--c-danger-bg)]"
            style={{ color: "var(--t-faint)" }}
            aria-label="Удалить виджет"
          >
            <X size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden px-4 pb-4 min-h-0">{children}</div>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineEditField } from "@/components/primitives/InlineEditField";
import type { WidgetDef, WidgetInstance, WidgetSize } from "./types";

interface WidgetCardProps {
  instance: WidgetInstance;
  def: WidgetDef;
  editing: boolean;
  onRemove: () => void;
  onResize: (size: WidgetSize) => void;
  onRename: (title: string) => void;
  children: ReactNode;
}

const SIZE_LABELS: Record<WidgetSize, string> = {
  sm: "1×1",
  md: "2×1",
  lg: "2×2",
  xl: "4×1",
};

const GRID_SPAN: Record<WidgetSize, string> = {
  sm: "col-span-1 row-span-1",
  md: "col-span-2 row-span-1",
  lg: "col-span-2 row-span-2",
  xl: "col-span-4 row-span-1",
};

const MIN_HEIGHT: Record<WidgetSize, number> = {
  sm: 140,
  md: 160,
  lg: 300,
  xl: 160,
};

export function WidgetCard({
  instance,
  def,
  editing,
  onRemove,
  onResize,
  onRename,
  children,
}: WidgetCardProps) {
  const title = instance.title ?? def.title;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl overflow-hidden transition-shadow",
        GRID_SPAN[instance.size],
        editing && "ring-2 ring-dashed ring-[var(--app-accent)] ring-offset-2",
      )}
      style={{
        background: "var(--app-card-bg)",
        border: "1px solid var(--app-border)",
        minHeight: MIN_HEIGHT[instance.size],
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0">
        {editing && (
          <GripVertical
            size={13}
            className="shrink-0 cursor-grab"
            style={{ color: "var(--t-faint)" }}
          />
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
      <div className="flex-1 overflow-hidden px-4 pb-4">{children}</div>

      {/* Size picker */}
      {editing && (
        <div className="flex items-center gap-1 px-4 pb-3 shrink-0">
          <span
            className="text-[10px] mr-1"
            style={{ color: "var(--t-faint)" }}
          >
            Размер:
          </span>
          {def.allowedSizes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onResize(s)}
              className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors",
                instance.size === s
                  ? "bg-[var(--app-accent)]"
                  : "bg-[var(--c-neutral-bg)] hover:bg-[var(--app-border)]",
              )}
              style={{
                color:
                  instance.size === s ? "var(--app-accent-ink)" : "var(--t-secondary)",
              }}
            >
              {SIZE_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

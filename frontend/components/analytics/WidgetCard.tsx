"use client";

import type { ReactNode } from "react";
import { X, GripVertical, Minus, Plus } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: instance.instanceId, disabled: !editing });

  const title = instance.title ?? def.title;
  const sizeIdx = def.allowedSizes.indexOf(instance.size);
  const canShrink = sizeIdx > 0;
  const canGrow = sizeIdx < def.allowedSizes.length - 1;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
        zIndex: isDragging ? 50 : undefined,
        background: "var(--app-card-bg)",
        border: `1px solid ${editing ? "var(--app-accent)" : "var(--app-border)"}`,
        minHeight: MIN_HEIGHT[instance.size],
      }}
      className={cn(
        "relative flex flex-col rounded-2xl overflow-hidden transition-[border-color,box-shadow]",
        GRID_SPAN[instance.size],
        editing && "shadow-[0_0_0_2px_var(--app-accent)]/20",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2 shrink-0">
        {/* Drag handle */}
        {editing && (
          <button
            type="button"
            aria-label="Перетащить виджет"
            className="shrink-0 cursor-grab active:cursor-grabbing rounded p-0.5 -ml-1 touch-none"
            style={{ color: "var(--t-faint)" }}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} strokeWidth={1.8} />
          </button>
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

      {/* Resize controls */}
      {editing && (
        <div
          className="flex items-center gap-1.5 px-4 pb-3 shrink-0"
          style={{ borderTop: "1px solid var(--app-border)" }}
        >
          <span className="text-[10px] mr-0.5" style={{ color: "var(--t-faint)" }}>
            Размер
          </span>
          <button
            type="button"
            onClick={() => canShrink && onResize(def.allowedSizes[sizeIdx - 1])}
            disabled={!canShrink}
            aria-label="Уменьшить"
            className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-[var(--c-neutral-bg)] disabled:opacity-25"
            style={{ color: "var(--t-secondary)" }}
          >
            <Minus size={11} strokeWidth={2.2} />
          </button>
          <span
            className="text-[11px] font-semibold tabular-nums w-8 text-center"
            style={{ color: "var(--t-primary)" }}
          >
            {SIZE_LABELS[instance.size]}
          </span>
          <button
            type="button"
            onClick={() => canGrow && onResize(def.allowedSizes[sizeIdx + 1])}
            disabled={!canGrow}
            aria-label="Увеличить"
            className="w-5 h-5 rounded flex items-center justify-center transition-colors hover:bg-[var(--c-neutral-bg)] disabled:opacity-25"
            style={{ color: "var(--t-secondary)" }}
          >
            <Plus size={11} strokeWidth={2.2} />
          </button>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

import { WidgetCard } from "./WidgetCard";
import { getWidgetDef } from "./registry";
import type { WidgetInstance } from "./types";

const RGL = WidthProvider(GridLayout);

const COLS = 4;
const ROW_H = 80;
const MARGIN: [number, number] = [16, 16];

interface WidgetGridProps {
  instances: WidgetInstance[];
  editing: boolean;
  onRemove: (instanceId: string) => void;
  onRename: (instanceId: string, title: string) => void;
  onUpdateLayout: (changes: { i: string; x: number; y: number; w: number; h: number }[]) => void;
}

export function WidgetGrid({
  instances,
  editing,
  onRemove,
  onRename,
  onUpdateLayout,
}: WidgetGridProps) {
  // WidthProvider measures DOM, so we avoid SSR flash
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <span className="text-5xl select-none">📐</span>
        <p className="text-[14px]" style={{ color: "var(--t-faint)" }}>
          Нажмите «Настроить» → «Добавить» чтобы собрать дашборд
        </p>
      </div>
    );
  }

  const layout: Layout[] = instances.map((inst) => {
    const def = getWidgetDef(inst.widgetId);
    return {
      i: inst.instanceId,
      x: inst.x,
      y: inst.y,
      w: inst.w,
      h: inst.h,
      minW: def?.minW ?? 1,
      minH: def?.minH ?? 2,
      maxW: def?.maxW ?? COLS,
      isDraggable: editing,
      isResizable: editing,
    };
  });

  function handleStop(newLayout: Layout[]) {
    onUpdateLayout(
      newLayout.map((item) => ({
        i: item.i,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
      })),
    );
  }

  if (!mounted) {
    return (
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {instances.map((inst) => {
          const def = getWidgetDef(inst.widgetId);
          if (!def) return null;
          return (
            <div
              key={inst.instanceId}
              className="rounded-2xl animate-pulse"
              style={{
                gridColumn: `span ${inst.w}`,
                minHeight: inst.h * ROW_H,
                background: "var(--c-neutral-bg)",
              }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <>
      {/* Override react-grid-layout styles to match our theme */}
      <style>{`
        .react-grid-item.react-grid-placeholder {
          background: var(--app-accent) !important;
          opacity: 0.12 !important;
          border-radius: 16px !important;
        }
        .react-resizable-handle {
          opacity: 0;
          transition: opacity 0.15s;
        }
        .react-grid-item:hover .react-resizable-handle,
        .react-grid-item.resizing .react-resizable-handle {
          opacity: 1;
        }
        .react-resizable-handle::after {
          border-color: var(--app-accent) !important;
          width: 8px !important;
          height: 8px !important;
          border-width: 0 2px 2px 0 !important;
          bottom: 6px !important;
          right: 6px !important;
        }
        .react-grid-item.react-draggable-dragging {
          box-shadow: 0 20px 60px rgba(0,0,0,0.2) !important;
          z-index: 100 !important;
        }
      `}</style>

      <RGL
        cols={COLS}
        rowHeight={ROW_H}
        margin={MARGIN}
        layout={layout}
        isDraggable={editing}
        isResizable={editing}
        draggableHandle=".widget-drag-handle"
        compactType="vertical"
        onDragStop={handleStop}
        onResizeStop={handleStop}
        useCSSTransforms
      >
        {instances.map((instance) => {
          const def = getWidgetDef(instance.widgetId);
          if (!def) return null;
          const Widget = def.component;
          return (
            <div key={instance.instanceId}>
              <WidgetCard
                instance={instance}
                def={def}
                editing={editing}
                onRemove={() => onRemove(instance.instanceId)}
                onRename={(title) => onRename(instance.instanceId, title)}
              >
                <Widget instanceId={instance.instanceId} />
              </WidgetCard>
            </div>
          );
        })}
      </RGL>
    </>
  );
}

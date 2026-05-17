"use client";

import { useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { WidgetCard } from "./WidgetCard";
import { getWidgetDef } from "./registry";
import type { WidgetInstance, WidgetSize } from "./types";

interface WidgetGridProps {
  instances: WidgetInstance[];
  editing: boolean;
  onRemove: (instanceId: string) => void;
  onResize: (instanceId: string, size: WidgetSize) => void;
  onRename: (instanceId: string, title: string) => void;
  onReorder: (activeId: string, overId: string) => void;
}

export function WidgetGrid({
  instances,
  editing,
  onRemove,
  onResize,
  onRename,
  onReorder,
}: WidgetGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  }

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

  const activeInstance = activeId
    ? instances.find((i) => i.instanceId === activeId)
    : null;
  const activeDef = activeInstance ? getWidgetDef(activeInstance.widgetId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={instances.map((i) => i.instanceId)}
        strategy={rectSortingStrategy}
      >
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
        >
          {instances.map((instance) => {
            const def = getWidgetDef(instance.widgetId);
            if (!def) return null;
            const Widget = def.component;
            return (
              <WidgetCard
                key={instance.instanceId}
                instance={instance}
                def={def}
                editing={editing}
                onRemove={() => onRemove(instance.instanceId)}
                onResize={(size) => onResize(instance.instanceId, size)}
                onRename={(title) => onRename(instance.instanceId, title)}
              >
                <Widget instanceId={instance.instanceId} />
              </WidgetCard>
            );
          })}
        </div>
      </SortableContext>

      {/* Ghost карточка при перетаскивании */}
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
        {activeInstance && activeDef ? (
          <div
            className="rounded-2xl rotate-1 shadow-2xl"
            style={{
              background: "var(--app-card-bg)",
              border: "2px solid var(--app-accent)",
              opacity: 0.92,
              minHeight: activeInstance.size === "lg" ? 300 : 160,
            }}
          >
            <div className="flex items-center gap-2 px-4 pt-4 pb-2">
              <span className="text-base select-none">{activeDef.emoji}</span>
              <span
                className="text-[13px] font-semibold"
                style={{ color: "var(--t-primary)" }}
              >
                {activeInstance.title ?? activeDef.title}
              </span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

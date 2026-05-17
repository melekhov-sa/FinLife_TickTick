"use client";

import { WidgetCard } from "./WidgetCard";
import { getWidgetDef } from "./registry";
import type { WidgetInstance, WidgetSize } from "./types";

interface WidgetGridProps {
  instances: WidgetInstance[];
  editing: boolean;
  onRemove: (instanceId: string) => void;
  onResize: (instanceId: string, size: WidgetSize) => void;
  onRename: (instanceId: string, title: string) => void;
}

export function WidgetGrid({
  instances,
  editing,
  onRemove,
  onResize,
  onRename,
}: WidgetGridProps) {
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

  return (
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
  );
}

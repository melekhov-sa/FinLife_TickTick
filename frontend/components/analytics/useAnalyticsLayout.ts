"use client";

import { useState } from "react";
import type { WidgetInstance } from "./types";
import { getWidgetDef } from "./registry";

const STORAGE_KEY = "finlife:analytics-layout-v2";

// Migrate old format (size string) to new format (x,y,w,h)
const OLD_SIZE_MAP: Record<string, { w: number; h: number }> = {
  sm: { w: 1, h: 2 },
  md: { w: 2, h: 2 },
  lg: { w: 2, h: 4 },
  xl: { w: 4, h: 2 },
};

function migrate(raw: Record<string, unknown>[]): WidgetInstance[] {
  let col = 0;
  let row = 0;
  return raw.map((item) => {
    if (typeof item.x === "number") return item as unknown as WidgetInstance;
    const wh = OLD_SIZE_MAP[(item.size as string) ?? "sm"] ?? { w: 1, h: 2 };
    if (col + wh.w > 4) { col = 0; row += 2; }
    const inst: WidgetInstance = {
      instanceId: item.instanceId as string,
      widgetId: item.widgetId as string,
      title: item.title as string | undefined,
      x: col, y: row, ...wh,
    };
    col += wh.w;
    if (col >= 4) { col = 0; row += wh.h; }
    return inst;
  });
}

function load(): WidgetInstance[] {
  if (typeof window === "undefined") return [];
  try {
    // Try new key first
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as WidgetInstance[];
    // Try migrating old key
    const old = localStorage.getItem("finlife:analytics-layout");
    if (old) {
      const migrated = migrate(JSON.parse(old) as Record<string, unknown>[]);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

/** Find a free position for a new widget of given size. */
function findPosition(instances: WidgetInstance[], w: number, h: number): { x: number; y: number } {
  const maxY = instances.reduce((m, i) => Math.max(m, i.y + i.h), 0);
  return { x: 0, y: maxY };
}

export function useAnalyticsLayout() {
  const [instances, setInstances] = useState<WidgetInstance[]>(load);

  function persist(next: WidgetInstance[]) {
    setInstances(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  }

  function add(widgetId: string) {
    const def = getWidgetDef(widgetId);
    if (!def) return;
    const { x, y } = findPosition(instances, def.defaultW, def.defaultH);
    persist([
      ...instances,
      {
        instanceId: crypto.randomUUID(),
        widgetId,
        x, y,
        w: def.defaultW,
        h: def.defaultH,
      },
    ]);
  }

  function remove(instanceId: string) {
    persist(instances.filter((i) => i.instanceId !== instanceId));
  }

  function rename(instanceId: string, title: string) {
    persist(
      instances.map((i) =>
        i.instanceId === instanceId
          ? { ...i, title: title.trim() || undefined }
          : i,
      ),
    );
  }

  /** Called by react-grid-layout onDragStop / onResizeStop */
  function updateLayout(changes: { i: string; x: number; y: number; w: number; h: number }[]) {
    const map = new Map(changes.map((c) => [c.i, c]));
    persist(
      instances.map((inst) => {
        const c = map.get(inst.instanceId);
        return c ? { ...inst, x: c.x, y: c.y, w: c.w, h: c.h } : inst;
      }),
    );
  }

  return { instances, add, remove, rename, updateLayout };
}

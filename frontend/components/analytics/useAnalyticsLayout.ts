"use client";

import { useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import type { WidgetInstance, WidgetSize } from "./types";
import { getWidgetDef } from "./registry";

const STORAGE_KEY = "finlife:analytics-layout";

function load(): WidgetInstance[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WidgetInstance[]) : [];
  } catch {
    return [];
  }
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
    persist([
      ...instances,
      {
        instanceId: crypto.randomUUID(),
        widgetId,
        size: def.defaultSize,
      },
    ]);
  }

  function remove(instanceId: string) {
    persist(instances.filter((i) => i.instanceId !== instanceId));
  }

  function resize(instanceId: string, size: WidgetSize) {
    persist(
      instances.map((i) =>
        i.instanceId === instanceId ? { ...i, size } : i,
      ),
    );
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

  function reorder(activeId: string, overId: string) {
    const oldIdx = instances.findIndex((i) => i.instanceId === activeId);
    const newIdx = instances.findIndex((i) => i.instanceId === overId);
    if (oldIdx === -1 || newIdx === -1) return;
    persist(arrayMove(instances, oldIdx, newIdx));
  }

  return { instances, add, remove, resize, rename, reorder };
}

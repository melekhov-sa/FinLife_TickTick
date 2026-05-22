"use client";

import { useState } from "react";
import type { WidgetInstance } from "./types";
import { getWidgetDef } from "./registry";

export interface AnalyticsTab {
  tabId: string;
  title: string;
  instances: WidgetInstance[];
}

const TABS_KEY = "finlife:analytics-tabs-v1";
const OLD_LAYOUT_KEY = "finlife:analytics-layout-v2";

function findPosition(instances: WidgetInstance[], w: number, h: number): { x: number; y: number } {
  const maxY = instances.reduce((m, i) => Math.max(m, i.y + i.h), 0);
  return { x: 0, y: maxY };
}

function loadTabs(): AnalyticsTab[] {
  if (typeof window === "undefined") {
    return [{ tabId: "ssr-default", title: "Главная", instances: [] }];
  }
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AnalyticsTab[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    // Migrate from old single-tab layout
    const old = localStorage.getItem(OLD_LAYOUT_KEY);
    if (old) {
      const instances = JSON.parse(old) as WidgetInstance[];
      return [{ tabId: crypto.randomUUID(), title: "Главная", instances: Array.isArray(instances) ? instances : [] }];
    }
  } catch {}
  return [{ tabId: crypto.randomUUID(), title: "Главная", instances: [] }];
}

function saveTabs(tabs: AnalyticsTab[]) {
  if (typeof window !== "undefined") {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
  }
}

interface TabsState {
  tabs: AnalyticsTab[];
  activeTabId: string;
}

export function useAnalyticsTabs() {
  const [state, setState] = useState<TabsState>(() => {
    const tabs = loadTabs();
    return { tabs, activeTabId: tabs[0]?.tabId ?? "" };
  });

  const { tabs, activeTabId } = state;
  const activeTab = tabs.find((t) => t.tabId === activeTabId) ?? tabs[0];
  const instances = activeTab?.instances ?? [];

  function updateTabs(updater: (prev: AnalyticsTab[]) => AnalyticsTab[]) {
    setState((prev) => {
      const next = updater(prev.tabs);
      saveTabs(next);
      return { ...prev, tabs: next };
    });
  }

  function setActiveTabId(tabId: string) {
    setState((prev) => ({ ...prev, activeTabId: tabId }));
  }

  function addTab() {
    const newTab: AnalyticsTab = {
      tabId: crypto.randomUUID(),
      title: "Новая вкладка",
      instances: [],
    };
    setState((prev) => {
      const next = [...prev.tabs, newTab];
      saveTabs(next);
      return { tabs: next, activeTabId: newTab.tabId };
    });
  }

  function renameTab(tabId: string, title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    updateTabs((prev) => prev.map((t) => t.tabId === tabId ? { ...t, title: trimmed } : t));
  }

  function deleteTab(tabId: string) {
    setState((prev) => {
      if (prev.tabs.length <= 1) return prev;
      const idx = prev.tabs.findIndex((t) => t.tabId === tabId);
      const next = prev.tabs.filter((t) => t.tabId !== tabId);
      saveTabs(next);
      const newActiveId = prev.activeTabId === tabId
        ? (next[Math.max(0, idx - 1)]?.tabId ?? next[0]?.tabId ?? "")
        : prev.activeTabId;
      return { tabs: next, activeTabId: newActiveId };
    });
  }

  function updateInstances(updater: (prev: WidgetInstance[]) => WidgetInstance[]) {
    setState((prev) => {
      const aid = prev.activeTabId;
      const next = prev.tabs.map((t) =>
        t.tabId === aid ? { ...t, instances: updater(t.instances) } : t,
      );
      saveTabs(next);
      return { ...prev, tabs: next };
    });
  }

  function add(widgetId: string) {
    const def = getWidgetDef(widgetId);
    if (!def) return;
    updateInstances((prev) => {
      const { x, y } = findPosition(prev, def.defaultW, def.defaultH);
      return [
        ...prev,
        { instanceId: crypto.randomUUID(), widgetId, x, y, w: def.defaultW, h: def.defaultH },
      ];
    });
  }

  function remove(instanceId: string) {
    updateInstances((prev) => prev.filter((i) => i.instanceId !== instanceId));
  }

  function rename(instanceId: string, title: string) {
    updateInstances((prev) =>
      prev.map((i) => i.instanceId === instanceId ? { ...i, title: title.trim() || undefined } : i),
    );
  }

  function updateLayout(changes: { i: string; x: number; y: number; w: number; h: number }[]) {
    const map = new Map(changes.map((c) => [c.i, c]));
    updateInstances((prev) =>
      prev.map((inst) => {
        const c = map.get(inst.instanceId);
        return c ? { ...inst, x: c.x, y: c.y, w: c.w, h: c.h } : inst;
      }),
    );
  }

  return {
    tabs,
    activeTabId,
    setActiveTabId,
    addTab,
    renameTab,
    deleteTab,
    instances,
    add,
    remove,
    rename,
    updateLayout,
  };
}

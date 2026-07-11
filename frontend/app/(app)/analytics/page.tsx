"use client";

import { useState, useRef } from "react";
import { Settings2, Plus, Check, X } from "lucide-react";
import { clsx } from "clsx";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Button } from "@/components/primitives/Button";
import { WidgetGrid } from "@/components/analytics/WidgetGrid";
import { AddWidgetDrawer } from "@/components/analytics/AddWidgetDrawer";
import { useAnalyticsTabs } from "@/components/analytics/useAnalyticsTabs";

export default function AnalyticsPage() {
  const {
    tabs, activeTabId, setActiveTabId,
    addTab, renameTab, deleteTab,
    instances, add, remove, rename, updateLayout,
  } = useAnalyticsTabs();

  const [editing, setEditing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const tabInputRef = useRef<HTMLInputElement | null>(null);

  function handleTabClick(tabId: string) {
    if (tabId === activeTabId && editing) {
      setRenamingTabId(tabId);
      setTimeout(() => tabInputRef.current?.select(), 30);
    } else {
      setActiveTabId(tabId);
      setRenamingTabId(null);
    }
  }

  function handleTabRenameBlur(tabId: string, value: string) {
    renameTab(tabId, value);
    setRenamingTabId(null);
  }

  function handleStopEditing() {
    setEditing(false);
    setRenamingTabId(null);
  }

  return (
    <>
      <PageHeader
        title="Аналитика"
        density="compact"
        actions={
          <div className="flex items-center gap-2">
            {editing && (
              <Button
                variant="ghost"
                size="md"
                onClick={() => setDrawerOpen(true)}
                leftIcon={<Plus size={14} strokeWidth={1.9} />}
              >
                Добавить
              </Button>
            )}
            <Button
              variant={editing ? "primary" : "outline"}
              size="md"
              onClick={() => (editing ? handleStopEditing() : setEditing(true))}
              leftIcon={
                editing
                  ? <Check size={14} strokeWidth={2} />
                  : <Settings2 size={14} strokeWidth={1.9} />
              }
            >
              {editing ? "Готово" : "Настроить"}
            </Button>
          </div>
        }
      />

      {/* Tab bar */}
      <div
        className="flex items-center gap-1 px-4 md:px-6 pt-3 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {tabs.map((tab) => (
          <div key={tab.tabId} className="relative flex-shrink-0">
            {renamingTabId === tab.tabId ? (
              <input
                ref={tabInputRef}
                defaultValue={tab.title}
                autoFocus
                onBlur={(e) => handleTabRenameBlur(tab.tabId, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") setRenamingTabId(null);
                }}
                className="text-[13px] font-medium px-3 py-1.5 rounded-lg border border-[color-mix(in_srgb,var(--app-accent)_50%,transparent)] bg-transparent focus:outline-none"
                style={{ color: "var(--t-primary)", minWidth: 80, maxWidth: 160 }}
              />
            ) : (
              <button
                onClick={() => handleTabClick(tab.tabId)}
                className={clsx(
                  "text-[13px] font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap",
                  tab.tabId === activeTabId
                    ? "bg-[var(--app-accent-light)] text-[var(--app-accent)]"
                    : "hover:bg-white/[0.05]",
                )}
                style={{ color: tab.tabId === activeTabId ? undefined : "var(--t-faint)" }}
                title={editing ? "Нажмите ещё раз чтобы переименовать" : undefined}
              >
                {tab.title}
              </button>
            )}

            {/* Delete button — edit mode only, not for last tab */}
            {editing && tabs.length > 1 && renamingTabId !== tab.tabId && (
              <button
                onClick={() => deleteTab(tab.tabId)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center bg-slate-700 hover:bg-red-500/80 transition-colors z-10"
                style={{ color: "var(--t-faint)" }}
              >
                <X size={8} />
              </button>
            )}
          </div>
        ))}

        {/* Add tab */}
        <button
          onClick={addTab}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-colors ml-0.5 hover:bg-white/[0.08]"
          style={{ color: "var(--t-faint)" }}
          title="Новая вкладка"
        >
          <Plus size={14} />
        </button>
      </div>

      <main
        data-analytics
        className="flex-1 overflow-auto px-4 py-4 md:px-6 md:py-6"
        style={{ background: "var(--analytics-page-bg, var(--app-bg))" }}
      >
        <WidgetGrid
          instances={instances}
          editing={editing}
          onRemove={remove}
          onRename={rename}
          onUpdateLayout={updateLayout}
        />
      </main>

      <AddWidgetDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onAdd={add}
      />
    </>
  );
}

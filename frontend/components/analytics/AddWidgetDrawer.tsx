"use client";

import { Plus } from "lucide-react";
import { SidePanel } from "@/components/primitives/SidePanel";
import { WIDGET_REGISTRY } from "./registry";

interface AddWidgetDrawerProps {
  open: boolean;
  onClose: () => void;
  onAdd: (widgetId: string) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  overview: "Обзор",
  finance: "Финансы",
  tasks: "Задачи",
  habits: "Привычки",
  goals: "Цели",
};

const CATEGORY_ORDER = ["overview", "finance", "tasks", "habits", "goals"];

export function AddWidgetDrawer({ open, onClose, onAdd }: AddWidgetDrawerProps) {
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      ariaLabel="Добавить виджет"
      width={360}
      header={
        <span
          className="text-[15px] font-semibold"
          style={{ color: "var(--t-primary)" }}
        >
          Добавить виджет
        </span>
      }
    >
      <div className="p-4 space-y-5">
        {CATEGORY_ORDER.map((cat) => {
          const widgets = WIDGET_REGISTRY.filter((w) => w.category === cat);
          if (widgets.length === 0) return null;
          return (
            <div key={cat}>
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-2 px-1"
                style={{ color: "var(--t-muted)" }}
              >
                {CATEGORY_LABELS[cat]}
              </p>
              <div className="space-y-0.5">
                {widgets.map((def) => (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => {
                      onAdd(def.id);
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors hover:bg-[var(--c-neutral-bg)]"
                  >
                    <span className="text-xl shrink-0 select-none">
                      {def.emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-[13px] font-medium truncate"
                        style={{ color: "var(--t-primary)" }}
                      >
                        {def.title}
                      </p>
                      <p
                        className="text-[11px] truncate"
                        style={{ color: "var(--t-muted)" }}
                      >
                        {def.description}
                      </p>
                    </div>
                    <Plus
                      size={14}
                      strokeWidth={1.9}
                      style={{ color: "var(--t-faint)" }}
                      className="shrink-0"
                    />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </SidePanel>
  );
}

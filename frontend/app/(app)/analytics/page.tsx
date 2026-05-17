"use client";

import { useState } from "react";
import { Settings2, Plus, Check } from "lucide-react";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Button } from "@/components/primitives/Button";
import { WidgetGrid } from "@/components/analytics/WidgetGrid";
import { AddWidgetDrawer } from "@/components/analytics/AddWidgetDrawer";
import { useAnalyticsLayout } from "@/components/analytics/useAnalyticsLayout";

export default function AnalyticsPage() {
  const { instances, add, remove, resize, rename, reorder } = useAnalyticsLayout();
  const [editing, setEditing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
              onClick={() => setEditing((v) => !v)}
              leftIcon={
                editing ? (
                  <Check size={14} strokeWidth={2} />
                ) : (
                  <Settings2 size={14} strokeWidth={1.9} />
                )
              }
            >
              {editing ? "Готово" : "Настроить"}
            </Button>
          </div>
        }
      />
      <main className="flex-1 overflow-auto p-6">
        <WidgetGrid
          instances={instances}
          editing={editing}
          onRemove={remove}
          onResize={resize}
          onRename={rename}
          onReorder={reorder}
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

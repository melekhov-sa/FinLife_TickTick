"use client";

import type { WidgetProps } from "../types";

export function PlaceholderWidget({ instanceId: _ }: WidgetProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 select-none">
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
        style={{ background: "var(--c-neutral-bg)" }}
      >
        🔧
      </div>
      <span className="text-[12px]" style={{ color: "var(--t-muted)" }}>
        Виджет в разработке
      </span>
    </div>
  );
}

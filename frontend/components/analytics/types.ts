import type { ComponentType } from "react";

export type WidgetSize = "sm" | "md" | "lg" | "xl";

export interface WidgetProps {
  instanceId: string;
}

export interface WidgetDef {
  id: string;
  title: string;
  description: string;
  category: "finance" | "tasks" | "habits" | "goals" | "overview";
  defaultSize: WidgetSize;
  allowedSizes: WidgetSize[];
  component: ComponentType<WidgetProps>;
  emoji: string;
}

export interface WidgetInstance {
  instanceId: string;
  widgetId: string;
  size: WidgetSize;
  title?: string;
}

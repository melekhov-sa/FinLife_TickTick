import type { ComponentType } from "react";

export interface WidgetProps {
  instanceId: string;
}

export interface WidgetDef {
  id: string;
  title: string;
  description: string;
  category: "finance" | "tasks" | "habits" | "goals" | "overview";
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
  maxW?: number;
  component: ComponentType<WidgetProps>;
  emoji: string;
  /** false — убирает padding у body (для графиков край-в-край). По умолчанию true. */
  bodyPadded?: boolean;
}

export interface WidgetInstance {
  instanceId: string;
  widgetId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
}

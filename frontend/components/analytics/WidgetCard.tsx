"use client";

import type { ReactNode } from "react";
import { Widget } from "@/components/primitives/Widget";
import { InlineEditField } from "@/components/primitives/InlineEditField";
import type { WidgetDef, WidgetInstance } from "./types";

interface WidgetCardProps {
  instance: WidgetInstance;
  def: WidgetDef;
  editing: boolean;
  onRemove: () => void;
  onRename: (title: string) => void;
  children: ReactNode;
}

export function WidgetCard({
  instance,
  def,
  editing,
  onRemove,
  onRename,
  children,
}: WidgetCardProps) {
  const displayTitle = instance.title ?? def.title;

  const titleNode = editing ? (
    <InlineEditField
      value={displayTitle}
      onSave={onRename}
      size="sm"
      allowEmpty={false}
      textClassName="font-semibold"
    />
  ) : (
    displayTitle
  );

  return (
    <Widget
      icon={def.emoji}
      title={titleNode}
      editMode={editing}
      bodyPadded={def.bodyPadded ?? true}
      onRemove={onRemove}
      className="h-full"
    >
      {children}
    </Widget>
  );
}

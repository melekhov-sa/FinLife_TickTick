"use client";

import dynamic from "next/dynamic";

/**
 * Ленивая обёртка над Tiptap-редактором: сам редактор (крупный бандл)
 * подгружается только когда реально нужен — первый рендер модалок
 * с заметками становится заметно легче.
 */
export const RichNoteEditor = dynamic(
  () => import("./RichNoteEditor").then((m) => m.RichNoteEditor),
  {
    ssr: false,
    loading: () => (
      <div
        className="min-h-[120px] rounded-xl border animate-pulse"
        style={{
          borderColor: "var(--app-border)",
          background: "var(--app-border-subtle)",
        }}
      />
    ),
  }
);

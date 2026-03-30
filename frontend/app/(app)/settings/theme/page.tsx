"use client";

import { useState, useEffect } from "react";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { useTheme } from "next-themes";
import { ArrowLeft, Check, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { clsx } from "clsx";

const THEME_KEY = "finlife_color_theme";

interface ThemeDef {
  id: string;
  name: string;
  desc: string;
  mode: "dark" | "light";
  preview: { bg: string; sidebar: string; accent: string; card: string };
}

const THEMES: ThemeDef[] = [
  {
    id: "obsidian",
    name: "Obsidian",
    desc: "Тёмно-синий + индиго. Как Linear.",
    mode: "dark",
    preview: { bg: "#070b16", sidebar: "#0c1122", accent: "#6366f1", card: "#1E2636" },
  },
  {
    id: "graphite",
    name: "Graphite",
    desc: "Тёплый серый без синевы. Как Notion Dark.",
    mode: "dark",
    preview: { bg: "#111111", sidebar: "#161616", accent: "#888888", card: "#1c1c1c" },
  },
  {
    id: "midnight",
    name: "Midnight",
    desc: "Чистый чёрный. OLED-режим.",
    mode: "dark",
    preview: { bg: "#000000", sidebar: "#000000", accent: "#818cf8", card: "#0a0a0a" },
  },
  {
    id: "snow",
    name: "Snow",
    desc: "Тёплый белый. Как Things 3.",
    mode: "light",
    preview: { bg: "#FAFAF9", sidebar: "#FFFFFF", accent: "#4F46E5", card: "#FFFFFF" },
  },
  {
    id: "emerald",
    name: "Emerald",
    desc: "Тёмный + зелёный акцент. Финансовый стиль.",
    mode: "dark",
    preview: { bg: "#070F0B", sidebar: "#0A1510", accent: "#10B981", card: "#0f1f18" },
  },
];

function applyColorTheme(themeId: string) {
  document.documentElement.setAttribute("data-color-theme", themeId);
  localStorage.setItem(THEME_KEY, themeId);
}

export default function ThemeSettingsPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [activeTheme, setActiveTheme] = useState("obsidian");

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) setActiveTheme(saved);
  }, []);

  function selectTheme(theme: ThemeDef) {
    setActiveTheme(theme.id);
    applyColorTheme(theme.id);
    // Switch dark/light mode if needed
    if (theme.mode === "light" && isDark) setTheme("light");
    if (theme.mode === "dark" && !isDark) setTheme("dark");
  }

  return (
    <>
      <AppTopbar title="Тема оформления" />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-lg space-y-5">

          <Link href="/settings" className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:opacity-80" style={{ color: "var(--t-faint)" }}>
            <ArrowLeft size={14} /> Настройки
          </Link>

          <div className="grid grid-cols-1 gap-3">
            {THEMES.map((theme) => {
              const selected = activeTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  onClick={() => selectTheme(theme)}
                  className={clsx(
                    "w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all",
                    selected
                      ? "border-indigo-500/50 bg-indigo-500/[0.06]"
                      : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                  )}
                >
                  {/* Preview swatch */}
                  <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-white/[0.08] relative" style={{ background: theme.preview.bg }}>
                    {/* Sidebar bar */}
                    <div className="absolute left-0 top-0 bottom-0 w-3" style={{ background: theme.preview.sidebar }} />
                    {/* Card area */}
                    <div className="absolute right-1.5 top-1.5 w-7 h-4 rounded-sm" style={{ background: theme.preview.card }} />
                    {/* Accent dot */}
                    <div className="absolute right-2 bottom-2 w-2.5 h-2.5 rounded-full" style={{ background: theme.preview.accent }} />
                    {/* Mode icon */}
                    <div className="absolute left-[14px] bottom-1.5">
                      {theme.mode === "dark" ? <Moon size={8} className="text-white/40" /> : <Sun size={8} className="text-black/40" />}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>
                        {theme.name}
                      </p>
                      <span className={clsx(
                        "text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded",
                        theme.mode === "dark" ? "bg-white/[0.06] text-white/40" : "bg-black/[0.06] text-black/40"
                      )}>
                        {theme.mode === "dark" ? "Dark" : "Light"}
                      </span>
                    </div>
                    <p className="text-[12px] mt-0.5" style={{ color: "var(--t-faint)" }}>
                      {theme.desc}
                    </p>
                  </div>

                  {selected && (
                    <span className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">
                      <Check size={13} className="text-white" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </>
  );
}

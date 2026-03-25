"use client";

import { AppTopbar } from "@/components/layout/AppTopbar";
import { PageTabs } from "@/components/layout/PageTabs";
import Link from "next/link";
import {
  User, Bell, Palette, Shield, Database, HelpCircle,
  ChevronRight,
} from "lucide-react";
import { useTheme } from "next-themes";

const SETTINGS_ITEMS = [
  {
    href: "/profile",
    icon: User,
    label: "Профиль",
    desc: "Аккаунт, XP, активность",
    color: "#6366f1",
  },
  {
    href: "/notifications",
    icon: Bell,
    label: "Уведомления",
    desc: "Каналы, правила, тихие часы",
    color: "#f59e0b",
  },
  {
    href: "/work-categories",
    icon: Database,
    label: "Категории дел",
    desc: "Типы задач и привычек",
    color: "#8b5cf6",
  },
  {
    href: "/task-presets",
    icon: Shield,
    label: "Шаблоны задач",
    desc: "Быстрое создание из шаблонов",
    color: "#06b6d4",
  },
];

export default function SettingsPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <>
      <AppTopbar title="Настройки" />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-lg space-y-2">
          {SETTINGS_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-4 p-4 rounded-xl border transition-all hover:scale-[1.01]"
                style={{
                  borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                  background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${item.color}12` }}
                >
                  <Icon size={18} style={{ color: item.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>
                    {item.label}
                  </p>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--t-faint)" }}>
                    {item.desc}
                  </p>
                </div>
                <ChevronRight size={16} style={{ color: "var(--t-faint)" }} className="shrink-0" />
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}

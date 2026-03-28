"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import Link from "next/link";
import {
  User, Bell, Database, Shield, Users,
  ChevronRight, Smartphone, Send, Download, CheckCircle2, ExternalLink,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useMe } from "@/hooks/useMe";
import { clsx } from "clsx";

// ── PWA Install Hook ─────────────────────────────────────────────────────────

function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    function handler(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => setIsInstalled(true));

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  }

  return { canInstall: !!deferredPrompt, isInstalled, install };
}

// ── Settings Items ───────────────────────────────────────────────────────────

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
    desc: "Список уведомлений",
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

// ── Page ─────────────────────────────────────────────────────────────────────

interface NotifSettings {
  telegram_connected: boolean;
  telegram_chat_id: string | null;
}

export default function SettingsPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const pwa = usePwaInstall();
  const { data: me } = useMe();

  const { data: notifSettings } = useQuery<NotifSettings>({
    queryKey: ["notification-settings"],
    queryFn: () => api.get("/api/v2/notification-settings"),
    staleTime: 30_000,
  });

  const tgConnected = notifSettings?.telegram_connected ?? false;

  const cardBorder = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const cardBg = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)";

  return (
    <>
      <AppTopbar title="Настройки" />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-lg space-y-6">

          {/* ── Notifications Setup Banner ── */}
          <div
            className="rounded-xl border p-5 space-y-4"
            style={{ borderColor: cardBorder, background: cardBg }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/10">
                <Bell size={16} className="text-amber-400" />
              </div>
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>
                Каналы уведомлений
              </h2>
            </div>

            {/* PWA Install */}
            <div
              className="flex items-start gap-4 p-4 rounded-xl border"
              style={{ borderColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" }}
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-indigo-500/10">
                <Smartphone size={18} className="text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>
                    Push-уведомления
                  </p>
                  {pwa.isInstalled && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
                      <CheckCircle2 size={10} /> Установлено
                    </span>
                  )}
                </div>
                <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--t-faint)" }}>
                  Добавьте FinLife на главный экран, чтобы получать мгновенные push-уведомления о задачах, подписках и платежах.
                </p>
                {!pwa.isInstalled && (
                  <div className="mt-3">
                    {pwa.canInstall ? (
                      <button
                        onClick={pwa.install}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all hover:opacity-90"
                        style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}
                      >
                        <Download size={14} /> Установить приложение
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium" style={{ color: "var(--t-secondary)" }}>
                          Как установить:
                        </p>
                        <div className="space-y-1.5 text-[11px]" style={{ color: "var(--t-faint)" }}>
                          <p><span className="font-medium" style={{ color: "var(--t-secondary)" }}>iOS Safari:</span> Нажмите «Поделиться» → «На экран Домой»</p>
                          <p><span className="font-medium" style={{ color: "var(--t-secondary)" }}>Android Chrome:</span> Меню ⋮ → «Добавить на главный экран»</p>
                          <p><span className="font-medium" style={{ color: "var(--t-secondary)" }}>Desktop Chrome:</span> Иконка в адресной строке → «Установить»</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Telegram Bot */}
            <div
              className="flex items-start gap-4 p-4 rounded-xl border"
              style={{ borderColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" }}
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-sky-500/10">
                <Send size={18} className="text-sky-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>
                    Telegram-бот
                  </p>
                  {tgConnected && (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
                      <CheckCircle2 size={10} /> Подключён
                    </span>
                  )}
                </div>
                <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--t-faint)" }}>
                  {tgConnected
                    ? `Уведомления отправляются в чат ${notifSettings?.telegram_chat_id}`
                    : "Получайте уведомления прямо в Telegram: задачи, подписки, платежи."
                  }
                </p>
                <div className="mt-3">
                  <Link
                    href="/settings/notifications"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all hover:opacity-90"
                    style={{ background: tgConnected ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)" }}
                  >
                    <Send size={14} /> {tgConnected ? "Настройки" : "Подключить Telegram"}
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* ── Settings Links ── */}
          <div className="space-y-2">
            {SETTINGS_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-4 p-4 rounded-xl border transition-all hover:scale-[1.01]"
                  style={{ borderColor: cardBorder, background: cardBg }}
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

            {/* Contacts — admin only */}
            {notifSettings && me?.is_admin && (
              <Link
                href="/contacts"
                className="flex items-center gap-4 p-4 rounded-xl border transition-all hover:scale-[1.01]"
                style={{ borderColor: cardBorder, background: cardBg }}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#10b98112" }}>
                  <Users size={18} style={{ color: "#10b981" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>Участники</p>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--t-faint)" }}>Управление участниками подписок</p>
                </div>
                <ChevronRight size={16} style={{ color: "var(--t-faint)" }} className="shrink-0" />
              </Link>
            )}
          </div>

        </div>
      </main>
    </>
  );
}

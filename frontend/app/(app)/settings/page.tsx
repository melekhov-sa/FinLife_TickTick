"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import Link from "next/link";
import {
  User, Bell, Database, Shield, Users, Palette,
  ChevronRight, Smartphone, Send, Download, CheckCircle2, Zap, Sparkles,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useMe } from "@/hooks/useMe";
import { clsx } from "clsx";
import { Switch } from "@/components/primitives/Switch";

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
  {
    href: "/settings/theme",
    icon: Palette,
    label: "Тема оформления",
    desc: "Obsidian, Graphite, Midnight, Snow, Emerald",
    color: "#ec4899",
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

interface NotifSettings {
  telegram_connected: boolean;
  telegram_chat_id: string | null;
}

function PushActions() {
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleReconnect() {
    setBusy(true);
    setResult(null);
    try {
      const { unsubscribePush, subscribePush } = await import("@/lib/push");
      await unsubscribePush();
      const ok = await subscribePush();
      setResult(ok ? "Push подключены! Нажмите «Тест»." : "Не удалось подключить push. Разрешите уведомления в настройках браузера.");
    } catch {
      setResult("Ошибка подключения");
    }
    setTimeout(() => setResult(null), 5000);
    setBusy(false);
  }

  async function handleTest() {
    setBusy(true);
    setResult(null);
    try {
      const res = await api.post<{ ok: boolean; sent: number }>("/api/v2/push/test");
      setResult(res.sent > 0 ? "Push отправлен! Проверьте уведомления." : "Нет подписок. Нажмите «Подключить push».");
    } catch {
      setResult("Ошибка отправки");
    }
    setTimeout(() => setResult(null), 5000);
    setBusy(false);
  }

  return (
    <div className="p-3 rounded-xl border space-y-3" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleReconnect}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 touch-manipulation"
          style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}
        >
          <Smartphone size={14} />
          {busy ? "..." : "Подключить push"}
        </button>
        <button
          onClick={handleTest}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 touch-manipulation"
          style={{ background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" }}
        >
          <Zap size={14} />
          {busy ? "..." : "Тест push"}
        </button>
      </div>
      {result && (
        <p className={clsx(
          "text-[12px] font-medium",
          result.includes("отправлен") || result.includes("подключены") ? "text-emerald-400" : "text-amber-400"
        )}>
          {result}
        </p>
      )}
    </div>
  );
}

function AiDigestToggle() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const { mutate: toggle, isPending } = useMutation({
    mutationFn: (enabled: boolean) => api.patch("/api/v2/me/ai-digest", { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });

  if (!me) return null;
  const available = me.ai_digest_available;
  const enabled = me.ai_digest_enabled;

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-violet-500/10">
        <Sparkles size={18} className="text-violet-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>
          AI-комментарий в дайджестах
        </p>
        <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--t-faint)" }}>
          {available
            ? "OpenAI оценит твою неделю и даст короткий мотивирующий комментарий в конце каждого дайджеста."
            : "Функция временно недоступна: администратор не настроил ключ OpenAI на сервере."}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Switch
            checked={enabled}
            onChange={(v) => available && toggle(v)}
            disabled={!available || isPending}
          />
          <span className="text-[13px]" style={{ color: "var(--t-secondary)" }}>
            {isPending ? "..." : enabled ? "Включено" : "Выключено"}
          </span>
        </div>
      </div>
    </div>
  );
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

            {/* Test Push Button */}
            <PushActions />

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

          {/* ── AI Digest Toggle ── */}
          <div
            className="rounded-xl border p-5"
            style={{ borderColor: cardBorder, background: cardBg }}
          >
            <AiDigestToggle />
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
            {/* AI Settings -- admin only */}
            {me?.is_admin && (
              <Link
                href="/settings/ai"
                className="flex items-center gap-4 p-4 rounded-xl border transition-all hover:scale-[1.01]"
                style={{ borderColor: cardBorder, background: cardBg }}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#8b5cf612" }}>
                  <Sparkles size={18} style={{ color: "#8b5cf6" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>AI настройки</p>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--t-faint)" }}>OpenAI API ключ, тест соединения</p>
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

"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/primitives/PageHeader";
import { api } from "@/lib/api";
import Link from "next/link";
import {
  User, Bell, Database, Shield, Users, Palette,
  ChevronRight, Smartphone, Send, Download, CheckCircle2, Zap, Sparkles,
  ScanFace } from "lucide-react";
import { useMe } from "@/hooks/useMe";
import { Switch } from "@/components/primitives/Switch";
import { isNative, biometryAvailable, bioLockEnabled, setBioLockEnabled } from "@/lib/native";
import { Button } from "@/components/primitives/Button";
import { Card } from "@/components/primitives/Card";

// ── PWA Install Hook ─────────────────────────────────────────────────────────

function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
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
  { href: "/profile",            icon: User,       label: "Профиль",           desc: "Аккаунт, XP, активность",                          color: "var(--app-accent)" },
  { href: "/notifications",      icon: Bell,       label: "Уведомления",       desc: "Список уведомлений",                               color: "#f59e0b" },
  { href: "/work-categories",    icon: Database,   label: "Категории дел",     desc: "Типы задач и привычек",                            color: "var(--app-accent)" },
  { href: "/task-presets",       icon: Shield,     label: "Шаблоны задач",     desc: "Быстрое создание из шаблонов",                     color: "#06b6d4" },
  { href: "/settings/theme",     icon: Palette,    label: "Тема оформления",   desc: "Obsidian, Graphite, Midnight, Snow, Emerald",      color: "#ec4899" },
  { href: "/settings/caldav",    icon: Smartphone, label: "iPhone Reminders",  desc: "CalDAV-синхронизация задач с Напоминаниями",        color: "#10b981" },
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
    <Card padding="sm" className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Smartphone size={14} />}
          disabled={busy}
          loading={busy}
          onClick={handleReconnect}
        >
          Подключить push
        </Button>
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Zap size={14} />}
          disabled={busy}
          loading={busy}
          onClick={handleTest}
          className="from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500"
        >
          Тест push
        </Button>
      </div>
      {result && (
        <p className={
          result.includes("отправлен") || result.includes("подключены")
            ? "text-[12px] font-medium text-emerald-400"
            : "text-[12px] font-medium text-amber-400"
        }>
          {result}
        </p>
      )}
    </Card>
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
    <Card padding="md" className="flex items-start gap-4">
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
    </Card>
  );
}

function FaceIdToggle() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isNative()) return;
    setEnabled(bioLockEnabled());
    void biometryAvailable().then(setAvailable);
  }, []);

  if (!isNative()) return null;

  return (
    <Card padding="md" className="flex items-start gap-4">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-emerald-500/10">
        <ScanFace size={18} className="text-emerald-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>
          Face ID при входе
        </p>
        <p className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--t-faint)" }}>
          {available
            ? "Блокировать приложение при запуске и после 3 минут в фоне — разблокировка по Face ID."
            : "Биометрия недоступна на этом устройстве."}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Switch
            checked={enabled}
            onChange={(v) => {
              if (!available) return;
              setBioLockEnabled(v);
              setEnabled(v);
            }}
            disabled={!available}
          />
          <span className="text-[13px]" style={{ color: "var(--t-secondary)" }}>
            {enabled ? "Включено" : "Выключено"}
          </span>
        </div>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const pwa = usePwaInstall();
  const { data: me } = useMe();

  const { data: notifSettings } = useQuery<NotifSettings>({
    queryKey: ["notification-settings"],
    queryFn: () => api.get("/api/v2/notification-settings"),
    staleTime: 30_000,
  });

  const tgConnected = notifSettings?.telegram_connected ?? false;

  return (
    <>
      <PageHeader title="Настройки" density="compact" />
      <main className="flex-1 p-6">
        <div className="max-w-lg space-y-6">

          {/* ── Notifications Setup Banner ── */}
          <Card padding="lg" className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/10">
                <Bell size={16} className="text-amber-400" />
              </div>
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>
                Каналы уведомлений
              </h2>
            </div>

            {/* PWA Install */}
            <Card padding="md" className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-[var(--app-accent-light)]">
                <Smartphone size={18} className="text-[var(--app-accent)]" />
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
                      <Button variant="primary" size="sm" leftIcon={<Download size={14} />} onClick={pwa.install}>
                        Установить приложение
                      </Button>
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
            </Card>

            {/* Test Push Button */}
            <PushActions />

            {/* Telegram Bot */}
            <Card padding="md" className="flex items-start gap-4">
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
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-[#fff] transition-all hover:opacity-90"
                    style={{ background: tgConnected ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)" }}
                  >
                    <Send size={14} /> {tgConnected ? "Настройки" : "Подключить Telegram"}
                  </Link>
                </div>
              </div>
            </Card>
          </Card>

          {/* ── Face ID (только нативное приложение) ── */}
          <FaceIdToggle />

          {/* ── AI Digest Toggle ── */}
          <Card padding="lg">
            <AiDigestToggle />
          </Card>

          {/* ── Settings Links ── */}
          <div className="space-y-2">
            {SETTINGS_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-4 p-4 rounded-xl border transition-all hover:scale-[1.01] border-slate-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.02]"
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
                className="flex items-center gap-4 p-4 rounded-xl border transition-all hover:scale-[1.01] border-slate-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.02]"
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

            {/* AI Settings — admin only */}
            {me?.is_admin && (
              <Link
                href="/settings/ai"
                className="flex items-center gap-4 p-4 rounded-xl border transition-all hover:scale-[1.01] border-slate-200 bg-white dark:border-white/[0.06] dark:bg-white/[0.02]"
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: "color-mix(in srgb, var(--app-accent) 7%, transparent)" }}>
                  <Sparkles size={18} style={{ color: "var(--app-accent)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>API ключи</p>
                  <p className="text-[12px] mt-0.5" style={{ color: "var(--t-faint)" }}>OpenAI, Кинопоиск и другие интеграции</p>
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

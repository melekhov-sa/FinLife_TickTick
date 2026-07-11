"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/primitives/PageHeader";
import { api } from "@/lib/api";
import {
  Bell, BellOff, Send, Smartphone, Download,
  CheckCircle2, XCircle, Moon, Zap, ArrowLeft,
  MessageCircle, AlertTriangle, Volume2, VolumeX,
} from "lucide-react";
import Link from "next/link";
import { getPushState, subscribePush, unsubscribePush, testPush } from "@/lib/push";
import { Switch } from "@/components/primitives/Switch";
import { TimeInput } from "@/components/primitives/TimeInput";
import { Button } from "@/components/primitives/Button";
import { Card } from "@/components/primitives/Card";
import { Input } from "@/components/primitives/Input";
import { Skeleton } from "@/components/primitives/Skeleton";

// ── Types ────────────────────────────────────────────────────────────────────

interface Settings {
  enabled: boolean;
  quiet_start: string | null;
  quiet_end: string | null;
  ch_telegram: boolean;
  ch_email: boolean;
  telegram_connected: boolean;
  telegram_chat_id: string | null;
  telegram_bot_token_set: boolean;
  rules: { id: number; code: string; title: string; description: string; enabled: boolean }[];
}

// ── PWA Install Hook ─────────────────────────────────────────────────────────

function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }
    function handler(e: Event) { e.preventDefault(); setDeferredPrompt(e); }
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const r = await deferredPrompt.userChoice;
    if (r.outcome === "accepted") setIsInstalled(true);
    setDeferredPrompt(null);
  }

  return { canInstall: !!deferredPrompt, isInstalled, install };
}

// ── Page ─────────────────────────────────────────────────────────────────────

function PushSection({ pwa, setSaved }: {
  pwa: { canInstall: boolean; isInstalled: boolean; install: () => Promise<void> };
  setSaved: (s: string) => void;
}) {
  const [pushState, setPushState] = useState<"subscribed" | "prompt" | "denied" | "unsupported" | "loading">("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState().then(setPushState);
  }, []);

  async function handleSubscribe() {
    setBusy(true);
    try {
      const ok = await subscribePush();
      if (ok) {
        setPushState("subscribed");
        setSaved("Push-уведомления включены");
        setTimeout(() => setSaved(""), 2000);
      } else {
        setSaved("Не удалось подключить push. Проверьте разрешения браузера.");
        setTimeout(() => setSaved(""), 4000);
      }
    } catch {
      setPushState(Notification.permission === "denied" ? "denied" : "prompt");
      setSaved("Ошибка подключения push-уведомлений");
      setTimeout(() => setSaved(""), 4000);
    }
    setBusy(false);
  }

  async function handleUnsubscribe() {
    setBusy(true);
    await unsubscribePush();
    setPushState("prompt");
    setSaved("Push-уведомления отключены");
    setTimeout(() => setSaved(""), 2000);
    setBusy(false);
  }

  async function handleReconnect() {
    setBusy(true);
    try {
      await unsubscribePush();
      const ok = await subscribePush();
      if (ok) {
        setPushState("subscribed");
        setSaved("Push переподключены");
      } else {
        setPushState("prompt");
        setSaved("Не удалось переподключить");
      }
    } catch {
      setSaved("Ошибка переподключения");
    }
    setTimeout(() => setSaved(""), 3000);
    setBusy(false);
  }

  async function handleTest() {
    setBusy(true);
    const sent = await testPush();
    setSaved(sent > 0 ? "Тестовое push отправлено" : "Нет активных подписок. Нажмите «Переподключить».");
    setTimeout(() => setSaved(""), 4000);
    setBusy(false);
  }

  return (
    <Card padding="lg" className="space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[var(--app-accent-light)]">
          <Smartphone size={16} className="text-[var(--app-accent)]" />
        </div>
        <div className="flex-1">
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>Push-уведомления</h2>
        </div>
        {pushState === "subscribed" && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
            <CheckCircle2 size={10} /> Включены
          </span>
        )}
        {pushState === "denied" && (
          <span className="flex items-center gap-1 text-[10px] font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-md">
            <XCircle size={10} /> Заблокированы
          </span>
        )}
      </div>

      {pushState === "denied" && (
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--t-faint)" }}>
          Уведомления заблокированы в настройках браузера. Разрешите их в настройках сайта.
        </p>
      )}

      {pushState === "unsupported" && (
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--t-faint)" }}>
          Push не поддерживается в этом браузере. Установите приложение на главный экран.
        </p>
      )}

      {pushState === "prompt" && (
        <>
          <p className="text-[12px] leading-relaxed" style={{ color: "var(--t-faint)" }}>
            Получайте мгновенные уведомления о задачах, подписках и платежах.
          </p>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Volume2 size={14} />}
            disabled={busy}
            loading={busy}
            onClick={handleSubscribe}
          >
            Включить push-уведомления
          </Button>
        </>
      )}

      {pushState === "subscribed" && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<MessageCircle size={13} />}
            disabled={busy}
            loading={busy}
            onClick={handleTest}
          >
            Тест
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Volume2 size={13} />}
            disabled={busy}
            loading={busy}
            onClick={handleReconnect}
          >
            Переподключить
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<VolumeX size={13} />}
            disabled={busy}
            loading={busy}
            onClick={handleUnsubscribe}
            className="text-red-500 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/20 dark:hover:bg-red-500/10"
          >
            Отключить
          </Button>
        </div>
      )}

      {/* PWA install */}
      {!pwa.isInstalled && (pushState === "unsupported" || pushState === "prompt") && (
        <div className="border-t pt-3 mt-2 border-slate-100 dark:border-white/[0.05]">
          {pwa.canInstall ? (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download size={14} />}
              onClick={pwa.install}
            >
              Установить на главный экран
            </Button>
          ) : (
            <div className="space-y-1.5 text-[11px]" style={{ color: "var(--t-faint)" }}>
              <p className="font-medium" style={{ color: "var(--t-secondary)" }}>Установить приложение:</p>
              <p><span className="font-medium" style={{ color: "var(--t-secondary)" }}>iOS Safari:</span> Поделиться → На экран Домой</p>
              <p><span className="font-medium" style={{ color: "var(--t-secondary)" }}>Android Chrome:</span> Меню ⋮ → Добавить на главный экран</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function NotificationSettingsPage() {
  const qc = useQueryClient();
  const pwa = usePwaInstall();

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["notification-settings"],
    queryFn: () => api.get("/api/v2/notification-settings"),
  });

  const [enabled, setEnabled] = useState(true);
  const [chTelegram, setChTelegram] = useState(false);
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [saved, setSaved] = useState("");
  const [tgError, setTgError] = useState("");

  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setChTelegram(settings.ch_telegram);
    setQuietStart(settings.quiet_start || "");
    setQuietEnd(settings.quiet_end || "");
    setChatId(settings.telegram_chat_id || "");
    if (settings.telegram_bot_token_set) setBotToken("••••••••••••");
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: () => api.post("/api/v2/notification-settings", {
      enabled,
      ch_telegram: chTelegram,
      ch_email: false,
      quiet_start: quietStart || null,
      quiet_end: quietEnd || null,
    }),
    onSuccess: () => {
      setSaved("Настройки сохранены");
      qc.invalidateQueries({ queryKey: ["notification-settings"] });
      setTimeout(() => setSaved(""), 2000);
    },
  });

  const tgMut = useMutation({
    mutationFn: () => api.post("/api/v2/notification-settings/telegram", {
      bot_token: botToken.includes("••") ? "" : botToken,
      chat_id: chatId,
    }),
    onSuccess: () => {
      setSaved("Telegram сохранён");
      qc.invalidateQueries({ queryKey: ["notification-settings"] });
      setTgError("");
      setTimeout(() => setSaved(""), 2000);
    },
    onError: (e: any) => setTgError(e.message || "Ошибка"),
  });

  const disconnectMut = useMutation({
    mutationFn: () => api.post("/api/v2/notification-settings/telegram/disconnect"),
    onSuccess: () => {
      setSaved("Telegram отключён");
      setBotToken("");
      setChatId("");
      qc.invalidateQueries({ queryKey: ["notification-settings"] });
      setTimeout(() => setSaved(""), 2000);
    },
    onError: (e: any) => setTgError(e.message || "Ошибка"),
  });

  const testMut = useMutation({
    mutationFn: () => api.post("/api/v2/notification-settings/telegram/test"),
    onSuccess: () => { setSaved("Тестовое сообщение отправлено"); setTimeout(() => setSaved(""), 3000); },
    onError: (e: any) => setTgError(e.message || "Ошибка отправки"),
  });

  if (isLoading) {
    return (
      <>
        <PageHeader title="Уведомления" density="compact" />
        <main className="flex-1 p-6">
          <div className="max-w-lg space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rect" height={128} className="rounded-xl" />
            ))}
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Настройки уведомлений" density="compact" />
      <main className="flex-1 p-6">
        <div className="max-w-lg space-y-5">

          {/* Back link */}
          <Link href="/settings" className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:opacity-80" style={{ color: "var(--t-faint)" }}>
            <ArrowLeft size={14} /> Настройки
          </Link>

          {/* Success flash */}
          {saved && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[13px] font-medium">
              <CheckCircle2 size={14} /> {saved}
            </div>
          )}

          {/* ── General ── */}
          <Card padding="lg" className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/10">
                <Bell size={16} className="text-amber-400" />
              </div>
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>Общие</h2>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={enabled} onChange={setEnabled} />
              <span className="text-[14px]" style={{ color: "var(--t-primary)" }}>
                Уведомления {enabled ? "включены" : "выключены"}
              </span>
              {enabled ? <Bell size={14} className="text-emerald-400" /> : <BellOff size={14} className="text-red-400" />}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Moon size={14} style={{ color: "var(--t-faint)" }} />
                <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-faint)" }}>Тихий режим</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>с</span>
                <TimeInput value={quietStart} onChange={setQuietStart} size="sm" className="w-[110px]" />
                <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>по</span>
                <TimeInput value={quietEnd} onChange={setQuietEnd} size="sm" className="w-[110px]" />
              </div>
              <p className="text-[11px] mt-1" style={{ color: "var(--t-faint)" }}>Telegram и email не отправляются в это время</p>
            </div>

            <Button
              variant="primary"
              size="sm"
              disabled={saveMut.isPending}
              loading={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              Сохранить
            </Button>
          </Card>

          {/* ── Push Notifications ── */}
          <PushSection pwa={pwa} setSaved={setSaved} />

          {/* ── Telegram ── */}
          <Card padding="lg" className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-sky-500/10">
                <Send size={16} className="text-sky-400" />
              </div>
              <div className="flex-1">
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>Telegram-бот</h2>
              </div>
              {settings?.telegram_connected ? (
                <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                  <CheckCircle2 size={10} /> Подключён
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-medium text-white/40 bg-white/5 px-2 py-0.5 rounded-md">
                  <XCircle size={10} /> Не подключён
                </span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={chTelegram} onChange={setChTelegram} />
              <span className="text-[13px]" style={{ color: "var(--t-primary)" }}>Отправлять уведомления в Telegram</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider mb-1 block" style={{ color: "var(--t-faint)" }}>
                  Токен бота
                </label>
                <Input
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  onFocus={() => { if (botToken.includes("••")) setBotToken(""); }}
                  placeholder="123456789:AAF..."
                  className="font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider mb-1 block" style={{ color: "var(--t-faint)" }}>
                  Chat ID
                </label>
                <Input
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="123456789"
                  className="font-mono"
                />
              </div>
            </div>

            {tgError && (
              <div className="flex items-center gap-2 text-[12px] text-red-400">
                <AlertTriangle size={13} /> {tgError}
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Send size={13} />}
                disabled={tgMut.isPending}
                loading={tgMut.isPending}
                onClick={() => tgMut.mutate()}
                className="from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500"
              >
                Сохранить
              </Button>
              {settings?.telegram_connected && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<MessageCircle size={13} />}
                    disabled={testMut.isPending}
                    loading={testMut.isPending}
                    onClick={() => { setTgError(""); testMut.mutate(); }}
                  >
                    Тест
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={disconnectMut.isPending}
                    loading={disconnectMut.isPending}
                    onClick={() => { if (confirm("Отключить Telegram-бота?")) disconnectMut.mutate(); }}
                    className="text-red-500 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-500/20 dark:hover:bg-red-500/10"
                  >
                    Отключить
                  </Button>
                </>
              )}
            </div>

            {/* Instructions */}
            <div className="rounded-lg p-3 space-y-2 text-[11px] bg-slate-50 dark:bg-white/[0.02]" style={{ color: "var(--t-faint)" }}>
              <p className="font-semibold" style={{ color: "var(--t-secondary)" }}>Как подключить:</p>
              <p>1. Откройте <span className="font-mono text-sky-400">@BotFather</span> в Telegram</p>
              <p>2. Отправьте <span className="font-mono text-sky-400">/newbot</span> и следуйте инструкциям</p>
              <p>3. Скопируйте токен бота сюда</p>
              <p>4. Напишите боту любое сообщение</p>
              <p>5. Откройте <span className="font-mono text-sky-400 break-all">api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</span></p>
              <p>6. Найдите <span className="font-mono text-sky-400">chat.id</span> и вставьте в поле выше</p>
            </div>
          </Card>

          {/* ── Rules ── */}
          {settings?.rules && settings.rules.length > 0 && (
            <Card padding="lg" className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-500/10">
                  <Zap size={16} className="text-purple-400" />
                </div>
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>Правила</h2>
              </div>
              <div className="space-y-0.5">
                {settings.rules.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-white/[0.04]">
                    <div>
                      <p className="text-[13px] font-medium" style={{ color: "var(--t-primary)" }}>{r.title}</p>
                      {r.description && <p className="text-[11px] mt-0.5" style={{ color: "var(--t-faint)" }}>{r.description}</p>}
                    </div>
                    <span className={r.enabled
                      ? "text-[11px] font-semibold px-2 py-0.5 rounded-md text-emerald-400 bg-emerald-500/10"
                      : "text-[11px] font-semibold px-2 py-0.5 rounded-md text-red-400 bg-red-500/10"
                    }>
                      {r.enabled ? "Вкл" : "Выкл"}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

        </div>
      </main>
    </>
  );
}

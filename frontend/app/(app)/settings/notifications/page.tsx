"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import { clsx } from "clsx";
import {
  Bell, BellOff, Send, Smartphone, Download,
  CheckCircle2, XCircle, Moon, Zap, ArrowLeft,
  MessageCircle, AlertTriangle, Volume2, VolumeX,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { getPushState, subscribePush, unsubscribePush, testPush } from "@/lib/push";

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

function PushSection({ cardBorder, cardBg, pwa, setSaved }: {
  cardBorder: string; cardBg: string;
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
    <div className="rounded-xl border p-5 space-y-3" style={{ borderColor: cardBorder, background: cardBg }}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-500/10">
          <Smartphone size={16} className="text-indigo-400" />
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
          <button
            onClick={handleSubscribe}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}
          >
            <Volume2 size={14} /> {busy ? "..." : "Включить push-уведомления"}
          </button>
        </>
      )}

      {pushState === "subscribed" && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleTest}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium border transition-all hover:bg-white/[0.04] disabled:opacity-50"
            style={{ borderColor: cardBorder, color: "var(--t-secondary)" }}
          >
            <MessageCircle size={13} /> {busy ? "..." : "Тест"}
          </button>
          <button
            onClick={handleReconnect}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium border transition-all hover:bg-indigo-500/10 disabled:opacity-50"
            style={{ borderColor: "rgba(99,102,241,0.2)", color: "#6366f1" }}
          >
            <Volume2 size={13} /> {busy ? "..." : "Переподключить"}
          </button>
          <button
            onClick={handleUnsubscribe}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium border transition-all hover:bg-red-500/10 disabled:opacity-50"
            style={{ borderColor: "rgba(239,68,68,0.2)", color: "#ef4444" }}
          >
            <VolumeX size={13} /> {busy ? "..." : "Отключить"}
          </button>
        </div>
      )}

      {/* PWA install */}
      {!pwa.isInstalled && (pushState === "unsupported" || pushState === "prompt") && (
        <div className="border-t pt-3 mt-2" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          {pwa.canInstall ? (
            <button
              onClick={pwa.install}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium border transition-all hover:bg-white/[0.04]"
              style={{ borderColor: cardBorder, color: "var(--t-secondary)" }}
            >
              <Download size={14} /> Установить на главный экран
            </button>
          ) : (
            <div className="space-y-1.5 text-[11px]" style={{ color: "var(--t-faint)" }}>
              <p className="font-medium" style={{ color: "var(--t-secondary)" }}>Установить приложение:</p>
              <p><span className="font-medium" style={{ color: "var(--t-secondary)" }}>iOS Safari:</span> Поделиться → На экран Домой</p>
              <p><span className="font-medium" style={{ color: "var(--t-secondary)" }}>Android Chrome:</span> Меню ⋮ → Добавить на главный экран</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function NotificationSettingsPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const qc = useQueryClient();
  const pwa = usePwaInstall();

  const { data: settings, isLoading } = useQuery<Settings>({
    queryKey: ["notification-settings"],
    queryFn: () => api.get("/api/v2/notification-settings"),
  });

  // Local form state
  const [enabled, setEnabled] = useState(true);
  const [chTelegram, setChTelegram] = useState(false);
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [saved, setSaved] = useState("");
  const [tgError, setTgError] = useState("");

  // Sync from server
  useEffect(() => {
    if (!settings) return;
    setEnabled(settings.enabled);
    setChTelegram(settings.ch_telegram);
    setQuietStart(settings.quiet_start || "");
    setQuietEnd(settings.quiet_end || "");
    setChatId(settings.telegram_chat_id || "");
    if (settings.telegram_bot_token_set) setBotToken("••••••••••••");
  }, [settings]);

  // Mutations
  const saveMut = useMutation({
    mutationFn: () => api.post("/api/v2/notification-settings", {
      enabled,
      ch_telegram: chTelegram,
      ch_email: false,
      quiet_start: quietStart || null,
      quiet_end: quietEnd || null,
    }),
    onSuccess: () => { setSaved("Настройки сохранены"); qc.invalidateQueries({ queryKey: ["notification-settings"] }); setTimeout(() => setSaved(""), 2000); },
  });

  const tgMut = useMutation({
    mutationFn: () => api.post("/api/v2/notification-settings/telegram", {
      bot_token: botToken.includes("••") ? "" : botToken,
      chat_id: chatId,
    }),
    onSuccess: () => { setSaved("Telegram сохранён"); qc.invalidateQueries({ queryKey: ["notification-settings"] }); setTgError(""); setTimeout(() => setSaved(""), 2000); },
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

  const cardBorder = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const cardBg = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)";
  const inputCls = "w-full px-3 py-2.5 rounded-lg text-[14px] bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 placeholder:text-white/20 font-mono";

  if (isLoading) {
    return (
      <>
        <AppTopbar title="Уведомления" />
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-lg animate-pulse space-y-4">
            {[1,2,3].map(i => <div key={i} className="h-32 rounded-xl" style={{ background: cardBg }} />)}
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AppTopbar title="Настройки уведомлений" />
      <main className="flex-1 overflow-auto p-6">
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
          <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: cardBorder, background: cardBg }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/10">
                <Bell size={16} className="text-amber-400" />
              </div>
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>Общие</h2>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-500"
              />
              <span className="text-[14px]" style={{ color: "var(--t-primary)" }}>
                Уведомления {enabled ? "включены" : "выключены"}
              </span>
              {enabled ? <Bell size={14} className="text-emerald-400" /> : <BellOff size={14} className="text-red-400" />}
            </label>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Moon size={14} style={{ color: "var(--t-faint)" }} />
                <span className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--t-faint)" }}>Тихий режим</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>с</span>
                <input type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} className="px-2 py-1.5 rounded-lg text-[13px] bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 [color-scheme:dark]" style={{ color: "var(--t-primary)" }} />
                <span className="text-[12px]" style={{ color: "var(--t-faint)" }}>по</span>
                <input type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} className="px-2 py-1.5 rounded-lg text-[13px] bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 [color-scheme:dark]" style={{ color: "var(--t-primary)" }} />
              </div>
              <p className="text-[11px] mt-1" style={{ color: "var(--t-faint)" }}>Telegram и email не отправляются в это время</p>
            </div>

            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="px-5 py-2 rounded-lg text-[13px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}
            >
              {saveMut.isPending ? "..." : "Сохранить"}
            </button>
          </div>

          {/* ── Push Notifications ── */}
          <PushSection cardBorder={cardBorder} cardBg={cardBg} pwa={pwa} setSaved={setSaved} />

          {/* ── Telegram ── */}
          <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: cardBorder, background: cardBg }}>
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

            {/* Enable channel checkbox */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={chTelegram}
                onChange={(e) => setChTelegram(e.target.checked)}
                className="w-4 h-4 rounded accent-sky-500"
              />
              <span className="text-[13px]" style={{ color: "var(--t-primary)" }}>Отправлять уведомления в Telegram</span>
            </label>

            {/* Setup fields */}
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider mb-1 block" style={{ color: "var(--t-faint)" }}>
                  Токен бота
                </label>
                <input
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  onFocus={() => { if (botToken.includes("••")) setBotToken(""); }}
                  placeholder="123456789:AAF..."
                  className={inputCls}
                  style={{ color: "var(--t-primary)" }}
                />
              </div>
              <div>
                <label className="text-[11px] font-medium uppercase tracking-wider mb-1 block" style={{ color: "var(--t-faint)" }}>
                  Chat ID
                </label>
                <input
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="123456789"
                  className={inputCls}
                  style={{ color: "var(--t-primary)" }}
                />
              </div>
            </div>

            {tgError && (
              <div className="flex items-center gap-2 text-[12px] text-red-400">
                <AlertTriangle size={13} /> {tgError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => tgMut.mutate()}
                disabled={tgMut.isPending}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)" }}
              >
                {tgMut.isPending ? "..." : "Сохранить"}
              </button>
              {settings?.telegram_connected && (
                <>
                  <button
                    onClick={() => { setTgError(""); testMut.mutate(); }}
                    disabled={testMut.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium border transition-all hover:bg-white/[0.04] disabled:opacity-50"
                    style={{ borderColor: cardBorder, color: "var(--t-secondary)" }}
                  >
                    <MessageCircle size={13} /> {testMut.isPending ? "..." : "Тест"}
                  </button>
                  <button
                    onClick={() => { if (confirm("Отключить Telegram-бота?")) disconnectMut.mutate(); }}
                    disabled={disconnectMut.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium border transition-all hover:bg-red-500/10 disabled:opacity-50"
                    style={{ borderColor: "rgba(239,68,68,0.2)", color: "#ef4444" }}
                  >
                    {disconnectMut.isPending ? "..." : "Отключить"}
                  </button>
                </>
              )}
            </div>

            {/* Instructions */}
            <div className="rounded-lg p-3 space-y-2 text-[11px]" style={{ background: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", color: "var(--t-faint)" }}>
              <p className="font-semibold" style={{ color: "var(--t-secondary)" }}>Как подключить:</p>
              <p>1. Откройте <span className="font-mono text-sky-400">@BotFather</span> в Telegram</p>
              <p>2. Отправьте <span className="font-mono text-sky-400">/newbot</span> и следуйте инструкциям</p>
              <p>3. Скопируйте токен бота сюда</p>
              <p>4. Напишите боту любое сообщение</p>
              <p>5. Откройте <span className="font-mono text-sky-400 break-all">api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</span></p>
              <p>6. Найдите <span className="font-mono text-sky-400">chat.id</span> и вставьте в поле выше</p>
            </div>
          </div>

          {/* ── Rules ── */}
          {settings?.rules && settings.rules.length > 0 && (
            <div className="rounded-xl border p-5 space-y-3" style={{ borderColor: cardBorder, background: cardBg }}>
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-purple-500/10">
                  <Zap size={16} className="text-purple-400" />
                </div>
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>Правила</h2>
              </div>
              <div className="space-y-0.5">
                {settings.rules.map((r) => (
                  <div key={r.id} className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}>
                    <div>
                      <p className="text-[13px] font-medium" style={{ color: "var(--t-primary)" }}>{r.title}</p>
                      {r.description && <p className="text-[11px] mt-0.5" style={{ color: "var(--t-faint)" }}>{r.description}</p>}
                    </div>
                    <span className={clsx("text-[11px] font-semibold px-2 py-0.5 rounded-md", r.enabled ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10")}>
                      {r.enabled ? "Вкл" : "Выкл"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </>
  );
}

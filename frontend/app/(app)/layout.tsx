"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { MobileNav } from "@/components/layout/MobileNav";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { OnboardingModal } from "@/components/layout/OnboardingModal";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { CreateOperationModal } from "@/components/modals/CreateOperationModal";
import { LevelUpOverlay } from "@/components/LevelUpOverlay";
import { useLevelUpWatcher } from "@/hooks/useLevelUpWatcher";
import { CompletionFeedbackLayer } from "@/components/feedback/CompletionFeedbackLayer";
import { PageTitleProvider } from "@/contexts/PageTitle";
import { api } from "@/lib/api";
import type { UserMe } from "@/types/api";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { OfflineBanner } from "@/components/primitives/OfflineBanner";
import { useViewportHeight } from "@/lib/useViewportHeight";
import {
  isNative, setStatusBarLightText, syncLocalReminders, type NativeReminder,
  setAppShortcuts, onAppShortcut, bioLockEnabled, biometricVerify, setAppBadge,
  onNotificationAction, hapticSuccess, readClipboardText, looksLikeBankSms, hapticTick,
} from "@/lib/native";
import { useRouter } from "next/navigation";
import type { DashboardItem } from "@/types/api";

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();

  const { data: me } = useQuery<UserMe>({
    queryKey: ["me"],
    queryFn: () => api.get<UserMe>("/api/v2/me"),
    staleTime: 5 * 60 * 1000,
  });

  const showOnboarding = me ? !me.onboarding_done : false;

  async function handleOnboardingComplete() {
    try {
      await api.post("/api/v2/me/onboarding-done");
    } catch { /* ignore */ }
    qc.invalidateQueries({ queryKey: ["me"] });
  }

  // Persist custom color theme (user's data-color-theme attribute)
  useEffect(() => {
    const savedTheme = localStorage.getItem("finlife_color_theme");
    if (savedTheme) {
      document.documentElement.setAttribute("data-color-theme", savedTheme);
    }
  }, []);

  // Примечание: костыль --vp-bottom-gap (мёртвая зона легаси-режима iOS PWA)
  // удалён — после перехода на manifest-установку вьюпорт занимает весь экран.

  // ── Нативная оболочка (Capacitor): статус-бар под тему ────────────────────
  useEffect(() => {
    if (!isNative()) return;
    document.documentElement.classList.add("cap-native");
    const apply = () => {
      const theme = document.documentElement.getAttribute("data-color-theme");
      const isDark = document.documentElement.classList.contains("dark");
      // светлые часы везде, кроме светлых шапок Snow/Claude в light-режиме
      const lightText = isDark || !(theme === "snow" || theme === "claude");
      void setStatusBarLightText(lightText);
    };
    apply();
    const mo = new MutationObserver(apply);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-color-theme", "class"],
    });
    return () => mo.disconnect();
  }, []);

  // ── Нативная оболочка: «✅ Выполнить» из уведомления ──────────────────────
  useEffect(() => {
    if (!isNative()) return;
    let dispose: (() => void) | undefined;
    void onNotificationAction(async ({ actionId, kind, id }) => {
      if (actionId === "complete" && kind && id) {
        try {
          if (kind === "task") await api.post(`/api/v2/tasks/${id}/complete`);
          else if (kind === "task_occ") await api.post(`/api/v2/task-occurrences/${id}/complete`);
          else if (kind === "habit") await api.post(`/api/v2/habits/occurrences/${id}/complete`);
          void hapticSuccess();
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          qc.invalidateQueries({ queryKey: ["plan"] });
        } catch { /* элемент мог быть уже выполнен/удалён */ }
      }
    }).then((d) => { dispose = d; });
    return () => dispose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Нативная оболочка: Quick Actions на иконке ────────────────────────────
  useEffect(() => {
    if (!isNative()) return;
    void setAppShortcuts([
      { id: "new-task", title: "Новая задача" },
      { id: "new-operation", title: "Новая операция" },
      { id: "quick-add", title: "⚡ ИИ-ввод" },
    ]);
    let dispose: (() => void) | undefined;
    void onAppShortcut((id) => {
      if (id === "new-task") setShowTaskModal(true);
      else if (id === "new-operation") setShowOpModal(true);
      else if (id === "quick-add") router.push("/quick-add");
    }).then((d) => { dispose = d; });
    return () => dispose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Нативная оболочка: локальные напоминания на 3 дня вперёд ─────────────
  // Пуши в бесплатной подписи недоступны; вместо них планируем локальные
  // уведомления по плану на сегодня+2 дня — сработают, даже если приложение
  // не открывали с утра. Пересинк: на каждый refetch (открытие/фокус).
  const { data: nativePlan } = useQuery<{
    day_groups: {
      date: string | null;
      is_today: boolean;
      is_overdue_group: boolean;
      entries: DashboardItem[];
    }[];
  }>({
    queryKey: ["native-plan-reminders"],
    queryFn: () => {
      const iso = new Date().toISOString().slice(0, 10);
      return api.get(`/api/v2/plan?start_date=${iso}&range=3`);
    },
    enabled: typeof window !== "undefined" && isNative(),
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (!isNative() || !nativePlan?.day_groups) return;
    const reminders: NativeReminder[] = [];
    let pendingToday = 0;
    for (const g of nativePlan.day_groups) {
      const isTodayGroup = g.is_today || g.is_overdue_group;
      for (const it of g.entries ?? []) {
        if (it.is_done) continue;
        if (isTodayGroup) pendingToday += 1;
        const dateIso = g.date ?? it.date;
        if (!dateIso) continue;
        const times = new Set<string>();
        if (it.time) times.add(String(it.time).slice(0, 5));
        const metaRem = (it.meta?.reminders as string[] | undefined) ?? [];
        for (const r of metaRem) times.add(String(r).slice(0, 5));
        const completable =
          it.kind === "task" || it.kind === "task_occ" || it.kind === "habit";
        for (const t of times) {
          if (!/^\d{2}:\d{2}$/.test(t)) continue;
          reminders.push({
            key: `${it.kind}-${it.id}-${dateIso}-${t}`,
            title: it.title,
            body: t === String(it.time ?? "").slice(0, 5) ? "Запланировано на это время" : "Напоминание",
            at: new Date(`${dateIso}T${t}:00`),
            ...(completable
              ? { completeKind: it.kind as "task" | "task_occ" | "habit", completeId: it.id }
              : {}),
          });
        }
      }
    }
    void syncLocalReminders(reminders);
    void setAppBadge(pendingToday);
  }, [nativePlan]);

  // ── Нативная оболочка: банковская SMS в буфере → предложить ИИ-разбор ────
  const [smsFromClipboard, setSmsFromClipboard] = useState<string | null>(null);
  useEffect(() => {
    if (!isNative()) return;
    const SEEN_KEY = "finlife_sms_seen";
    const check = async () => {
      const text = (await readClipboardText()).trim();
      if (!looksLikeBankSms(text)) return;
      const sig = text.slice(0, 80);
      if (localStorage.getItem(SEEN_KEY) === sig) return;
      setSmsFromClipboard(text);
    };
    void check();
    const onVis = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const dismissSms = (parse: boolean) => {
    if (!smsFromClipboard) return;
    localStorage.setItem("finlife_sms_seen", smsFromClipboard.slice(0, 80));
    const text = smsFromClipboard;
    setSmsFromClipboard(null);
    if (parse) {
      void hapticTick();
      router.push(`/quick-add?text=${encodeURIComponent(text)}`);
    }
  };

  // Create modals — triggered from MobileNav FAB
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showOpModal, setShowOpModal] = useState(false);

  // Sidebar collapse state (desktop)
  const [collapsed, setCollapsed] = useState(false);

  // Level-up celebration
  const { celebrateLevel, dismiss } = useLevelUpWatcher();

  const onlineStatus = useOnlineStatus();

  useViewportHeight();

  return (
    <AuthGuard>
      <div
        className="fixed inset-0 flex"
        style={{ background: "var(--app-bg)" }}
      >
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <AppSidebar
            collapsed={collapsed}
            onToggle={() => setCollapsed((v) => !v)}
          />
        </div>

        {/* Main column */}
        <main
          className="flex-1 flex flex-col min-w-0 min-h-0"
          style={{ background: "var(--app-bg)" }}
        >
          <AppTopbar />
          <OfflineBanner
            state={onlineStatus}
            onRetry={() => window.location.reload()}
          />
          <div
            className="flex-1 min-h-0 flex flex-col overflow-auto scroll-slim"
          >
            {children}
          </div>
          <MobileNav
            onCreateTask={() => setShowTaskModal(true)}
            onCreateOperation={() => setShowOpModal(true)}
          />
        </main>
      </div>

      {/* Modals and overlays */}
      {showTaskModal && (
        <CreateTaskModal onClose={() => setShowTaskModal(false)} />
      )}
      {showOpModal && (
        <CreateOperationModal onClose={() => setShowOpModal(false)} />
      )}
      {showOnboarding && (
        <OnboardingModal onComplete={handleOnboardingComplete} />
      )}
      {celebrateLevel !== null && (
        <LevelUpOverlay level={celebrateLevel} onDismiss={dismiss} />
      )}
      <CompletionFeedbackLayer />
      <NativeBioLock />

      {/* Баннер: банковская SMS в буфере */}
      {smsFromClipboard && (
        <div
          className="fixed left-3 right-3 z-[95] rounded-2xl border p-3 shadow-xl animate-rise"
          style={{
            bottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
            background: "var(--app-card-bg)",
            borderColor: "var(--app-accent-weak)",
          }}
        >
          <p className="text-[12px] font-semibold mb-0.5" style={{ color: "var(--t-primary)" }}>
            💳 В буфере — похоже, банковская SMS
          </p>
          <p className="text-[11px] line-clamp-2 mb-2" style={{ color: "var(--t-muted)" }}>
            {smsFromClipboard}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => dismissSms(true)}
              className="flex-1 py-2 rounded-xl text-[12.5px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.97]"
              style={{ background: "var(--app-accent-gradient)" }}
            >
              ⚡ Разобрать операцию
            </button>
            <button
              type="button"
              onClick={() => dismissSms(false)}
              className="px-4 py-2 rounded-xl text-[12.5px] font-medium nav-hover"
              style={{ border: "1px solid var(--app-border)", color: "var(--t-secondary)" }}
            >
              Скрыть
            </button>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}

/** Face ID-замок нативной оболочки. Вне Capacitor или при выключенном
 *  тумблере (Настройки) не рендерится вовсе. Блокирует при холодном старте
 *  и при возврате из фона после 3+ минут. */
function NativeBioLock() {
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isNative() || !bioLockEnabled()) return;
    setLocked(true);
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
      } else if (
        hiddenAtRef.current !== null &&
        Date.now() - hiddenAtRef.current > 3 * 60_000 &&
        bioLockEnabled()
      ) {
        setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const unlock = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    const ok = await biometricVerify("Разблокировать FinLife");
    setChecking(false);
    if (ok) setLocked(false);
  }, [checking]);

  // Автозапрос Face ID при появлении замка
  useEffect(() => {
    if (locked) void unlock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  if (!locked) return null;
  return (
    <div
      className="fixed inset-0 z-[100000] flex flex-col items-center justify-center gap-6"
      style={{
        background:
          "radial-gradient(ellipse 70% 50% at 15% 0%, rgba(124,58,237,0.35) 0%, transparent 55%)," +
          "radial-gradient(ellipse 60% 45% at 90% 100%, rgba(219,39,119,0.28) 0%, transparent 55%)," +
          "#140E26",
      }}
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
        style={{ background: "linear-gradient(135deg, #7C3AED 0%, #DB2777 100%)" }}
      >
        <span className="text-white text-xl font-bold tracking-tight">FL</span>
      </div>
      <p className="text-white/80 text-[14px]">Приложение заблокировано</p>
      <button
        type="button"
        onClick={unlock}
        disabled={checking}
        className="px-6 py-2.5 rounded-xl text-[14px] font-semibold text-white transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-60"
        style={{ background: "linear-gradient(135deg, #7C3AED 0%, #DB2777 100%)" }}
      >
        {checking ? "Проверка…" : "Разблокировать (Face ID)"}
      </button>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageTitleProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </PageTitleProvider>
  );
}

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
} from "@/lib/native";
import { useRouter } from "next/navigation";
import type { DashboardItem, TodayBlock as TodayBlockData } from "@/types/api";

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

  // ── Нативная оболочка: локальные напоминания из данных дашборда ──────────
  // Пуши в бесплатной подписи недоступны; вместо них при каждом открытии
  // планируем локальные уведомления на сегодняшние дела со временем.
  const { data: nativeDash } = useQuery<{ today: TodayBlockData }>({
    queryKey: ["dashboard"],
    queryFn: () => api.get("/api/v2/dashboard"),
    enabled: typeof window !== "undefined" && isNative(),
    staleTime: 5 * 60_000,
  });
  useEffect(() => {
    if (!isNative() || !nativeDash?.today) return;
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    const items: DashboardItem[] = [
      ...(nativeDash.today.active ?? []),
      ...(nativeDash.today.events ?? []),
    ];
    const reminders: NativeReminder[] = [];
    for (const it of items) {
      if (it.is_done) continue;
      const times = new Set<string>();
      if (it.time) times.add(String(it.time).slice(0, 5));
      const metaRem = (it.meta?.reminders as string[] | undefined) ?? [];
      for (const r of metaRem) times.add(String(r).slice(0, 5));
      for (const t of times) {
        if (!/^\d{2}:\d{2}$/.test(t)) continue;
        reminders.push({
          key: `${it.kind}-${it.id}-${t}`,
          title: it.title,
          body: t === String(it.time ?? "").slice(0, 5) ? "Запланировано на это время" : "Напоминание",
          at: new Date(`${iso}T${t}:00`),
        });
      }
    }
    void syncLocalReminders(reminders);

    // Бейдж на иконке: сколько дел осталось на сегодня
    const pending =
      (nativeDash.today.active ?? []).filter((i) => !i.is_done).length +
      (nativeDash.today.overdue ?? []).filter((i) => !i.is_done).length;
    void setAppBadge(pending);
  }, [nativeDash]);

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

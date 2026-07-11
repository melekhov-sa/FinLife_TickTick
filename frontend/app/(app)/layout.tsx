"use client";

import { useState, useEffect } from "react";
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
import { isNative, setStatusBarLightText, syncLocalReminders, type NativeReminder } from "@/lib/native";
import type { DashboardItem, TodayBlock as TodayBlockData } from "@/types/api";

function AppLayoutInner({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();

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
    </AuthGuard>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PageTitleProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </PageTitleProvider>
  );
}

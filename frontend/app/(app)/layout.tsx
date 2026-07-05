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
        className="fixed top-0 left-0 right-0 w-full flex"
        style={{ height: "100dvh", background: "var(--app-bg)" }}
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

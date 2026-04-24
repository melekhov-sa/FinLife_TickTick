"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { OnboardingModal } from "@/components/layout/OnboardingModal";
import { CreateTaskModal } from "@/components/modals/CreateTaskModal";
import { CreateOperationModal } from "@/components/modals/CreateOperationModal";
import { LevelUpOverlay } from "@/components/LevelUpOverlay";
import { useLevelUpWatcher } from "@/hooks/useLevelUpWatcher";
import { api } from "@/lib/api";
import type { UserMe } from "@/types/api";

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

  return (
    <AuthGuard>
      <div
        className="h-[100dvh] w-full flex"
        style={{ background: "var(--app-bg)" }}
      >
        {/* Desktop sidebar */}
        <div className="hidden md:flex">
          <AppSidebar
            collapsed={collapsed}
            onToggle={() => setCollapsed((v) => !v)}
          />
        </div>

        {/* Main column — pages render their own AppTopbar */}
        <main
          className="flex-1 flex flex-col min-w-0 overflow-auto scroll-slim pb-[calc(88px+env(safe-area-inset-bottom,0px))] md:pb-0"
          style={{ background: "var(--app-bg)" }}
        >
          {children}
        </main>

        {/* Bottom nav — mobile only */}
        <MobileNav
          onCreateTask={() => setShowTaskModal(true)}
          onCreateOperation={() => setShowOpModal(true)}
        />
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
    </AuthGuard>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppLayoutInner>{children}</AppLayoutInner>;
}

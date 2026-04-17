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

  useEffect(() => {
    const savedTheme = localStorage.getItem("finlife_color_theme");
    if (savedTheme) {
      document.documentElement.setAttribute("data-color-theme", savedTheme);
    }
  }, []);

  // Modal state — lives in layout, survives MobileNav re-renders
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showOpModal, setShowOpModal] = useState(false);

  // Level-up celebration
  const { celebrateLevel, dismiss } = useLevelUpWatcher();

  return (
    <AuthGuard>
      <div className="flex min-h-[100dvh]" style={{ background: "var(--app-bg)" }}>
        {/* Sidebar — desktop only, sticky so it stays in place while body scrolls */}
        <div className="hidden md:flex sticky top-0 h-screen">
          <AppSidebar />
        </div>

        {/* Main content — no internal scroll; page-level scroll on body shows scrollbar at viewport edge */}
        <div className="flex-1 flex flex-col min-w-0 md:pb-0 pb-[calc(56px+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>

      {/* Bottom nav — mobile only */}
      <div className="md:hidden">
        <MobileNav
          onCreateTask={() => setShowTaskModal(true)}
          onCreateOperation={() => setShowOpModal(true)}
        />
      </div>

      {/* Modals — rendered at layout level, never unmounted by MobileNav */}
      {showTaskModal && <CreateTaskModal onClose={() => setShowTaskModal(false)} />}
      {showOpModal && <CreateOperationModal onClose={() => setShowOpModal(false)} />}

      {/* Onboarding */}
      {showOnboarding && (
        <OnboardingModal onComplete={handleOnboardingComplete} />
      )}

      {/* Level-up celebration overlay — global, above everything */}
      {celebrateLevel !== null && (
        <LevelUpOverlay level={celebrateLevel} onDismiss={dismiss} />
      )}
    </AuthGuard>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppLayoutInner>{children}</AppLayoutInner>;
}

"use client";

import { useState, useEffect } from "react";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { OnboardingModal } from "@/components/layout/OnboardingModal";

const ONBOARDING_KEY = "finlife_onboarding_done";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(ONBOARDING_KEY)) {
      setShowOnboarding(true);
    }
  }, []);

  function handleOnboardingComplete() {
    localStorage.setItem(ONBOARDING_KEY, "done");
    setShowOnboarding(false);
  }

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden" style={{ background: "var(--app-bg)" }}>
        {/* Sidebar — desktop only */}
        <div className="hidden md:flex">
          <AppSidebar />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto pb-[env(safe-area-inset-bottom)] md:pb-0">
          {/* Extra bottom padding on mobile for the nav bar */}
          <div className="flex-1 flex flex-col md:pb-0 pb-16">
            {children}
          </div>
        </div>
      </div>

      {/* Bottom nav — mobile only */}
      <div className="md:hidden">
        <MobileNav />
      </div>

      {/* Onboarding — first visit */}
      {showOnboarding && (
        <OnboardingModal onComplete={handleOnboardingComplete} />
      )}
    </AuthGuard>
  );
}

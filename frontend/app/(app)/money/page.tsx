"use client";

import { useEffect } from "react";
import { AppTopbar } from "@/components/layout/AppTopbar";

/**
 * Money section — redirects to the legacy SSR budget/transactions pages
 * until the finance screens are migrated to Next.js.
 */
export default function MoneyPage() {
  useEffect(() => {
    window.location.href = "/legacy/transactions";
  }, []);

  return (
    <>
      <AppTopbar title="Money" />
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mx-auto" />
          <p className="text-sm text-white/30">Opening Finance…</p>
        </div>
      </main>
    </>
  );
}

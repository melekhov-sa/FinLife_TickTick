"use client";

import { AppTopbar } from "@/components/layout/AppTopbar";
import { BarChart3 } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <>
      <AppTopbar title="Аналитика" />
      <main className="flex-1 overflow-auto p-6 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <BarChart3 size={24} className="text-indigo-500" />
          </div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--t-primary)" }}>
            Раздел в разработке
          </h2>
          <p className="text-[14px]" style={{ color: "var(--t-faint)" }}>
            Аналитика будет полностью переработана с нуля
          </p>
        </div>
      </main>
    </>
  );
}

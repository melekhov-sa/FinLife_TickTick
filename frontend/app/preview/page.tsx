"use client";

import { useTheme } from "next-themes";
import { useState, useEffect } from "react";
import { FinanceBlock } from "@/components/FinanceBlock";
import { Moon, Sun } from "lucide-react";
import type { FinStateBlock, FinancialCurrencyBlock } from "@/types/api";

const mockFinState: FinStateBlock = {
  regular_total: 250000,
  credit_total: -45000,
  savings_total: 1200000,
  capital_delta_30: 85000,
  financial_result: 120000,
  debt_load_pct: 35,
};

const mockFinancialSummary: Record<string, FinancialCurrencyBlock> = {
  RUB: {
    income: 150000,
    expense: 30000,
    difference: 120000,
  },
};

export default function PreviewPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950 p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
            FinanceBlock Preview
          </h1>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="fixed top-4 right-4 p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun size={20} />
            ) : (
              <Moon size={20} />
            )}
          </button>
        </div>

        <div className="text-sm md:text-base text-slate-600 dark:text-slate-400 space-y-2">
          <p>
            <strong>Light Theme:</strong> Clean white background with vivid accents
          </p>
          <p>
            <strong>Dark Theme:</strong> Deep blue-black background with lighter accents
          </p>
          <p>
            <strong>Key Features:</strong> Savings hero section, 30-day trend badge, debt-load progress bar with red wash when {'>'} 50%
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 md:p-8 border border-slate-200 dark:border-slate-700">
          <FinanceBlock
            finState={mockFinState}
            financialSummary={mockFinancialSummary}
          />
        </div>

        <div className="text-xs md:text-sm text-slate-500 dark:text-slate-500 space-y-1 border-t border-slate-200 dark:border-slate-700 pt-6">
          <p>Mock Data:</p>
          <pre className="bg-slate-100 dark:bg-slate-900 rounded p-3 overflow-x-auto text-xs">
{`regular_total: 250,000 ₽
credit_total: -45,000 ₽
savings_total: 1,200,000 ₽
capital_delta_30: +85,000 ₽
financial_result: 120,000 ₽
debt_load_pct: 35%`}
          </pre>
        </div>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";
import { clsx } from "clsx";
import {
  Wallet, CheckSquare, Sparkles,
  ArrowRight, ChevronRight,
} from "lucide-react";

interface Props {
  onComplete: (scenario: string) => void;
}

const SCENARIOS = [
  {
    id: "money",
    icon: Wallet,
    title: "Финансы",
    desc: "Бюджет, операции, подписки, аналитика расходов",
    color: "#10b981",
  },
  {
    id: "tasks",
    icon: CheckSquare,
    title: "Задачи",
    desc: "Проекты, привычки, планирование, канбан",
    color: "#6366f1",
  },
  {
    id: "all",
    icon: Sparkles,
    title: "Всё вместе",
    desc: "Полный контроль финансов и продуктивности",
    color: "#f59e0b",
  },
];

const STEPS = [
  {
    title: "Добро пожаловать в FinLife",
    subtitle: "Ваш персональный помощник для финансов и продуктивности",
  },
  {
    title: "Выберите сценарий",
    subtitle: "Мы настроим интерфейс под ваши задачи",
  },
  {
    title: "Готово!",
    subtitle: "Приложение готово к работе",
  },
];

export function OnboardingModal({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [scenario, setScenario] = useState<string | null>(null);

  function handleFinish() {
    onComplete(scenario || "all");
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="w-full max-w-md mx-4 rounded-2xl border overflow-hidden"
        style={{
          background: "var(--app-bg, #0B0F1A)",
          borderColor: "rgba(255,255,255,0.08)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 pt-6 pb-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={clsx(
                "h-1.5 rounded-full transition-all duration-300",
                i === step ? "w-6 bg-indigo-500" : "w-1.5",
                i < step ? "bg-indigo-500/40" : i > step ? "bg-white/10" : ""
              )}
            />
          ))}
        </div>

        <div className="px-8 py-6">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <div className="text-center space-y-5">
              <div
                className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
              >
                <span className="text-white text-2xl font-bold">FL</span>
              </div>
              <div>
                <h2 className="text-xl font-bold mb-2" style={{ color: "var(--t-primary, #E6EAF2)" }}>
                  {STEPS[0].title}
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: "var(--t-faint, #6B7280)" }}>
                  {STEPS[0].subtitle}
                </p>
              </div>
              <div className="space-y-2.5 text-left">
                {[
                  "Контроль доходов и расходов",
                  "Управление задачами и привычками",
                  "Аналитика и стратегическое планирование",
                ].map((text) => (
                  <div key={text} className="flex items-center gap-3 text-[13px]" style={{ color: "var(--t-secondary, #9AA3B2)" }}>
                    <ChevronRight size={14} className="text-indigo-400 shrink-0" />
                    {text}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setStep(1)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-semibold text-white transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}
              >
                Начать <ArrowRight size={16} />
              </button>
            </div>
          )}

          {/* Step 1: Scenario */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="text-center">
                <h2 className="text-lg font-bold mb-1" style={{ color: "var(--t-primary, #E6EAF2)" }}>
                  {STEPS[1].title}
                </h2>
                <p className="text-[13px]" style={{ color: "var(--t-faint, #6B7280)" }}>
                  {STEPS[1].subtitle}
                </p>
              </div>
              <div className="space-y-2.5">
                {SCENARIOS.map((s) => {
                  const Icon = s.icon;
                  const selected = scenario === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setScenario(s.id)}
                      className={clsx(
                        "w-full flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                        selected
                          ? "border-indigo-500/50 bg-indigo-500/[0.08]"
                          : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"
                      )}
                    >
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: `${s.color}15` }}
                      >
                        <Icon size={18} style={{ color: s.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold" style={{ color: "var(--t-primary, #E6EAF2)" }}>
                          {s.title}
                        </p>
                        <p className="text-[12px] mt-0.5" style={{ color: "var(--t-faint, #6B7280)" }}>
                          {s.desc}
                        </p>
                      </div>
                      {selected && (
                        <span className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center shrink-0">
                          <span className="text-white text-[10px]">✓</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setStep(2)}
                disabled={!scenario}
                className={clsx(
                  "w-full py-3 rounded-xl text-[14px] font-semibold transition-all",
                  scenario
                    ? "text-white hover:opacity-90"
                    : "text-white/30 cursor-not-allowed"
                )}
                style={{
                  background: scenario
                    ? "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)"
                    : "rgba(255,255,255,0.05)",
                }}
              >
                Продолжить
              </button>
            </div>
          )}

          {/* Step 2: Done */}
          {step === 2 && (
            <div className="text-center space-y-5">
              <div
                className="w-16 h-16 rounded-full mx-auto flex items-center justify-center"
                style={{ background: "rgba(16,185,129,0.12)" }}
              >
                <Sparkles size={28} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-bold mb-2" style={{ color: "var(--t-primary, #E6EAF2)" }}>
                  {STEPS[2].title}
                </h2>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--t-faint, #6B7280)" }}>
                  {scenario === "money" && "Мы подготовили интерфейс для управления финансами. Начните с добавления кошелька."}
                  {scenario === "tasks" && "Мы подготовили интерфейс для продуктивности. Начните с создания первой задачи."}
                  {scenario === "all" && "Полный набор инструментов готов. Начните с дашборда — он покажет общую картину."}
                </p>
              </div>
              <button
                onClick={handleFinish}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-semibold text-white transition-all hover:opacity-90"
                style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}
              >
                Перейти к приложению <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

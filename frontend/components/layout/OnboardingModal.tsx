"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import {
  Wallet, Tag, Receipt, CheckSquare, Heart,
  ArrowRight, X, Check, Plus, Trash2, Sparkles,
} from "lucide-react";
import { Button } from "@/components/primitives/Button";

interface Props {
  onComplete: () => void;
}

// ── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { icon: Wallet,      title: "Кошелёк",   color: "#10b981" },
  { icon: Tag,         title: "Статьи",     color: "#6366f1" },
  { icon: Receipt,     title: "Операция",   color: "#f59e0b" },
  { icon: CheckSquare, title: "Задача",     color: "#3b82f6" },
  { icon: Heart,       title: "Привычка",   color: "#ec4899" },
];

// ── Default categories ───────────────────────────────────────────────────────

interface CatDraft {
  title: string;
  type: "INCOME" | "EXPENSE";
  enabled: boolean;
}

const DEFAULT_CATS: CatDraft[] = [
  { title: "Зарплата",     type: "INCOME",  enabled: true },
  { title: "Подработка",   type: "INCOME",  enabled: true },
  { title: "Продукты",     type: "EXPENSE", enabled: true },
  { title: "Транспорт",    type: "EXPENSE", enabled: true },
  { title: "Аренда",       type: "EXPENSE", enabled: true },
  { title: "Развлечения",  type: "EXPENSE", enabled: true },
  { title: "Связь",        type: "EXPENSE", enabled: true },
  { title: "Здоровье",     type: "EXPENSE", enabled: true },
  { title: "Одежда",       type: "EXPENSE", enabled: true },
  { title: "Прочее",       type: "EXPENSE", enabled: true },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={clsx(
            "h-1.5 rounded-full transition-all duration-300",
            i === current ? "w-6 bg-indigo-500" : "w-1.5",
            i < current ? "bg-indigo-500/40" : i > current ? "bg-white/10" : ""
          )}
        />
      ))}
    </div>
  );
}

function SuccessHint({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-[12px] font-medium">
      <Check size={14} /> {text}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function OnboardingModal({ onComplete }: Props) {
  const [step, setStep] = useState(-1); // -1 = welcome screen
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  // Step 0: Wallet
  const [walletName, setWalletName] = useState("Основной");
  const [walletBalance, setWalletBalance] = useState("");

  // Step 1: Categories
  const [cats, setCats] = useState<CatDraft[]>(DEFAULT_CATS.map((c) => ({ ...c })));
  const [newCatTitle, setNewCatTitle] = useState("");
  const [newCatType, setNewCatType] = useState<"INCOME" | "EXPENSE">("EXPENSE");

  // Step 2: Operation
  const [opType, setOpType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [opAmount, setOpAmount] = useState("");
  const [opDesc, setOpDesc] = useState("");

  // Step 3: Task
  const [taskTitle, setTaskTitle] = useState("");

  // Step 4: Habit
  const [habitTitle, setHabitTitle] = useState("");

  // Track created IDs for chaining
  const [createdWalletId, setCreatedWalletId] = useState<number | null>(null);

  async function handleNext() {
    setLoading(true);
    setSuccess("");
    try {
      if (step === 0 && walletName.trim()) {
        const res = await api.post<{ wallet_id: number }>("/api/v2/wallets", {
          title: walletName.trim(),
          wallet_type: "REGULAR",
          currency: "RUB",
          initial_balance: walletBalance || "0",
        });
        setCreatedWalletId(res.wallet_id);
        setSuccess("Кошелёк создан");
      }

      if (step === 1) {
        const enabled = cats.filter((c) => c.enabled);
        for (const c of enabled) {
          await api.post("/api/v2/fin-categories", {
            title: c.title,
            category_type: c.type,
          });
        }
        setSuccess(`Добавлено ${enabled.length} категорий`);
      }

      if (step === 2 && opAmount.trim() && createdWalletId) {
        await api.post("/api/v2/transactions", {
          operation_type: opType,
          amount: opAmount.trim(),
          wallet_id: createdWalletId,
          description: opDesc.trim() || (opType === "INCOME" ? "Зарплата" : "Покупка"),
          occurred_at: new Date().toISOString(),
        });
        setSuccess("Операция записана");
      }

      if (step === 3 && taskTitle.trim()) {
        await api.post("/api/v2/tasks", {
          mode: "once",
          title: taskTitle.trim(),
        });
        setSuccess("Задача создана");
      }

      if (step === 4 && habitTitle.trim()) {
        await api.post("/api/v2/habits", {
          title: habitTitle.trim(),
          freq: "DAILY",
        });
        setSuccess("Привычка добавлена");
      }
    } catch {
      // Ignore errors, allow to proceed
    }
    setLoading(false);

    if (step >= 4) {
      setTimeout(onComplete, 600);
    } else {
      setTimeout(() => { setSuccess(""); setStep((s) => s + 1); }, 800);
    }
  }

  function handleSkip() {
    setSuccess("");
    if (step >= 4) {
      onComplete();
    } else {
      setStep((s) => s + 1);
    }
  }

  function toggleCat(idx: number) {
    setCats((prev) => prev.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c));
  }

  function removeCat(idx: number) {
    setCats((prev) => prev.filter((_, i) => i !== idx));
  }

  function addCat() {
    if (!newCatTitle.trim()) return;
    setCats((prev) => [...prev, { title: newCatTitle.trim(), type: newCatType, enabled: true }]);
    setNewCatTitle("");
  }

  const stepInfo = step >= 0 ? STEPS[step] : null;
  const StepIcon = stepInfo?.icon ?? Sparkles;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-md rounded-2xl border overflow-hidden"
        style={{
          background: "var(--app-bg, #0B0F1A)",
          borderColor: "rgba(255,255,255,0.08)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div className="pt-6 pb-2 px-8">
          {step < 0
            ? <div className="flex justify-center"><div className="h-1.5 w-1.5 rounded-full bg-white/10" /></div>
            : <StepDots current={step} total={5} />
          }
        </div>

        <div className="px-8 pb-8 pt-2">

          {/* ── Welcome ── */}
          {step < 0 && (
            <div className="text-center space-y-5">
              <div
                className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)" }}
              >
                <span className="text-white text-xl font-bold">FL</span>
              </div>
              <div>
                <h2 className="text-lg font-bold mb-1.5" style={{ color: "var(--t-primary, #E6EAF2)" }}>
                  Добро пожаловать в FinLife
                </h2>
                <p className="text-[13px] leading-relaxed" style={{ color: "var(--t-faint, #6B7280)" }}>
                  Настроим приложение за 2 минуты
                </p>
              </div>
              <div className="space-y-2 text-left">
                {STEPS.map((s, i) => {
                  const I = s.icon;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: `${s.color}12` }}>
                        <I size={14} style={{ color: s.color }} />
                      </div>
                      <span className="text-[13px]" style={{ color: "var(--t-secondary, #9AA3B2)" }}>{s.title}</span>
                    </div>
                  );
                })}
              </div>
              <Button
                variant="primary"
                size="lg"
                rightIcon={<ArrowRight size={16} />}
                onClick={() => setStep(0)}
                fullWidth
              >
                Начать настройку
              </Button>
            </div>
          )}

          {/* ── Step 0: Wallet ── */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${STEPS[0].color}12` }}>
                  <Wallet size={18} style={{ color: STEPS[0].color }} />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold" style={{ color: "var(--t-primary, #E6EAF2)" }}>Создайте кошелёк</h2>
                  <p className="text-[12px]" style={{ color: "var(--t-faint, #6B7280)" }}>Куда приходят и уходят деньги</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider mb-1 block" style={{ color: "var(--t-faint, #6B7280)" }}>Название</label>
                  <input
                    value={walletName}
                    onChange={(e) => setWalletName(e.target.value)}
                    placeholder="Карта Сбербанк"
                    className="w-full px-3 py-2.5 rounded-lg text-[14px] bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 placeholder:text-white/20"
                    style={{ color: "var(--t-primary, #E6EAF2)" }}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider mb-1 block" style={{ color: "var(--t-faint, #6B7280)" }}>Текущий баланс, ₽</label>
                  <input
                    value={walletBalance}
                    onChange={(e) => setWalletBalance(e.target.value)}
                    type="number"
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-lg text-[14px] bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 placeholder:text-white/20"
                    style={{ color: "var(--t-primary, #E6EAF2)" }}
                  />
                </div>
              </div>
              {success && <SuccessHint text={success} />}
              <div className="flex gap-2">
                <Button variant="secondary" size="md" onClick={handleSkip} fullWidth>Пропустить</Button>
                <button onClick={handleNext} disabled={loading || !walletName.trim()} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40 transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}>
                  {loading ? "..." : "Создать"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 1: Categories ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${STEPS[1].color}12` }}>
                  <Tag size={18} style={{ color: STEPS[1].color }} />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold" style={{ color: "var(--t-primary, #E6EAF2)" }}>Статьи доходов и расходов</h2>
                  <p className="text-[12px]" style={{ color: "var(--t-faint, #6B7280)" }}>Уберите лишние или добавьте свои</p>
                </div>
              </div>

              <div className="max-h-[280px] overflow-y-auto space-y-1.5 pr-1">
                {/* Income */}
                <p className="text-[10px] font-semibold uppercase tracking-widest pt-1" style={{ color: "var(--t-faint, #6B7280)" }}>Доходы</p>
                {cats.map((c, i) => c.type === "INCOME" && (
                  <div key={i} className="flex items-center gap-2 group">
                    <button onClick={() => toggleCat(i)} className={clsx("w-5 h-5 rounded flex items-center justify-center border transition-all shrink-0", c.enabled ? "bg-indigo-500 border-indigo-500" : "border-white/15 bg-transparent")}>
                      {c.enabled && <Check size={12} className="text-white" />}
                    </button>
                    <span className="flex-1 text-[13px]" style={{ color: c.enabled ? "var(--t-primary, #E6EAF2)" : "var(--t-faint, #6B7280)" }}>{c.title}</span>
                    <button onClick={() => removeCat(i)} className="opacity-0 group-hover:opacity-60 transition-opacity"><Trash2 size={13} className="text-red-400" /></button>
                  </div>
                ))}

                <p className="text-[10px] font-semibold uppercase tracking-widest pt-3" style={{ color: "var(--t-faint, #6B7280)" }}>Расходы</p>
                {cats.map((c, i) => c.type === "EXPENSE" && (
                  <div key={i} className="flex items-center gap-2 group">
                    <button onClick={() => toggleCat(i)} className={clsx("w-5 h-5 rounded flex items-center justify-center border transition-all shrink-0", c.enabled ? "bg-indigo-500 border-indigo-500" : "border-white/15 bg-transparent")}>
                      {c.enabled && <Check size={12} className="text-white" />}
                    </button>
                    <span className="flex-1 text-[13px]" style={{ color: c.enabled ? "var(--t-primary, #E6EAF2)" : "var(--t-faint, #6B7280)" }}>{c.title}</span>
                    <button onClick={() => removeCat(i)} className="opacity-0 group-hover:opacity-60 transition-opacity"><Trash2 size={13} className="text-red-400" /></button>
                  </div>
                ))}

                {/* Add custom */}
                <div className="flex items-center gap-2 pt-2">
                  <input
                    value={newCatTitle}
                    onChange={(e) => setNewCatTitle(e.target.value)}
                    placeholder="Своя категория..."
                    className="flex-1 px-2.5 py-1.5 rounded-md text-[12px] bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 placeholder:text-white/20"
                    style={{ color: "var(--t-primary, #E6EAF2)" }}
                    onKeyDown={(e) => e.key === "Enter" && addCat()}
                  />
                  <select
                    value={newCatType}
                    onChange={(e) => setNewCatType(e.target.value as "INCOME" | "EXPENSE")}
                    className="px-2 py-1.5 rounded-md text-[11px] bg-white/[0.05] border border-white/[0.08]"
                    style={{ color: "var(--t-secondary, #9AA3B2)" }}
                  >
                    <option value="EXPENSE">Расход</option>
                    <option value="INCOME">Доход</option>
                  </select>
                  <button onClick={addCat} disabled={!newCatTitle.trim()} className="p-1.5 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 disabled:opacity-30 transition-colors">
                    <Plus size={14} className="text-indigo-400" />
                  </button>
                </div>
              </div>

              {success && <SuccessHint text={success} />}
              <div className="flex gap-2">
                <Button variant="secondary" size="md" onClick={handleSkip} fullWidth>Пропустить</Button>
                <button onClick={handleNext} disabled={loading} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40 transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}>
                  {loading ? "..." : `Добавить (${cats.filter((c) => c.enabled).length})`}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Operation ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${STEPS[2].color}12` }}>
                  <Receipt size={18} style={{ color: STEPS[2].color }} />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold" style={{ color: "var(--t-primary, #E6EAF2)" }}>Первая операция</h2>
                  <p className="text-[12px]" style={{ color: "var(--t-faint, #6B7280)" }}>Запишите доход или расход</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-0.5 bg-white/[0.04] border border-white/[0.07] rounded-lg p-0.5">
                  {(["INCOME", "EXPENSE"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setOpType(t)}
                      className={clsx("flex-1 py-2 rounded-md text-[13px] font-semibold transition-all", opType === t ? "bg-indigo-600 text-white shadow-sm" : "hover:bg-white/[0.05]")}
                      style={{ color: opType === t ? undefined : "var(--t-secondary, #9AA3B2)" }}
                    >
                      {t === "INCOME" ? "Доход" : "Расход"}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider mb-1 block" style={{ color: "var(--t-faint, #6B7280)" }}>Сумма, ₽</label>
                  <input
                    value={opAmount}
                    onChange={(e) => setOpAmount(e.target.value)}
                    type="number"
                    placeholder="1000"
                    className="w-full px-3 py-2.5 rounded-lg text-[18px] font-bold bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 placeholder:text-white/20"
                    style={{ color: "var(--t-primary, #E6EAF2)" }}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium uppercase tracking-wider mb-1 block" style={{ color: "var(--t-faint, #6B7280)" }}>Описание</label>
                  <input
                    value={opDesc}
                    onChange={(e) => setOpDesc(e.target.value)}
                    placeholder={opType === "INCOME" ? "Зарплата за март" : "Продукты в магазине"}
                    className="w-full px-3 py-2.5 rounded-lg text-[14px] bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 placeholder:text-white/20"
                    style={{ color: "var(--t-primary, #E6EAF2)" }}
                  />
                </div>
                {!createdWalletId && (
                  <p className="text-[11px] text-amber-400/70">Кошелёк не создан — операция будет пропущена</p>
                )}
              </div>
              {success && <SuccessHint text={success} />}
              <div className="flex gap-2">
                <Button variant="secondary" size="md" onClick={handleSkip} fullWidth>Пропустить</Button>
                <button onClick={handleNext} disabled={loading || !opAmount.trim() || !createdWalletId} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40 transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)" }}>
                  {loading ? "..." : "Записать"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Task ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${STEPS[3].color}12` }}>
                  <CheckSquare size={18} style={{ color: STEPS[3].color }} />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold" style={{ color: "var(--t-primary, #E6EAF2)" }}>Первая задача</h2>
                  <p className="text-[12px]" style={{ color: "var(--t-faint, #6B7280)" }}>Что нужно сделать в ближайшее время?</p>
                </div>
              </div>
              <div>
                <input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Например: Разобрать почту"
                  className="w-full px-3 py-2.5 rounded-lg text-[14px] bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 placeholder:text-white/20"
                  style={{ color: "var(--t-primary, #E6EAF2)" }}
                  autoFocus
                />
              </div>
              {success && <SuccessHint text={success} />}
              <div className="flex gap-2">
                <Button variant="secondary" size="md" onClick={handleSkip} fullWidth>Пропустить</Button>
                <button onClick={handleNext} disabled={loading || !taskTitle.trim()} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40 transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)" }}>
                  {loading ? "..." : "Создать"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Habit ── */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${STEPS[4].color}12` }}>
                  <Heart size={18} style={{ color: STEPS[4].color }} />
                </div>
                <div>
                  <h2 className="text-[15px] font-bold" style={{ color: "var(--t-primary, #E6EAF2)" }}>Ежедневная привычка</h2>
                  <p className="text-[12px]" style={{ color: "var(--t-faint, #6B7280)" }}>Что хотите делать каждый день?</p>
                </div>
              </div>
              <div>
                <input
                  value={habitTitle}
                  onChange={(e) => setHabitTitle(e.target.value)}
                  placeholder="Например: Зарядка утром"
                  className="w-full px-3 py-2.5 rounded-lg text-[14px] bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 placeholder:text-white/20"
                  style={{ color: "var(--t-primary, #E6EAF2)" }}
                  autoFocus
                />
              </div>
              {success && <SuccessHint text={success} />}
              <div className="flex gap-2">
                <Button variant="secondary" size="md" onClick={handleSkip} fullWidth>Пропустить</Button>
                <button onClick={handleNext} disabled={loading || !habitTitle.trim()} className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold text-white disabled:opacity-40 transition-all hover:opacity-90" style={{ background: "linear-gradient(135deg, #ec4899 0%, #db2777 100%)" }}>
                  {loading ? "..." : "Завершить"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

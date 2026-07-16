"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WalletItem, FinCategoryItem, SubscriptionItem, BudgetRow } from "@/types/api";
import { Select } from "@/components/ui/Select";
import type { SelectOption } from "@/components/ui/Select";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FormRow } from "@/components/ui/FormRow";
import { CreateTransactionRequestSchema } from "@/schemas/api.generated";
import {
  validateWithSchema, mergeErrors, parseBackendErrors,
  type FieldErrors,
} from "@/lib/formErrors";
import { api } from "@/lib/api";
import { budgetMonthOptions } from "@/lib/budgetMonth";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { DateInput } from "@/components/primitives/DateInput";
import { DateTimeInput } from "@/components/primitives/DateTimeInput";
import { useToast } from "@/components/primitives/Toast";

type OpType = "INCOME" | "EXPENSE" | "TRANSFER";

interface GoalWalletItem {
  wallet_id: number;
  amount: string;
}

interface GoalItem {
  goal_id: number;
  title: string;
  currency: string;
  is_system?: boolean;
  wallets: GoalWalletItem[];
}

export interface CreateOperationInitialValues {
  opType?: OpType;
  amount?: string;
  walletId?: number;
  fromWalletId?: number;
  toWalletId?: number;
  categoryId?: number;
  fromGoalId?: number;
  toGoalId?: number;
}

interface Props {
  onClose: () => void;
  initialValues?: CreateOperationInitialValues;
  occurrenceId?: number;
  /** Pre-fill list_id (e.g., when opening from a trip dashboard). */
  initialListId?: number | null;
}

interface TripListOption {
  id: number;
  title: string;
  list_type: string;
}

function fmtBalance(balance: string, currency: string): string {
  const n = parseFloat(balance);
  if (isNaN(n)) return balance;
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n) + " " + currency;
}

const chipBaseCls = "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer";
const chipActiveCls = "bg-[var(--app-accent)] border-[var(--app-accent)] text-[#fff]";
const chipInactiveCls = "bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/68 hover:bg-slate-50 dark:hover:bg-white/[0.05]";

const OP_TYPES: { value: OpType; label: string; activeColor: string }[] = [
  { value: "INCOME",   label: "Доход",       activeColor: "bg-emerald-600 border-emerald-500 text-[#fff]" },
  { value: "EXPENSE",  label: "Расход",       activeColor: "bg-red-600 border-red-500 text-[#fff]" },
  { value: "TRANSFER", label: "Перемещение",  activeColor: "bg-blue-600 border-blue-500 text-[#fff]" },
];

export function CreateOperationModal({ onClose, initialValues, occurrenceId, initialListId }: Props) {
  const qc = useQueryClient();
  const router = useRouter();
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement | null>(null);

  const [opType, setOpType] = useState<OpType | null>(initialValues?.opType ?? "EXPENSE");
  const [amount, setAmount] = useState(initialValues?.amount != null ? String(initialValues.amount) : "");
  const [walletId, setWalletId] = useState<number | "">(initialValues?.walletId ?? "");
  const [fromWalletId, setFromWalletId] = useState<number | "">(initialValues?.fromWalletId ?? "");
  const [toWalletId, setToWalletId] = useState<number | "">(initialValues?.toWalletId ?? "");
  const [categoryId, setCategoryId] = useState<number | "">(initialValues?.categoryId ?? "");
  const [listId, setListId] = useState<number | "">(initialListId ?? "");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [budgetMonth, setBudgetMonth] = useState("");

  // Transfer goal selectors
  const [fromGoalId, setFromGoalId] = useState<number | "">(initialValues?.fromGoalId ?? "");
  const [toGoalId, setToGoalId] = useState<number | "">(initialValues?.toGoalId ?? "");

  // Subscription coverage
  const [subOpen, setSubOpen] = useState(false);
  const [subSubscriptionId, setSubSubscriptionId] = useState<number | "">("");
  const [subPayerType, setSubPayerType] = useState<"SELF" | "MEMBER">("SELF");
  const [subMemberId, setSubMemberId] = useState<number | "">("");
  const [subStartDate, setSubStartDate] = useState("");
  const [subEndDate, setSubEndDate] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<{ category_id: number; confidence: number; exact?: boolean; reason?: string }[]>([]);
  const categoryIdRef = useRef(categoryId);
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: wallets } = useQuery<WalletItem[]>({
    queryKey: ["wallets"],
    queryFn: () => api.get<WalletItem[]>("/api/v2/wallets"),
    staleTime: 60_000,
    enabled: opType !== null,
  });

  const { data: finCats } = useQuery<FinCategoryItem[]>({
    queryKey: ["fin-categories"],
    queryFn: () => api.get<FinCategoryItem[]>("/api/v2/fin-categories"),
    staleTime: 5 * 60_000,
    enabled: opType === "INCOME" || opType === "EXPENSE",
  });

  const { data: subscriptions } = useQuery<SubscriptionItem[]>({
    queryKey: ["subscriptions"],
    queryFn: () => api.get<SubscriptionItem[]>("/api/v2/subscriptions"),
    staleTime: 5 * 60_000,
    enabled: opType === "EXPENSE" && subOpen,
  });

  const { data: goals } = useQuery<GoalItem[]>({
    queryKey: ["goals"],
    queryFn: () => api.get<GoalItem[]>("/api/v2/goals"),
    staleTime: 5 * 60_000,
    enabled: opType === "TRANSFER" || opType === "INCOME",
  });

  const { data: tripLists } = useQuery<TripListOption[]>({
    queryKey: ["shared-lists", "trip"],
    queryFn: async () => {
      const all = await api.get<TripListOption[]>("/api/v2/lists");
      return all.filter((l) => l.list_type === "trip");
    },
    staleTime: 60_000,
  });

  const budgetNow = new Date();
  const { data: budgetData } = useQuery<{ expense_rows: BudgetRow[] }>({
    queryKey: ["budget", budgetNow.getFullYear(), budgetNow.getMonth() + 1],
    queryFn: () =>
      api.get(`/api/v2/budget?year=${budgetNow.getFullYear()}&month=${budgetNow.getMonth() + 1}`),
    staleTime: 60_000,
    enabled: opType === "EXPENSE",
  });

  const freqCats = finCats?.filter((c) => c.category_type === opType && c.is_frequent) ?? [];

  const visibleWallets = (wallets ?? [])
    .filter((w) => !(opType === "EXPENSE" && w.wallet_type === "SAVINGS"))
    .slice()
    .sort((a, b) => b.operations_count_30d - a.operations_count_30d);

  const selectedFromWallet = (wallets ?? []).find((w) => w.wallet_id === fromWalletId);
  const selectedToWallet = (wallets ?? []).find((w) => w.wallet_id === toWalletId);
  const showFromGoal = selectedFromWallet?.wallet_type === "SAVINGS";
  const showToGoal = selectedToWallet?.wallet_type === "SAVINGS";

  // INCOME на накопительный кошелёк — доход обязан попадать в цель
  const selectedIncomeWallet = (wallets ?? []).find((w) => w.wallet_id === walletId);
  const showIncomeGoal = opType === "INCOME" && selectedIncomeWallet?.wallet_type === "SAVINGS";

  const fromGoalBalance = useMemo(() => {
    if (!fromGoalId || !fromWalletId || !goals) return null;
    const goal = goals.find((g) => g.goal_id === Number(fromGoalId));
    const entry = goal?.wallets.find((w) => w.wallet_id === Number(fromWalletId));
    if (!entry) return null;
    const n = parseFloat(entry.amount);
    return isNaN(n) ? null : { amount: n, currency: goal!.currency };
  }, [fromGoalId, fromWalletId, goals]);

  const toGoalBalance = useMemo(() => {
    if (!toGoalId || !toWalletId || !goals) return null;
    const goal = goals.find((g) => g.goal_id === Number(toGoalId));
    const entry = goal?.wallets.find((w) => w.wallet_id === Number(toWalletId));
    if (!entry) return null;
    const n = parseFloat(entry.amount);
    return isNaN(n) ? null : { amount: n, currency: goal!.currency };
  }, [toGoalId, toWalletId, goals]);

  const limitWarning = useMemo(() => {
    if (opType !== "EXPENSE" || !categoryId || !budgetData?.expense_rows) return null;
    const row = budgetData.expense_rows.find((r) => r.category_id === Number(categoryId));
    if (!row || !row.total?.plan) return null;
    const amountVal = parseFloat(amount);
    if (isNaN(amountVal) || amountVal <= 0) return null;
    const projectedFact = row.total.fact + amountVal;
    if (projectedFact <= row.total.plan) return null;
    return {
      plan: row.total.plan,
      fact: row.total.fact,
      overBy: projectedFact - row.total.plan,
    };
  }, [opType, categoryId, amount, budgetData]);

  const walletOptions: SelectOption[] = useMemo(() => {
    const opts: SelectOption[] = [{ value: "", label: "— выберите кошелёк —" }];
    const top3 = visibleWallets.slice(0, 3);
    const rest = visibleWallets.slice(3);
    const label = (w: WalletItem) => `${w.title} · ${fmtBalance(w.balance, w.currency)}`;
    if (rest.length > 0) {
      top3.forEach((w) => opts.push({ value: String(w.wallet_id), label: label(w), group: "★ Частые" }));
      rest.forEach((w) => opts.push({ value: String(w.wallet_id), label: label(w), group: "Все кошельки" }));
    } else {
      visibleWallets.forEach((w) => opts.push({ value: String(w.wallet_id), label: label(w) }));
    }
    return opts;
  }, [visibleWallets]);

  const allWalletOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— кошелёк —" },
    ...(wallets ?? []).map((w) => ({ value: String(w.wallet_id), label: `${w.title} · ${fmtBalance(w.balance, w.currency)}` })),
  ], [wallets]);

  const categoryOptions: SelectOption[] = useMemo(() => {
    const opts: SelectOption[] = [{ value: "", label: "— без категории —" }];
    const allForType = (finCats ?? []).filter((c) => c.category_type === opType);
    const freq = allForType.filter((c) => c.is_frequent).slice(0, 5);
    const all = [...allForType].sort((a, b) => a.title.localeCompare(b.title, "ru"));
    if (freq.length > 0) {
      freq.forEach((c) => opts.push({ value: String(c.category_id), label: c.title, group: "★ Частые" }));
    }
    if (all.length > 0) {
      all.forEach((c) => opts.push({ value: String(c.category_id), label: c.title, group: "Все категории" }));
    }
    return opts;
  }, [freqCats, finCats, opType]);

  const subscriptionOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— выберите подписку —" },
    ...(subscriptions ?? []).map((s) => ({ value: String(s.id), label: s.name })),
  ], [subscriptions]);

  const selectedSub = (subscriptions ?? []).find((s) => s.id === subSubscriptionId);

  const memberOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— участник —" },
    ...(selectedSub?.members ?? []).map((m) => ({ value: String(m.member_id), label: m.contact_name })),
  ], [selectedSub]);

  // Цели для перевода: обязательны для SAVINGS-кошельков. Системная «Без
  // цели» — первая в списке и подставляется по умолчанию (см. эффекты ниже).
  const makeGoalOptions = (wallet?: WalletItem): SelectOption[] => [
    { value: "", label: "— выберите цель —" },
    ...(goals ?? [])
      .filter((g) => !wallet || g.currency === wallet.currency)
      .sort((a, b) => Number(b.is_system ?? false) - Number(a.is_system ?? false))
      .map((g) => ({ value: String(g.goal_id), label: g.title })),
  ];
  const fromGoalOptions: SelectOption[] = useMemo(
    () => makeGoalOptions(selectedFromWallet),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goals, selectedFromWallet]
  );
  const toGoalOptions: SelectOption[] = useMemo(
    () => makeGoalOptions(selectedToWallet),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goals, selectedToWallet]
  );

  // Дефолт: выбран SAVINGS-кошелёк, цель не выбрана → системная «Без цели»
  useEffect(() => {
    if (opType !== "TRANSFER" || !showFromGoal || fromGoalId) return;
    const sys = (goals ?? []).find(
      (g) => g.is_system && g.currency === selectedFromWallet?.currency
    );
    if (sys) setFromGoalId(sys.goal_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opType, showFromGoal, selectedFromWallet?.wallet_id, goals]);
  useEffect(() => {
    if (opType !== "TRANSFER" || !showToGoal || toGoalId) return;
    const sys = (goals ?? []).find(
      (g) => g.is_system && g.currency === selectedToWallet?.currency
    );
    if (sys) setToGoalId(sys.goal_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opType, showToGoal, selectedToWallet?.wallet_id, goals]);

  const incomeGoalOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "Без цели (по умолчанию)" },
    ...(goals ?? [])
      .filter((g) => !g.is_system)
      .filter((g) => !selectedIncomeWallet || g.currency === selectedIncomeWallet.currency)
      .map((g) => ({ value: String(g.goal_id), label: g.title })),
  ], [goals, selectedIncomeWallet]);

  // Сбрасывать цель при смене кошелька/типа для дохода (валюта может не совпасть)
  useEffect(() => {
    if (opType === "INCOME") setToGoalId("");
  }, [opType, walletId]);

  useEffect(() => {
    if (!initialValues?.categoryId) setCategoryId("");
  }, [opType, initialValues?.categoryId]);

  // Reset subscription section when opType changes away from EXPENSE
  useEffect(() => {
    if (opType !== "EXPENSE") {
      setSubOpen(false);
      setSubSubscriptionId("");
      setSubPayerType("SELF");
      setSubMemberId("");
      setSubStartDate("");
      setSubEndDate("");
    }
  }, [opType]);

  // Reset member when payer type changes to SELF
  useEffect(() => {
    if (subPayerType === "SELF") setSubMemberId("");
  }, [subPayerType]);

  // Keep ref in sync with state for use inside async callbacks
  useEffect(() => { categoryIdRef.current = categoryId; }, [categoryId]);

  // Debounced category suggestion
  useEffect(() => {
    if (opType !== "INCOME" && opType !== "EXPENSE") {
      setSuggestions([]);
      return;
    }
    const amountVal = parseFloat(amount);
    if (!amount || isNaN(amountVal) || amountVal <= 0 || !walletId) {
      setSuggestions([]);
      return;
    }
    if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current);
    suggestTimerRef.current = setTimeout(async () => {
      try {
        const results = await api.post<{ category_id: number; confidence: number; exact?: boolean; reason?: string }[]>(
          "/api/v2/transactions/suggest-category",
          {
            amount,
            wallet_id: walletId,
            operation_type: opType,
            hour: new Date().getHours(),
            description: description.trim() || null,
            date: occurredAt ? occurredAt.slice(0, 10) : null,
          },
        );
        if (results.length > 0) {
          setSuggestions(results.slice(0, 3));
          // Авто-подставляем только при почти точном повторе суммы — надёжный случай.
          if (results[0].exact && results[0].confidence >= 0.8 && !categoryIdRef.current) {
            setCategoryId(results[0].category_id);
          }
        } else {
          setSuggestions([]);
        }
      } catch {
        setSuggestions([]);
      }
    }, 600);
    return () => { if (suggestTimerRef.current) clearTimeout(suggestTimerRef.current); };
  }, [amount, walletId, opType, description, occurredAt]);

  function clearFieldError(field: string) {
    if (fieldErrors[field]) setFieldErrors((prev) => { const next = { ...prev }; delete next[field]; return next; });
  }

  function buildPayload() {
    const body: Record<string, unknown> = {
      operation_type: opType ?? "",
      amount,
      description,
    };
    body.occurred_at = occurredAt || null;
    if (opType === "TRANSFER") {
      body.from_wallet_id = fromWalletId || null;
      body.to_wallet_id = toWalletId || null;
      body.from_goal_id = fromGoalId || null;
      body.to_goal_id = toGoalId || null;
    } else {
      body.wallet_id = walletId || null;
      body.category_id = categoryId || null;
      if (opType === "INCOME" && showIncomeGoal) {
        body.to_goal_id = toGoalId || null;
      }
      // Что подсказывал движок — для обучения на исправлениях
      if (suggestions.length > 0) {
        body.suggested_category_id = suggestions[0].category_id;
      }
    }
    if (opType === "EXPENSE" && subSubscriptionId) {
      body.sub_subscription_id = subSubscriptionId;
      body.sub_payer_type = subPayerType;
      body.sub_member_id = subMemberId || null;
      body.sub_start_date = subStartDate || null;
      body.sub_end_date = subEndDate || null;
    }
    body.list_id = listId || null;
    if (budgetMonth) body.budget_month = budgetMonth;
    return body;
  }

  function validate(): boolean {
    if (!opType) { setError("Выберите тип операции"); return false; }

    const payload = buildPayload();

    // Layer 1: Zod schema (from backend contract)
    const zodErrs = validateWithSchema(CreateTransactionRequestSchema, payload);

    // Layer 2: Business rules
    const custom: FieldErrors = {};
    const amountVal = parseFloat(amount);
    if (!amount || isNaN(amountVal) || amountVal <= 0) custom.amount = "Введите корректную сумму";
    if (opType !== "TRANSFER" && !walletId) custom.wallet_id = "Выберите кошелёк";
    if (opType === "TRANSFER") {
      if (!fromWalletId) custom.from_wallet_id = "Выберите кошелёк-источник";
      if (!toWalletId) custom.to_wallet_id = "Выберите кошелёк-получатель";
      if (fromWalletId && toWalletId && fromWalletId === toWalletId) {
        const fromW = (wallets ?? []).find((x) => x.wallet_id === fromWalletId);
        if (fromW?.wallet_type !== "SAVINGS") custom.to_wallet_id = "Кошельки должны отличаться";
      }
    }
    // Balance check: REGULAR wallets cannot go negative
    if (!isNaN(amountVal) && amountVal > 0) {
      if (opType === "EXPENSE" && walletId) {
        const w = (wallets ?? []).find((x) => x.wallet_id === walletId);
        if (w?.wallet_type === "REGULAR" && amountVal > parseFloat(w.balance)) {
          custom.wallet_id = `Недостаточно средств (баланс: ${fmtBalance(w.balance, w.currency)})`;
        }
      }
      if (opType === "TRANSFER" && fromWalletId) {
        const w = (wallets ?? []).find((x) => x.wallet_id === fromWalletId);
        if (w?.wallet_type === "REGULAR" && amountVal > parseFloat(w.balance)) {
          custom.from_wallet_id = `Недостаточно средств (баланс: ${fmtBalance(w.balance, w.currency)})`;
        }
      }
    }

    const merged = mergeErrors(zodErrs, custom);
    setFieldErrors(merged);
    setError(null);
    return Object.keys(merged).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setError(null);
    try {
      await api.post<{ id: number }>("/api/v2/transactions", buildPayload());

      // If this was a planned occurrence execution, mark it as done
      if (occurrenceId) {
        await api.post(`/api/v2/planned-ops/occurrences/${occurrenceId}/done`);
      }

      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["planned-ops-upcoming"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["goals"] });
      if (listId) {
        qc.invalidateQueries({ queryKey: ["list-transactions", Number(listId)] });
        qc.invalidateQueries({ queryKey: ["list-summary", Number(listId)] });
      }
      toast({
        title: occurrenceId ? "Операция выполнена" : "Операция создана",
        variant: "success",
      });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      // Try to parse backend validation errors from the message
      const match = msg.match(/API error (\d+): ([\s\S]*)/);
      if (match) {
        try {
          const data = JSON.parse(match[2]);
          const parsed = parseBackendErrors(parseInt(match[1]), data);
          if (parsed.fieldErrors) { setFieldErrors(parsed.fieldErrors); return; }
          setError(parsed.message ?? "Ошибка при создании операции");
        } catch {
          setError("Ошибка при создании операции");
        }
      } else {
        setError("Не удалось подключиться к серверу");
      }
    } finally {
      setSaving(false);
    }
  }

  // Ctrl/Cmd + Enter
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const headerTitle = opType
    ? `Новая операция · ${OP_TYPES.find((o) => o.value === opType)!.label}`
    : "Новая операция";

  const footer = opType ? (
    <div className="flex gap-2.5">
      <Button
        type="submit"
        variant="primary"
        size="md"
        loading={saving}
        fullWidth
      >
        {occurrenceId ? "Выполнить операцию" : "Создать операцию"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={onClose}
        className="hidden md:inline-flex"
      >
        Отмена
      </Button>
    </div>
  ) : undefined;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={headerTitle}
      footer={footer}
      onSubmit={handleSubmit}
    >
      <div
        className="space-y-3 md:space-y-4"
        ref={(el) => {
          if (el && !formRef.current) {
            const f = el.closest("form");
            if (f instanceof HTMLFormElement) formRef.current = f;
          }
        }}
      >
        {/* ИИ-ввод: текст/SMS → готовые операции */}
        {!occurrenceId && (
          <button
            type="button"
            onClick={() => { onClose(); router.push("/quick-add"); }}
            className="w-full flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[12.5px] font-medium transition-colors nav-hover"
            style={{
              borderColor: "var(--app-accent-weak)",
              background: "var(--app-accent-light, var(--app-accent-weak))",
              color: "var(--app-accent-ink)",
            }}
          >
            <Sparkles size={14} style={{ color: "var(--app-accent)" }} />
            Быстрый ввод текстом — ИИ разберёт фразу или SMS банка
          </button>
        )}

        {/* Type picker */}
        <FormRow label="Тип">
          <div className="flex gap-1.5">
            {OP_TYPES.map((op) => (
              <button
                key={op.value}
                type="button"
                onPointerUp={() => { setOpType(op.value); setError(null); }}
                className={`flex-1 py-2.5 text-[12px] md:text-xs font-semibold rounded-xl border transition-colors touch-manipulation ${
                  opType === op.value
                    ? op.activeColor
                    : "bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/68"
                }`}
              >
                {op.label}
              </button>
            ))}
          </div>
        </FormRow>

        {opType && (
          <>
            {/* Amount */}
            <FormRow label="Сумма" required error={fieldErrors.amount}>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); clearFieldError("amount"); }}
                placeholder="0.00"
                tabular
                aria-invalid={Boolean(fieldErrors.amount) || undefined}
                autoFocus={!initialValues?.amount}
              />
            </FormRow>

            {/* Wallet(s) */}
            {opType !== "TRANSFER" ? (
              <FormRow label="Кошелёк" required error={fieldErrors.wallet_id}>
                <Select
                  value={walletId}
                  onChange={(v) => { setWalletId(v ? Number(v) : ""); clearFieldError("wallet_id"); }}
                  options={walletOptions}
                  placeholder="— выберите кошелёк —"
                />
              </FormRow>
            ) : (
              <>
                <FormRow label="Откуда" required error={fieldErrors.from_wallet_id}>
                  <Select
                    value={fromWalletId}
                    onChange={(v) => { setFromWalletId(v ? Number(v) : ""); clearFieldError("from_wallet_id"); }}
                    options={allWalletOptions}
                    placeholder="— кошелёк —"
                  />
                </FormRow>
                <FormRow label="Куда" required error={fieldErrors.to_wallet_id}>
                  <Select
                    value={toWalletId}
                    onChange={(v) => { setToWalletId(v ? Number(v) : ""); clearFieldError("to_wallet_id"); }}
                    options={allWalletOptions}
                    placeholder="— кошелёк —"
                  />
                </FormRow>
              </>
            )}

            {/* Goal for INCOME onto a SAVINGS wallet */}
            {showIncomeGoal && (
              <FormRow label="Цель накопления">
                <Select
                  value={toGoalId}
                  onChange={(v) => setToGoalId(v ? Number(v) : "")}
                  options={incomeGoalOptions}
                  placeholder="Без цели (по умолчанию)"
                />
                <p className="mt-1.5 text-[11px]" style={{ color: "var(--t-faint)" }}>
                  Доход на накопительный кошелёк попадает в выбранную цель,
                  без выбора — в «Без цели».
                </p>
              </FormRow>
            )}

            {/* Goal selectors for TRANSFER — only shown when the wallet is SAVINGS */}
            {opType === "TRANSFER" && showFromGoal && (
              <FormRow label="Цель (откуда)" required>
                <Select
                  value={fromGoalId}
                  onChange={(v) => setFromGoalId(v ? Number(v) : "")}
                  options={fromGoalOptions}
                  placeholder="— выберите цель —"
                />
                {fromGoalBalance && (
                  <p className="mt-1.5 text-[11px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                    По этой цели на кошельке:&nbsp;
                    <span style={{ color: "var(--t-secondary)" }}>
                      {new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(fromGoalBalance.amount)} {fromGoalBalance.currency}
                    </span>
                  </p>
                )}
              </FormRow>
            )}
            {opType === "TRANSFER" && showToGoal && (
              <FormRow label="Цель (куда)" required>
                <Select
                  value={toGoalId}
                  onChange={(v) => setToGoalId(v ? Number(v) : "")}
                  options={toGoalOptions}
                  placeholder="— выберите цель —"
                />
                {toGoalBalance && (
                  <p className="mt-1.5 text-[11px] tabular-nums" style={{ color: "var(--t-faint)" }}>
                    По этой цели на кошельке:&nbsp;
                    <span style={{ color: "var(--t-secondary)" }}>
                      {new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(toGoalBalance.amount)} {toGoalBalance.currency}
                    </span>
                  </p>
                )}
              </FormRow>
            )}

            {/* Category */}
            {(opType === "INCOME" || opType === "EXPENSE") && (
              <FormRow label="Категория">
                <Select
                  value={categoryId}
                  onChange={(v) => setCategoryId(v ? Number(v) : "")}
                  options={categoryOptions}
                  placeholder="— без категории —"
                  searchable
                />
                {(() => {
                  // Топ-3 кандидата чипами: тап — выбор, быстрее селекта
                  const visible = suggestions
                    .map((sug) => ({ sug, cat: (finCats ?? []).find((c) => c.category_id === sug.category_id) }))
                    .filter((x) => x.cat && x.sug.category_id !== Number(categoryId || 0));
                  if (visible.length === 0) return null;
                  return (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>Вероятно:</span>
                      {visible.map(({ sug, cat }, idx) => (
                        <button
                          key={sug.category_id}
                          type="button"
                          onClick={() => setCategoryId(sug.category_id)}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-md transition-colors"
                          style={{
                            background: `color-mix(in srgb, var(--app-accent) ${idx === 0 ? 12 : 7}%, transparent)`,
                            color: "rgb(129,140,248)",
                            opacity: idx === 0 ? 1 : 0.85,
                          }}
                          onMouseEnter={(e) => { (e.currentTarget.style.background = "color-mix(in srgb, var(--app-accent) 22%, transparent)"); }}
                          onMouseLeave={(e) => { (e.currentTarget.style.background = `color-mix(in srgb, var(--app-accent) ${idx === 0 ? 12 : 7}%, transparent)`); }}
                        >
                          {cat!.title}
                        </button>
                      ))}
                      {visible[0].sug.reason && (
                        <span className="text-[10.5px]" style={{ color: "var(--t-faint)" }}>
                          · {visible[0].sug.reason}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </FormRow>
            )}

            {/* Budget limit warning */}
            {limitWarning && (
              <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/20 text-[12px] leading-snug">
                <span className="text-amber-400 text-[15px] shrink-0 mt-px">⚠️</span>
                <span style={{ color: "var(--t-secondary)" }}>
                  С этой операцией вы выйдете за месячный лимит по категории на{" "}
                  <span className="font-semibold text-amber-400">
                    {new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(limitWarning.overBy)}
                  </span>.{" "}
                  Сохранить всё равно можно — просто имейте в виду.
                </span>
              </div>
            )}

            {/* Trip list link */}
            {tripLists && tripLists.length > 0 && (
              <FormRow label="Поездка" hint="Опционально — привязать к списку поездки">
                <Select
                  value={listId}
                  onChange={(v) => setListId(v ? Number(v) : "")}
                  options={[
                    { value: "", label: "— без списка —" },
                    ...tripLists.map((l) => ({ value: String(l.id), label: l.title })),
                  ]}
                  placeholder="— без списка —"
                />
              </FormRow>
            )}

            {/* Description */}
            <FormRow label="Описание">
              <Input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Необязательно"
              />
            </FormRow>

            {/* Occurred at */}
            <FormRow label="Дата и время">
              <DateTimeInput
                value={occurredAt}
                onChange={setOccurredAt}
              />
            </FormRow>

            {/* Бюджетный месяц: зарплата 31-го числа может «по смыслу» быть следующим месяцем */}
            <FormRow label="Месяц бюджета">
              <Select
                value={budgetMonth}
                onChange={setBudgetMonth}
                options={budgetMonthOptions(occurredAt, budgetMonth)}
              />
              {budgetMonth && (
                <p className="text-[11px] mt-1" style={{ color: "var(--t-faint)" }}>
                  В бюджете и статистике операция учтётся в выбранном месяце.
                  Дата и балансы не меняются.
                </p>
              )}
            </FormRow>

            {/* Subscription coverage (EXPENSE only) */}
            {opType === "EXPENSE" && (
              <FormRow label="Подписка">
                <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSubOpen((v) => !v)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-slate-600 dark:text-white/68 hover:text-slate-800 dark:hover:text-white/85 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors text-left"
                  >
                    <span>{subOpen ? "▾" : "▸"}</span>
                    <span>Привязать к подписке</span>
                  </button>

                  {subOpen && (
                    <div className="px-3 pb-3 flex flex-col gap-3 border-t border-slate-200 dark:border-white/[0.08] pt-3">
                      {/* Subscription select */}
                      <div>
                        <Select
                          value={subSubscriptionId}
                          onChange={(v) => { setSubSubscriptionId(v ? Number(v) : ""); setSubMemberId(""); }}
                          options={subscriptionOptions}
                          placeholder="— выберите подписку —"
                        />
                      </div>

                      {/* Payer type chips */}
                      <div>
                        <div className="text-[11px] font-medium uppercase tracking-wider mb-1.5 text-slate-500 dark:text-white/55">Плательщик</div>
                        <div className="flex gap-2">
                          {(["SELF", "MEMBER"] as const).map((pt) => (
                            <button
                              key={pt}
                              type="button"
                              onClick={() => setSubPayerType(pt)}
                              className={`${chipBaseCls} ${subPayerType === pt ? chipActiveCls : chipInactiveCls}`}
                            >
                              {pt === "SELF" ? "Сам" : "Участник"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Member select (only when MEMBER payer type) */}
                      {subPayerType === "MEMBER" && (
                        <div>
                          <Select
                            value={subMemberId}
                            onChange={(v) => setSubMemberId(v ? Number(v) : "")}
                            options={memberOptions}
                            placeholder="— участник —"
                          />
                        </div>
                      )}

                      {/* Coverage dates */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-[11px] font-medium uppercase tracking-wider mb-1.5 text-slate-500 dark:text-white/55">Начало периода</div>
                          <DateInput
                            value={subStartDate}
                            onChange={setSubStartDate}
                          />
                        </div>
                        <div>
                          <div className="text-[11px] font-medium uppercase tracking-wider mb-1.5 text-slate-500 dark:text-white/55">Конец периода</div>
                          <DateInput
                            value={subEndDate}
                            onChange={setSubEndDate}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </FormRow>
            )}
          </>
        )}

        {!opType && (
          <p className="text-xs text-slate-500 dark:text-white/55 text-center py-2">Выберите тип операции выше</p>
        )}

        {error && (
          <p className="text-sm text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl px-3 py-2.5">
            {error}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}

"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WalletItem, FinCategoryItem, SubscriptionItem } from "@/types/api";
import { Select } from "@/components/ui/Select";
import type { SelectOption } from "@/components/ui/Select";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FormRow } from "@/components/ui/FormRow";
import { X } from "lucide-react";
import { CreateTransactionRequestSchema } from "@/schemas/api.generated";
import {
  validateWithSchema, mergeErrors, parseBackendErrors,
  inputErrorBorder, type FieldErrors,
} from "@/lib/formErrors";
import { api } from "@/lib/api";
import { Button } from "@/components/primitives/Button";

type OpType = "INCOME" | "EXPENSE" | "TRANSFER";

interface GoalItem {
  goal_id: number;
  title: string;
  currency: string;
}

export interface CreateOperationInitialValues {
  opType?: OpType;
  amount?: string;
  walletId?: number;
  fromWalletId?: number;
  toWalletId?: number;
  categoryId?: number;
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

const inputCls =
  "w-full px-3 h-10 text-base rounded-xl border focus:outline-none focus:border-indigo-500/60 transition-colors bg-white dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.08] text-slate-800 dark:text-white/85 placeholder-slate-400 dark:placeholder-white/25";
const chipBaseCls = "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer";
const chipActiveCls = "bg-indigo-600 border-indigo-500 text-white";
const chipInactiveCls = "bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-white/68 hover:bg-slate-50 dark:hover:bg-white/[0.05]";

const OP_TYPES: { value: OpType; label: string; activeColor: string }[] = [
  { value: "INCOME",   label: "Доход",       activeColor: "bg-emerald-600 border-emerald-500 text-white" },
  { value: "EXPENSE",  label: "Расход",       activeColor: "bg-red-600 border-red-500 text-white" },
  { value: "TRANSFER", label: "Перемещение",  activeColor: "bg-blue-600 border-blue-500 text-white" },
];

export function CreateOperationModal({ onClose, initialValues, occurrenceId, initialListId }: Props) {
  const qc = useQueryClient();
  const formRef = useRef<HTMLFormElement | null>(null);

  const [opType, setOpType] = useState<OpType | null>(initialValues?.opType ?? "EXPENSE");
  const [amount, setAmount] = useState(initialValues?.amount ?? "");
  const [walletId, setWalletId] = useState<number | "">(initialValues?.walletId ?? "");
  const [fromWalletId, setFromWalletId] = useState<number | "">(initialValues?.fromWalletId ?? "");
  const [toWalletId, setToWalletId] = useState<number | "">(initialValues?.toWalletId ?? "");
  const [categoryId, setCategoryId] = useState<number | "">(initialValues?.categoryId ?? "");
  const [listId, setListId] = useState<number | "">(initialListId ?? "");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState("");

  // Transfer goal selectors
  const [fromGoalId, setFromGoalId] = useState<number | "">("");
  const [toGoalId, setToGoalId] = useState<number | "">("");

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
    enabled: opType === "TRANSFER",
  });

  const { data: tripLists } = useQuery<TripListOption[]>({
    queryKey: ["shared-lists", "trip"],
    queryFn: async () => {
      const all = await api.get<TripListOption[]>("/api/v2/lists");
      return all.filter((l) => l.list_type === "trip");
    },
    staleTime: 60_000,
  });

  const relevantCats = finCats?.filter((c) => c.category_type === opType && c.parent_id !== null) ?? [];
  const parentCats = finCats?.filter((c) => c.category_type === opType && c.parent_id === null) ?? [];
  const freqCats = finCats?.filter((c) => c.category_type === opType && c.is_frequent) ?? [];

  const visibleWallets = (wallets ?? [])
    .filter((w) => !(opType === "EXPENSE" && w.wallet_type === "SAVINGS"))
    .slice()
    .sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));

  const selectedFromWallet = (wallets ?? []).find((w) => w.wallet_id === fromWalletId);
  const selectedToWallet = (wallets ?? []).find((w) => w.wallet_id === toWalletId);
  const showFromGoal = selectedFromWallet?.wallet_type === "SAVINGS";
  const showToGoal = selectedToWallet?.wallet_type === "SAVINGS";

  const walletOptions: SelectOption[] = useMemo(() => {
    const opts: SelectOption[] = [{ value: "", label: "— выберите кошелёк —" }];
    const top3 = visibleWallets.slice(0, 3);
    const rest = visibleWallets.slice(3);
    if (rest.length > 0) {
      top3.forEach((w) => opts.push({ value: String(w.wallet_id), label: `${w.title} (${w.currency})`, group: "★ Частые" }));
      rest.forEach((w) => opts.push({ value: String(w.wallet_id), label: `${w.title} (${w.currency})`, group: "Все кошельки" }));
    } else {
      visibleWallets.forEach((w) => opts.push({ value: String(w.wallet_id), label: `${w.title} (${w.currency})` }));
    }
    return opts;
  }, [visibleWallets]);

  const allWalletOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— кошелёк —" },
    ...(wallets ?? []).map((w) => ({ value: String(w.wallet_id), label: w.title })),
  ], [wallets]);

  const categoryOptions: SelectOption[] = useMemo(() => {
    const opts: SelectOption[] = [{ value: "", label: "— без категории —" }];
    if (freqCats.length > 0) {
      freqCats.forEach((c) => opts.push({ value: String(c.category_id), label: c.title, group: "★ Частые" }));
    }
    parentCats.forEach((parent) => {
      const children = relevantCats.filter((c) => c.parent_id === parent.category_id);
      if (children.length === 0) {
        opts.push({ value: String(parent.category_id), label: parent.title });
      } else {
        children.forEach((c) => opts.push({ value: String(c.category_id), label: c.title, group: parent.title }));
      }
    });
    return opts;
  }, [freqCats, parentCats, relevantCats]);

  const subscriptionOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— выберите подписку —" },
    ...(subscriptions ?? []).map((s) => ({ value: String(s.id), label: s.name })),
  ], [subscriptions]);

  const selectedSub = (subscriptions ?? []).find((s) => s.id === subSubscriptionId);

  const memberOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— участник —" },
    ...(selectedSub?.members ?? []).map((m) => ({ value: String(m.member_id), label: m.contact_name })),
  ], [selectedSub]);

  const goalOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— без цели —" },
    ...(goals ?? []).map((g) => ({ value: String(g.goal_id), label: g.title })),
  ], [goals]);

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
    }
    if (opType === "EXPENSE" && subSubscriptionId) {
      body.sub_subscription_id = subSubscriptionId;
      body.sub_payer_type = subPayerType;
      body.sub_member_id = subMemberId || null;
      body.sub_start_date = subStartDate || null;
      body.sub_end_date = subEndDate || null;
    }
    body.list_id = listId || null;
    return body;
  }

  function validate(): boolean {
    if (!opType) { setError("Выберите тип операции"); return false; }

    const payload = buildPayload();

    // Layer 1: Zod schema (from backend contract)
    const zodErrs = validateWithSchema(CreateTransactionRequestSchema, payload);

    // Layer 2: Business rules
    const custom: FieldErrors = {};
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) custom.amount = "Введите корректную сумму";
    if (opType !== "TRANSFER" && !walletId) custom.wallet_id = "Выберите кошелёк";
    if (opType === "TRANSFER") {
      if (!fromWalletId) custom.from_wallet_id = "Выберите кошелёк-источник";
      if (!toWalletId) custom.to_wallet_id = "Выберите кошелёк-получатель";
      if (fromWalletId && toWalletId && fromWalletId === toWalletId) custom.to_wallet_id = "Кошельки должны отличаться";
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
      if (listId) {
        qc.invalidateQueries({ queryKey: ["list-transactions", Number(listId)] });
        qc.invalidateQueries({ queryKey: ["list-summary", Number(listId)] });
      }
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
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); clearFieldError("amount"); }}
                placeholder="0.00"
                className={`${inputCls} text-base font-semibold ${fieldErrors.amount ? inputErrorBorder : ""}`}
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

            {/* Goal selectors for TRANSFER — only shown when the wallet is SAVINGS */}
            {opType === "TRANSFER" && showFromGoal && (
              <FormRow label="Цель (откуда)">
                <Select
                  value={fromGoalId}
                  onChange={(v) => setFromGoalId(v ? Number(v) : "")}
                  options={goalOptions}
                  placeholder="— без цели —"
                />
              </FormRow>
            )}
            {opType === "TRANSFER" && showToGoal && (
              <FormRow label="Цель (куда)">
                <Select
                  value={toGoalId}
                  onChange={(v) => setToGoalId(v ? Number(v) : "")}
                  options={goalOptions}
                  placeholder="— без цели —"
                />
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
              </FormRow>
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
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Необязательно"
                className={inputCls}
              />
            </FormRow>

            {/* Occurred at */}
            <FormRow label="Дата и время">
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className={inputCls}
                />
                {occurredAt && (
                  <button
                    type="button"
                    onClick={() => setOccurredAt("")}
                    className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-white/55 hover:text-slate-700 dark:hover:text-white/80 transition-colors"
                    aria-label="Очистить дату/время"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
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
                          <input
                            type="date"
                            value={subStartDate}
                            onChange={(e) => setSubStartDate(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <div className="text-[11px] font-medium uppercase tracking-wider mb-1.5 text-slate-500 dark:text-white/55">Конец периода</div>
                          <input
                            type="date"
                            value={subEndDate}
                            onChange={(e) => setSubEndDate(e.target.value)}
                            className={inputCls}
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

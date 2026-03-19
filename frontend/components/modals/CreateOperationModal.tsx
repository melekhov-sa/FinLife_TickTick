"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WalletItem, FinCategoryItem, SubscriptionItem } from "@/types/api";
import { Select } from "@/components/ui/Select";
import type { SelectOption } from "@/components/ui/Select";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CreateTransactionRequestSchema } from "@/schemas/api.generated";
import {
  validateWithSchema, mergeErrors, parseBackendErrors,
  inputErrorBorder, errTextCls, type FieldErrors,
} from "@/lib/formErrors";

type OpType = "INCOME" | "EXPENSE" | "TRANSFER";

interface Props {
  onClose: () => void;
}

const inputCls =
  "w-full px-3 h-9 text-base md:text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors [color-scheme:dark]";
const labelCls = "block text-[11px] md:text-xs font-medium text-white/72 uppercase tracking-wider mb-1.5";
const chipBaseCls = "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer";
const chipActiveCls = "bg-indigo-600 border-indigo-500 text-white";
const chipInactiveCls = "bg-white/[0.03] border-white/[0.08] text-white/68 hover:text-white/85 hover:bg-white/[0.05]";

const OP_TYPES: { value: OpType; label: string; activeColor: string }[] = [
  { value: "INCOME",   label: "Доход",       activeColor: "bg-emerald-600 border-emerald-500 text-white" },
  { value: "EXPENSE",  label: "Расход",       activeColor: "bg-red-600 border-red-500 text-white" },
  { value: "TRANSFER", label: "Перемещение",  activeColor: "bg-blue-600 border-blue-500 text-white" },
];

export function CreateOperationModal({ onClose }: Props) {
  const qc = useQueryClient();

  const [opType, setOpType] = useState<OpType | null>(null);
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState<number | "">("");
  const [fromWalletId, setFromWalletId] = useState<number | "">("");
  const [toWalletId, setToWalletId] = useState<number | "">("");
  const [categoryId, setCategoryId] = useState<number | "">("");
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
    queryFn: () => fetch("/api/v2/wallets", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
    enabled: opType !== null,
  });

  const { data: finCats } = useQuery<FinCategoryItem[]>({
    queryKey: ["fin-categories"],
    queryFn: () => fetch("/api/v2/fin-categories", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60_000,
    enabled: opType === "INCOME" || opType === "EXPENSE",
  });

  const { data: subscriptions } = useQuery<SubscriptionItem[]>({
    queryKey: ["subscriptions"],
    queryFn: () => fetch("/api/v2/subscriptions", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60_000,
    enabled: opType === "EXPENSE" && subOpen,
  });

  const relevantCats = finCats?.filter((c) => c.category_type === opType && c.parent_id !== null) ?? [];
  const parentCats = finCats?.filter((c) => c.category_type === opType && c.parent_id === null) ?? [];
  const freqCats = finCats?.filter((c) => c.category_type === opType && c.is_frequent) ?? [];

  const visibleWallets = (wallets ?? [])
    .filter((w) => !(opType === "EXPENSE" && w.wallet_type === "SAVINGS"))
    .slice()
    .sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));

  const walletOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— выберите кошелёк —" },
    ...visibleWallets.map((w) => ({ value: String(w.wallet_id), label: `${w.title} (${w.currency})` })),
  ], [visibleWallets]);

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

  useEffect(() => { setCategoryId(""); }, [opType]);

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
      const res = await fetch("/api/v2/transactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const parsed = parseBackendErrors(res.status, data);
        if (parsed.fieldErrors) setFieldErrors(parsed.fieldErrors);
        else setError(parsed.message ?? "Ошибка при создании операции");
        return;
      }
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      onClose();
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setSaving(false);
    }
  }

  const headerTitle = opType
    ? `Новая операция · ${OP_TYPES.find((o) => o.value === opType)!.label}`
    : "Новая операция";

  const footer = opType ? (
    <div className="flex gap-2.5">
      <button
        type="submit"
        disabled={saving}
        className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
      >
        {saving ? "Сохраняем…" : "Создать операцию"}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2.5 text-sm font-medium rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/68 hover:text-white/65 hover:bg-white/[0.08] transition-colors hidden md:block"
      >
        Отмена
      </button>
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
      {/* Type picker */}
      <div>
        <div className="flex gap-1.5">
          {OP_TYPES.map((op) => (
            <button
              key={op.value}
              type="button"
              onClick={() => { setOpType(op.value); setError(null); }}
              className={`flex-1 py-2 text-[11px] md:text-xs font-medium rounded-xl border transition-colors ${
                opType === op.value
                  ? op.activeColor
                  : "bg-white/[0.03] border-white/[0.08] text-white/68 hover:text-white/65 hover:bg-white/[0.05]"
              }`}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      {opType && (
        <>
          {/* Amount */}
          <div>
            <label className={labelCls}>Сумма *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); clearFieldError("amount"); }}
              placeholder="0.00"
              className={`${inputCls} h-10 text-base font-semibold ${fieldErrors.amount ? inputErrorBorder : ""}`}
              autoFocus
            />
            {fieldErrors.amount && <p className={errTextCls}>{fieldErrors.amount}</p>}
          </div>

          {/* Wallet(s) */}
          {opType !== "TRANSFER" ? (
            <div>
              <label className={labelCls}>Кошелёк *</label>
              <Select
                value={walletId}
                onChange={(v) => { setWalletId(v ? Number(v) : ""); clearFieldError("wallet_id"); }}
                options={walletOptions}
                placeholder="— выберите кошелёк —"
              />
              {fieldErrors.wallet_id && <p className={errTextCls}>{fieldErrors.wallet_id}</p>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Откуда *</label>
                <Select
                  value={fromWalletId}
                  onChange={(v) => { setFromWalletId(v ? Number(v) : ""); clearFieldError("from_wallet_id"); }}
                  options={allWalletOptions}
                  placeholder="— кошелёк —"
                />
                {fieldErrors.from_wallet_id && <p className={errTextCls}>{fieldErrors.from_wallet_id}</p>}
              </div>
              <div>
                <label className={labelCls}>Куда *</label>
                <Select
                  value={toWalletId}
                  onChange={(v) => { setToWalletId(v ? Number(v) : ""); clearFieldError("to_wallet_id"); }}
                  options={allWalletOptions}
                  placeholder="— кошелёк —"
                />
                {fieldErrors.to_wallet_id && <p className={errTextCls}>{fieldErrors.to_wallet_id}</p>}
              </div>
            </div>
          )}

          {/* Goal selectors for TRANSFER */}
          {opType === "TRANSFER" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Цель (откуда)</label>
                {/* TODO: add v2 endpoint for goals (/api/v2/goals) */}
                <input
                  type="number"
                  value={fromGoalId}
                  onChange={(e) => setFromGoalId(e.target.value ? Number(e.target.value) : "")}
                  placeholder="ID цели"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Цель (куда)</label>
                {/* TODO: add v2 endpoint for goals (/api/v2/goals) */}
                <input
                  type="number"
                  value={toGoalId}
                  onChange={(e) => setToGoalId(e.target.value ? Number(e.target.value) : "")}
                  placeholder="ID цели"
                  className={inputCls}
                />
              </div>
            </div>
          )}

          {/* Category */}
          {(opType === "INCOME" || opType === "EXPENSE") && (
            <div>
              <label className={labelCls}>Категория</label>
              <Select
                value={categoryId}
                onChange={(v) => setCategoryId(v ? Number(v) : "")}
                options={categoryOptions}
                placeholder="— без категории —"
                searchable
              />
            </div>
          )}

          {/* Description */}
          <div>
            <label className={labelCls}>Описание</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Необязательно"
              className={inputCls}
            />
          </div>

          {/* Occurred at */}
          <div>
            <label className={labelCls}>Дата и время</label>
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className={inputCls}
            />
          </div>

          {/* Subscription coverage (EXPENSE only) */}
          {opType === "EXPENSE" && (
            <div className="rounded-xl border border-white/[0.08] overflow-hidden">
              <button
                type="button"
                onClick={() => setSubOpen((v) => !v)}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-white/68 hover:text-white/85 hover:bg-white/[0.03] transition-colors text-left"
              >
                <span>{subOpen ? "▾" : "▸"}</span>
                <span>Привязать к подписке</span>
              </button>

              {subOpen && (
                <div className="px-3 pb-3 flex flex-col gap-3 border-t border-white/[0.08] pt-3">
                  {/* Subscription select */}
                  <div>
                    <label className={labelCls}>Подписка</label>
                    <Select
                      value={subSubscriptionId}
                      onChange={(v) => { setSubSubscriptionId(v ? Number(v) : ""); setSubMemberId(""); }}
                      options={subscriptionOptions}
                      placeholder="— выберите подписку —"
                    />
                  </div>

                  {/* Payer type chips */}
                  <div>
                    <label className={labelCls}>Плательщик</label>
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
                      <label className={labelCls}>Участник</label>
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
                      <label className={labelCls}>Начало периода</label>
                      <input
                        type="date"
                        value={subStartDate}
                        onChange={(e) => setSubStartDate(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Конец периода</label>
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
          )}
        </>
      )}

      {!opType && (
        <p className="text-xs text-white/55 text-center py-2">Выберите тип операции выше</p>
      )}

      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          {error}
        </p>
      )}
    </BottomSheet>
  );
}

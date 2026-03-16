"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { WalletItem, FinCategoryItem } from "@/types/api";
import { Select } from "@/components/ui/Select";
import type { SelectOption } from "@/components/ui/Select";

type OpType = "INCOME" | "EXPENSE" | "TRANSFER";

interface Props {
  onClose: () => void;
}

const inputCls =
  "w-full px-3 h-9 text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors [color-scheme:dark]";
const labelCls = "block text-xs font-medium text-white/72 uppercase tracking-wider mb-1.5";

const OP_TYPES: { value: OpType; label: string; activeColor: string; dotColor: string }[] = [
  { value: "INCOME",   label: "Доход",        activeColor: "bg-emerald-600 border-emerald-500 text-white", dotColor: "text-emerald-400" },
  { value: "EXPENSE",  label: "Расход",        activeColor: "bg-red-600 border-red-500 text-white",        dotColor: "text-red-400" },
  { value: "TRANSFER", label: "Перемещение",   activeColor: "bg-blue-600 border-blue-500 text-white",      dotColor: "text-blue-400" },
];

export function CreateOperationModal({ onClose }: Props) {
  const qc = useQueryClient();
  const overlayRef = useRef<HTMLDivElement>(null);

  const [opType, setOpType] = useState<OpType | null>(null);
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState<number | "">("");
  const [fromWalletId, setFromWalletId] = useState<number | "">("");
  const [toWalletId, setToWalletId] = useState<number | "">("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
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

  // Filter categories by type
  const relevantCats = finCats?.filter(
    (c) => c.category_type === opType && c.parent_id !== null
  ) ?? [];
  const parentCats = finCats?.filter(
    (c) => c.category_type === opType && c.parent_id === null
  ) ?? [];
  const freqCats = finCats?.filter(
    (c) => c.category_type === opType && c.is_frequent
  ) ?? [];

  // Filter wallets: hide SAVINGS for EXPENSE
  const visibleWallets = (wallets ?? []).filter(
    (w) => !(opType === "EXPENSE" && w.wallet_type === "SAVINGS")
  );

  // Build wallet SelectOptions
  const walletOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— выберите кошелёк —" },
    ...visibleWallets.map((w) => ({ value: String(w.wallet_id), label: `${w.title} (${w.currency})` })),
  ], [visibleWallets]);

  const allWalletOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— кошелёк —" },
    ...(wallets ?? []).map((w) => ({ value: String(w.wallet_id), label: w.title })),
  ], [wallets]);

  // Build category SelectOptions with groups (★ Частые, then parent/child groups)
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

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Reset category when switching type
  useEffect(() => { setCategoryId(""); }, [opType]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setError("Введите корректную сумму");
      return;
    }
    if (opType !== "TRANSFER" && !walletId) { setError("Выберите кошелёк"); return; }
    if (opType === "TRANSFER" && (!fromWalletId || !toWalletId)) { setError("Выберите кошельки"); return; }

    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        operation_type: opType,
        amount,
        description,
      };
      if (opType === "TRANSFER") {
        body.from_wallet_id = fromWalletId;
        body.to_wallet_id = toWalletId;
      } else {
        body.wallet_id = walletId;
        body.category_id = categoryId || null;
      }

      const res = await fetch("/api/v2/transactions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Ошибка при создании операции");
        return;
      }
      qc.invalidateQueries({ queryKey: ["dashboard"] });
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

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-md mx-4 bg-[#1a1d23] border border-white/[0.09] rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/[0.06]">
          <h2 className="text-base font-semibold text-white/90" style={{ letterSpacing: "-0.02em" }}>
            {headerTitle}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-white/65 hover:text-white/65 hover:bg-white/[0.07] transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        <div className="p-6">
          {/* Type picker */}
          <div className="flex gap-1.5 mb-5">
            {OP_TYPES.map((op) => (
              <button
                key={op.value}
                type="button"
                onClick={() => setOpType(op.value)}
                className={`flex-1 py-2 text-xs font-medium rounded-xl border transition-colors ${
                  opType === op.value
                    ? op.activeColor
                    : "bg-white/[0.03] border-white/[0.08] text-white/68 hover:text-white/65 hover:bg-white/[0.05]"
                }`}
              >
                {op.label}
              </button>
            ))}
          </div>

          {opType && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Amount */}
              <div>
                <label className={labelCls}>Сумма *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={`${inputCls} h-10 text-base font-semibold`}
                  autoFocus
                />
              </div>

              {/* Wallet(s) */}
              {opType !== "TRANSFER" ? (
                <div>
                  <label className={labelCls}>Кошелёк *</label>
                  <Select
                    value={walletId}
                    onChange={(v) => setWalletId(v ? Number(v) : "")}
                    options={walletOptions}
                    placeholder="— выберите кошелёк —"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Откуда *</label>
                    <Select
                      value={fromWalletId}
                      onChange={(v) => setFromWalletId(v ? Number(v) : "")}
                      options={allWalletOptions}
                      placeholder="— кошелёк —"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Куда *</label>
                    <Select
                      value={toWalletId}
                      onChange={(v) => setToWalletId(v ? Number(v) : "")}
                      options={allWalletOptions}
                      placeholder="— кошелёк —"
                    />
                  </div>
                </div>
              )}

              {/* Category (income/expense only) */}
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

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-1">
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
                  className="px-4 py-2.5 text-sm font-medium rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/68 hover:text-white/65 hover:bg-white/[0.08] transition-colors"
                >
                  Отмена
                </button>
              </div>
            </form>
          )}

          {!opType && (
            <p className="text-xs text-white/55 text-center py-2">Выберите тип операции выше</p>
          )}
        </div>
      </div>
    </div>
  );
}

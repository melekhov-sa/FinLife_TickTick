"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Select } from "@/components/ui/Select";

interface Props {
  onClose: () => void;
}

const WALLET_TYPES = [
  { value: "REGULAR",  label: "Обычный" },
  { value: "SAVINGS",  label: "Накопительный" },
  { value: "CREDIT",   label: "Кредитный" },
];

const inputCls =
  "w-full px-3 h-10 text-base rounded-xl border focus:outline-none focus:border-indigo-500/60 transition-colors bg-white dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.08] text-slate-800 dark:text-white/85 placeholder-slate-400 dark:placeholder-white/25";
const labelCls =
  "block text-[11px] md:text-xs font-medium uppercase tracking-wider mb-1.5 text-slate-500 dark:text-white/72";

export function CreateWalletModal({ onClose }: Props) {
  const qc = useQueryClient();

  const [title, setTitle]               = useState("");
  const [walletType, setWalletType]     = useState("REGULAR");
  const [currency, setCurrency]         = useState("RUB");
  const [initialBalance, setInitialBalance] = useState("0");
  const [error, setError]               = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      setError("Введите название кошелька");
      return;
    }
    const cur = currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(cur)) {
      setError("Валюта должна быть 3 заглавные буквы (например RUB, USD)");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.post("/api/v2/wallets", {
        title: t,
        wallet_type: walletType,
        currency: cur,
        initial_balance: initialBalance || "0",
      });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const match = msg.match(/API error \d+: ([\s\S]*)/);
      if (match) { try { setError(JSON.parse(match[1])?.detail ?? "Ошибка"); } catch { setError("Ошибка при создании кошелька"); } }
      else setError("Не удалось подключиться к серверу");
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div className="flex gap-2.5">
      <button
        type="submit"
        disabled={saving}
        className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
      >
        {saving ? "Создаём…" : "Создать"}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2.5 text-sm font-medium rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/68 hover:text-white/65 hover:bg-white/[0.08] transition-colors hidden md:block"
      >
        Отмена
      </button>
    </div>
  );

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Создать кошелёк"
      footer={footer}
      onSubmit={handleSubmit}
    >
      {/* Title */}
      <div>
        <label className={labelCls}>Название *</label>
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setError(null); }}
          placeholder="Название кошелька"
          className={`${inputCls} h-10`}
          autoFocus
        />
      </div>

      {/* Wallet type */}
      <div>
        <label className={labelCls}>Тип кошелька</label>
        <Select
          value={walletType}
          onChange={(v) => setWalletType(v)}
          options={WALLET_TYPES.map((t) => ({ value: t.value, label: t.label }))}
        />
      </div>

      {/* Currency */}
      <div>
        <label className={labelCls}>Валюта</label>
        <input
          type="text"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
          placeholder="RUB"
          maxLength={3}
          className={inputCls}
        />
        <p className="text-[10px] text-white/40 mt-1">
          3 заглавные буквы: RUB, USD, EUR…
        </p>
      </div>

      {/* Initial balance */}
      <div>
        <label className={labelCls}>Начальный баланс</label>
        <input
          type="number"
          step="0.01"
          value={initialBalance}
          onChange={(e) => setInitialBalance(e.target.value)}
          placeholder="0"
          className={inputCls}
        />
        {walletType === "CREDIT" && (
          <p className="text-[10px] text-white/40 mt-1">
            Для кредитного кошелька начальный баланс должен быть 0 или отрицательным
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
          {error}
        </p>
      )}
    </BottomSheet>
  );
}

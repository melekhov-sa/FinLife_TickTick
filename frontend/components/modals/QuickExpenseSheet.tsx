"use client";

/**
 * Экспресс-ввод операции: сначала сумма (крупный numpad), потом категория
 * чипом — три касания на самый частый сценарий. Поддерживает выражения
 * (1200+350) прямо в сумме.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Delete, Check } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { WalletItem, FinCategoryItem } from "@/types/api";
import { getCategoryColor } from "@/lib/categoryColor";
import { getCategoryEmoji } from "@/lib/categoryEmoji";
import { hapticSuccess, hapticTick } from "@/lib/native";
import { Select, type SelectOption } from "@/components/ui/Select";

type OpType = "INCOME" | "EXPENSE";

/** "1200+350-50" → 1500; null, если выражение неполное/битое. */
function evalExpr(expr: string): number | null {
  const cleaned = expr.replace(/,/g, ".").replace(/\s/g, "");
  if (!cleaned || /[+\-.]$/.test(cleaned)) return null;
  if (!/^\d+(\.\d+)?([+-]\d+(\.\d+)?)*$/.test(cleaned)) return null;
  const tokens = cleaned.match(/[+-]?\d+(\.\d+)?/g);
  if (!tokens) return null;
  const sum = tokens.reduce((acc, t) => acc + parseFloat(t), 0);
  return sum > 0 ? Math.round(sum * 100) / 100 : null;
}

const KEYS = [
  "7", "8", "9", "del",
  "4", "5", "6", "+",
  "1", "2", "3", "-",
  ",", "0", "00", "ok",
] as const;

export function QuickExpenseSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [opType, setOpType] = useState<OpType>("EXPENSE");
  const [expr, setExpr] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [walletId, setWalletId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<number[]>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: wallets } = useQuery<WalletItem[]>({
    queryKey: ["wallets"],
    queryFn: () => api.get<WalletItem[]>("/api/v2/wallets"),
    staleTime: 60_000,
  });
  const { data: finCats } = useQuery<FinCategoryItem[]>({
    queryKey: ["fin-categories"],
    queryFn: () => api.get<FinCategoryItem[]>("/api/v2/fin-categories"),
    staleTime: 300_000,
  });

  const sortedWallets = useMemo(
    () =>
      (wallets ?? [])
        .filter((w) => !(opType === "EXPENSE" && w.wallet_type === "SAVINGS"))
        .slice()
        .sort((a, b) => b.operations_count_30d - a.operations_count_30d),
    [wallets, opType],
  );

  // Кошелёк по умолчанию — самый используемый
  useEffect(() => {
    if (walletId == null && sortedWallets.length > 0) setWalletId(sortedWallets[0].wallet_id);
  }, [sortedWallets, walletId]);

  const amount = evalExpr(expr);
  const hasOp = /[+-]/.test(expr.slice(1));

  // Чипы: частые категории типа + подсказки движка (после суммы)
  const chipCats = useMemo(() => {
    const forType = (finCats ?? []).filter((c) => c.category_type === opType && c.parent_id !== null);
    const byId = new Map(forType.map((c) => [c.category_id, c]));
    const ordered: FinCategoryItem[] = [];
    for (const id of suggested) {
      const c = byId.get(id);
      if (c) ordered.push(c);
    }
    for (const c of forType.filter((c) => c.is_frequent)) {
      if (!ordered.some((x) => x.category_id === c.category_id)) ordered.push(c);
    }
    for (const c of forType) {
      if (ordered.length >= 8) break;
      if (!ordered.some((x) => x.category_id === c.category_id)) ordered.push(c);
    }
    return ordered.slice(0, 8);
  }, [finCats, opType, suggested]);

  // Подсказка категории по сумме (тот же движок, что в полной форме)
  useEffect(() => {
    if (!amount || !walletId) return;
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    suggestTimer.current = setTimeout(async () => {
      try {
        const res = await api.post<{ category_id: number; exact?: boolean }[]>(
          "/api/v2/transactions/suggest-category",
          {
            amount: String(amount),
            wallet_id: walletId,
            operation_type: opType,
            hour: new Date().getHours(),
            description: description.trim() || null,
            date: null,
          },
        );
        setSuggested(res.map((r) => r.category_id));
        if (res[0]?.exact && categoryId == null) setCategoryId(res[0].category_id);
      } catch {
        setSuggested([]);
      }
    }, 500);
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, walletId, opType, description]);

  function press(key: (typeof KEYS)[number]) {
    void hapticTick();
    setError(null);
    if (key === "del") {
      setExpr((e) => e.slice(0, -1));
      return;
    }
    if (key === "ok") {
      void save();
      return;
    }
    setExpr((e) => {
      if (key === "+" || key === "-") {
        if (!e || /[+\-,]$/.test(e)) return e;
        return e + key;
      }
      if (key === ",") {
        const lastNum = e.split(/[+-]/).pop() ?? "";
        if (!e || lastNum.includes(",") || /[+-]$/.test(e)) return e;
        return e + ",";
      }
      if (e.replace(/[^0-9]/g, "").length >= 9) return e;
      if (key === "00" && (!e || /[+\-,]$/.test(e))) return e;
      return e + key;
    });
  }

  async function save() {
    const val = evalExpr(expr);
    if (!val) { setError("Введи сумму"); return; }
    if (!walletId) { setError("Выбери кошелёк"); return; }
    setSaving(true);
    try {
      await api.post("/api/v2/transactions", {
        operation_type: opType,
        amount: String(val),
        wallet_id: walletId,
        category_id: categoryId,
        description: description.trim(),
        occurred_at: null,
        suggested_category_id: suggested[0] ?? null,
      });
      void hapticSuccess();
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["budget"] });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.replace(/^API error \d+: /, "") : "Ошибка");
      setSaving(false);
    }
  }

  const walletOptions: SelectOption[] = sortedWallets.map((w) => ({
    value: String(w.wallet_id),
    label: `${w.title} · ${parseFloat(w.balance).toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ${w.currency === "RUB" ? "₽" : w.currency}`,
  }));

  const sheet = (
    // z ниже шитов Select (10000) и ActionSheet (10001) — их пикеры открываются поверх
    <div className="fixed inset-0 z-[9990] flex flex-col" style={{ background: "var(--app-bg)" }}>
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 pb-2 shrink-0"
        style={{ paddingTop: "max(14px, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-xl"
          style={{ color: "var(--t-muted)", background: "var(--app-card-bg)", border: "1px solid var(--app-border)" }}
          aria-label="Закрыть"
        >
          <X size={16} />
        </button>
        <div className="flex-1 flex justify-center gap-1.5">
          {(["EXPENSE", "INCOME"] as OpType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setOpType(t); setCategoryId(null); void hapticTick(); }}
              className="px-3.5 h-9 rounded-xl text-[13px] font-semibold transition-colors"
              style={
                opType === t
                  ? { background: t === "EXPENSE" ? "var(--c-danger-ink)" : "var(--c-success-ink)", color: "#fff" }
                  : { background: "var(--app-card-bg)", color: "var(--t-muted)", border: "1px solid var(--app-border)" }
              }
            >
              {t === "EXPENSE" ? "Расход" : "Доход"}
            </button>
          ))}
        </div>
        <div className="w-9" />
      </div>

      {/* Amount */}
      <div className="flex flex-col items-center justify-center px-6 pt-4 pb-2 shrink-0">
        <div
          className="text-[44px] font-bold tabular-nums font-display leading-none min-h-[48px]"
          style={{ color: expr ? "var(--t-primary)" : "var(--t-faint)" }}
        >
          {expr || "0"}
          <span className="text-[24px] font-semibold ml-1" style={{ color: "var(--t-faint)" }}>₽</span>
        </div>
        {hasOp && amount != null && (
          <div className="text-[15px] mt-1 tabular-nums" style={{ color: "var(--t-muted)" }}>
            = {amount.toLocaleString("ru-RU")}
          </div>
        )}
        {error && <p className="text-[12px] mt-1" style={{ color: "var(--c-danger-ink)" }}>{error}</p>}
      </div>

      {/* Wallet + description */}
      <div className="px-4 space-y-2 shrink-0">
        <Select
          value={walletId != null ? String(walletId) : ""}
          onChange={(v) => setWalletId(v ? Number(v) : null)}
          options={walletOptions}
          placeholder="— кошелёк —"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Описание (необязательно)"
          enterKeyHint="done"
          className="w-full h-10 px-3 rounded-xl text-[14px] outline-none"
          style={{ background: "var(--app-card-bg)", border: "1px solid var(--app-border)", color: "var(--t-primary)" }}
        />
      </div>

      {/* Category chips */}
      <div className="px-4 pt-3 pb-1 shrink-0 overflow-x-auto">
        <div className="flex gap-1.5 flex-wrap">
          {chipCats.map((c) => {
            const active = categoryId === c.category_id;
            const emoji = getCategoryEmoji(c.title, c.emoji);
            const color = getCategoryColor(c.category_id, c.color);
            return (
              <button
                key={c.category_id}
                type="button"
                onClick={() => { setCategoryId(active ? null : c.category_id); void hapticTick(); }}
                className="px-2.5 h-8 rounded-full text-[12.5px] font-medium transition-all active:scale-95 flex items-center gap-1"
                style={
                  active
                    ? { background: color, color: "#fff" }
                    : { background: "var(--app-card-bg)", color: "var(--t-secondary)", border: `1px solid ${color}55` }
                }
              >
                {emoji && <span className="text-[13px] leading-none">{emoji}</span>}
                {c.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Numpad */}
      <div className="flex-1 flex flex-col justify-end px-3" style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}>
        <div className="grid grid-cols-4 gap-2">
          {KEYS.map((k) => {
            const isOk = k === "ok";
            const isDel = k === "del";
            const isOp = k === "+" || k === "-";
            return (
              <button
                key={k}
                type="button"
                disabled={isOk && (saving || !amount)}
                onClick={() => press(k)}
                className="h-[58px] rounded-2xl text-[22px] font-semibold tabular-nums transition-all active:scale-95 flex items-center justify-center disabled:opacity-40"
                style={
                  isOk
                    ? { background: "var(--app-accent-gradient, var(--app-accent))", color: "#fff" }
                    : isDel || isOp
                    ? { background: "var(--app-card-bg)", color: "var(--t-muted)", border: "1px solid var(--app-border)" }
                    : { background: "var(--app-card-bg)", color: "var(--t-primary)", border: "1px solid var(--app-border)" }
                }
              >
                {isOk ? <Check size={24} strokeWidth={2.5} /> : isDel ? <Delete size={20} /> : k}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(sheet, document.body);
}

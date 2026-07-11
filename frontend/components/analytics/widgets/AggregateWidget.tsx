"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Settings, RefreshCw } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import type { FinCategoryItem, WalletItem } from "@/types/api";
import type { WidgetProps } from "../types";

// ── Config ────────────────────────────────────────────────────────────────────

interface AggregateCfg {
  label: string;
  operation_type: "INCOME" | "EXPENSE";
  period: "year" | "quarter" | "month";
  category_ids: number[];
  wallet_id: number | null;
  show_comparison: boolean;
}

interface AggregateResult {
  total: string;
  currency: string;
  period_label: string;
  prev_total: string;
  prev_period_label: string;
  tx_count: number;
}

const cfgKey = (id: string) => `finlife:aggregate-cfg-${id}`;

function loadCfg(instanceId: string): AggregateCfg | null {
  try {
    const raw = localStorage.getItem(cfgKey(instanceId));
    return raw ? (JSON.parse(raw) as AggregateCfg) : null;
  } catch {
    return null;
  }
}

function saveCfg(instanceId: string, cfg: AggregateCfg) {
  localStorage.setItem(cfgKey(instanceId), JSON.stringify(cfg));
}

function clearCfg(instanceId: string) {
  localStorage.removeItem(cfgKey(instanceId));
}

// ── Setup form ────────────────────────────────────────────────────────────────

function SetupForm({
  instanceId,
  onDone,
}: {
  instanceId: string;
  onDone: (cfg: AggregateCfg) => void;
}) {
  const { data: finCats = [] } = useQuery<FinCategoryItem[]>({
    queryKey: ["fin-categories"],
    queryFn: () => api.get<FinCategoryItem[]>("/api/v2/fin-categories"),
    staleTime: 5 * 60_000,
  });
  const { data: wallets = [] } = useQuery<WalletItem[]>({
    queryKey: ["wallets"],
    queryFn: () => api.get<WalletItem[]>("/api/v2/wallets"),
    staleTime: 60_000,
  });

  const [label, setLabel] = useState("");
  const [opType, setOpType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [period, setPeriod] = useState<"year" | "quarter" | "month">("year");
  const [catIds, setCatIds] = useState<number[]>([]);
  const [walletId, setWalletId] = useState<number | null>(null);
  const [showComparison, setShowComparison] = useState(true);

  const catsForType = finCats.filter(
    (c) => c.category_type === opType && !c.is_archived,
  );

  useEffect(() => { setCatIds([]); }, [opType]);

  function toggleCat(id: number) {
    setCatIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cfg: AggregateCfg = {
      label: label.trim() || (opType === "EXPENSE" ? "Расходы" : "Доходы"),
      operation_type: opType,
      period,
      category_ids: catIds,
      wallet_id: walletId,
      show_comparison: showComparison,
    };
    saveCfg(instanceId, cfg);
    onDone(cfg);
  }

  const chipBase = "px-2 py-0.5 rounded-md font-medium transition-colors text-[11px]";
  const chipOn = "bg-[var(--app-accent-light)] text-[var(--app-accent)]";
  const chipOff = "bg-white/[0.04] hover:bg-white/[0.07]";

  return (
    <form onSubmit={handleSubmit} className="h-full flex flex-col gap-2.5 p-3 overflow-y-auto">
      {/* Label */}
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Название, напр. «Теннис»"
        autoFocus
        className="w-full px-2.5 py-1.5 bg-white/[0.05] border border-white/[0.08] rounded-lg focus:outline-none focus:border-[var(--app-accent)] text-[13px]"
        style={{ color: "var(--t-primary)" }}
      />

      {/* Op type */}
      <div className="flex gap-1">
        {(["EXPENSE", "INCOME"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setOpType(t)}
            className={clsx("flex-1 py-1 rounded-lg font-medium transition-colors text-[11px]",
              opType === t ? chipOn : chipOff)}
            style={{ color: opType === t ? undefined : "var(--t-faint)" }}
          >
            {t === "EXPENSE" ? "Расходы" : "Доходы"}
          </button>
        ))}
      </div>

      {/* Period */}
      <div className="flex gap-1">
        {(["year", "quarter", "month"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={clsx("flex-1 py-1 rounded-lg font-medium transition-colors text-[11px]",
              period === p ? chipOn : chipOff)}
            style={{ color: period === p ? undefined : "var(--t-faint)" }}
          >
            {p === "year" ? "Год" : p === "quarter" ? "Квартал" : "Месяц"}
          </button>
        ))}
      </div>

      {/* Categories */}
      {catsForType.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--t-faint)" }}>
            Категории{catIds.length > 0 ? ` · выбрано ${catIds.length}` : " · все"}
          </p>
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {catsForType.map((c) => (
              <button
                key={c.category_id}
                type="button"
                onClick={() => toggleCat(c.category_id)}
                className={clsx(chipBase, catIds.includes(c.category_id) ? chipOn : chipOff)}
                style={{ color: catIds.includes(c.category_id) ? undefined : "var(--t-faint)" }}
              >
                {c.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Wallet */}
      {wallets.filter((w) => !w.is_archived).length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--t-faint)" }}>
            Кошелёк{walletId ? "" : " · все"}
          </p>
          <div className="flex flex-wrap gap-1">
            {wallets
              .filter((w) => !w.is_archived)
              .map((w) => (
                <button
                  key={w.wallet_id}
                  type="button"
                  onClick={() => setWalletId(walletId === w.wallet_id ? null : w.wallet_id)}
                  className={clsx(chipBase, walletId === w.wallet_id ? chipOn : chipOff)}
                  style={{ color: walletId === w.wallet_id ? undefined : "var(--t-faint)" }}
                >
                  {w.title}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Comparison toggle */}
      <label className="flex items-center gap-2 cursor-pointer text-[11px]" style={{ color: "var(--t-secondary)" }}>
        <input
          type="checkbox"
          checked={showComparison}
          onChange={(e) => setShowComparison(e.target.checked)}
          className="w-3.5 h-3.5 accent-[var(--app-accent)]"
        />
        Сравнение с прошлым периодом
      </label>

      <button
        type="submit"
        className="mt-auto w-full py-2 rounded-xl text-[13px] font-semibold bg-[var(--app-accent)] hover:bg-[var(--app-accent)] text-white transition-colors"
      >
        Готово
      </button>
    </form>
  );
}

// ── Display ───────────────────────────────────────────────────────────────────

function pluralizeOps(n: number): string {
  const last2 = Math.abs(n) % 100;
  const last1 = Math.abs(n) % 10;
  if (last2 >= 11 && last2 <= 19) return "операций";
  if (last1 === 1) return "операция";
  if (last1 >= 2 && last1 <= 4) return "операции";
  return "операций";
}

function AggregateDisplay({
  cfg,
  onReset,
}: {
  cfg: AggregateCfg;
  instanceId: string;
  onReset: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  const { data, isLoading } = useQuery<AggregateResult>({
    queryKey: [
      "aggregate",
      cfg.operation_type,
      cfg.period,
      cfg.category_ids.slice().sort().join(","),
      cfg.wallet_id,
    ],
    queryFn: () =>
      api.post<AggregateResult>("/api/v2/transactions/aggregate", {
        operation_type: cfg.operation_type,
        period: cfg.period,
        category_ids: cfg.category_ids,
        wallet_id: cfg.wallet_id,
      }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center animate-pulse">
        <div className="w-20 h-8 rounded-lg" style={{ background: "var(--c-neutral-bg)" }} />
      </div>
    );
  }

  const total = parseFloat(data?.total ?? "0");
  const prevTotal = parseFloat(data?.prev_total ?? "0");
  const delta = total - prevTotal;
  const deltaPct = prevTotal !== 0 ? (delta / prevTotal) * 100 : null;
  const isExpense = cfg.operation_type === "EXPENSE";
  const trendUp = delta > 0;
  const trendColor = isExpense
    ? trendUp ? "text-red-400" : "text-emerald-400"
    : trendUp ? "text-emerald-400" : "text-red-400";

  const formatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(total);
  const prevFormatted = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(prevTotal);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1 relative">
        <span className="flex-1 text-[13px] font-semibold truncate min-w-0" style={{ color: "var(--t-primary)" }}>
          {cfg.label}
        </span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0"
          style={{ background: "var(--c-neutral-bg)", color: "var(--t-faint)" }}>
          {data?.period_label}
        </span>
        <button
          onClick={() => setShowMenu((v) => !v)}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/[0.08] transition-colors shrink-0"
          style={{ color: "var(--t-faint)" }}
        >
          <Settings size={11} />
        </button>
        {showMenu && (
          <div
            className="absolute top-6 right-0 z-20 bg-slate-800 border border-white/[0.10] rounded-xl shadow-xl overflow-hidden"
            style={{ minWidth: 170 }}
          >
            <button
              onClick={() => { onReset(); setShowMenu(false); }}
              className="w-full text-left px-3 py-2 text-[12px] hover:bg-white/[0.06] transition-colors"
              style={{ color: "var(--t-secondary)" }}
            >
              <RefreshCw size={11} className="inline mr-2 opacity-60" />
              Изменить настройки
            </button>
          </div>
        )}
      </div>

      {/* Main value */}
      <div className="flex-1 flex flex-col items-center justify-center gap-1">
        <span
          className="tabular-nums font-black leading-none"
          style={{
            fontSize: "clamp(28px, 12cqw, 56px)",
            letterSpacing: "-0.04em",
            color: "var(--t-primary)",
          }}
        >
          {formatted}
        </span>
        <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>
          {data?.currency} · {data?.tx_count ?? 0} {pluralizeOps(data?.tx_count ?? 0)}
        </span>

        {/* Comparison */}
        {cfg.show_comparison && data && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[11px] tabular-nums" style={{ color: "var(--t-faint)" }}>
              {prevFormatted} в {data.prev_period_label}
            </span>
            {delta !== 0 && deltaPct !== null && (
              <span className={clsx("text-[11px] font-semibold tabular-nums", trendColor)}>
                {trendUp ? "+" : ""}{deltaPct.toFixed(0)}%
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function AggregateWidget({ instanceId }: WidgetProps) {
  const [cfg, setCfg] = useState<AggregateCfg | null>(null);

  useEffect(() => {
    setCfg(loadCfg(instanceId));
  }, [instanceId]);

  function handleDone(newCfg: AggregateCfg) {
    setCfg(newCfg);
  }

  function handleReset() {
    clearCfg(instanceId);
    setCfg(null);
  }

  if (!cfg) {
    return <SetupForm instanceId={instanceId} onDone={handleDone} />;
  }

  return <AggregateDisplay cfg={cfg} instanceId={instanceId} onReset={handleReset} />;
}

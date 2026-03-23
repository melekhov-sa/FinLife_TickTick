"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { CreateOperationModal } from "@/components/modals/CreateOperationModal";
import { Select } from "@/components/ui/Select";
import type { SelectOption } from "@/components/ui/Select";
import { clsx } from "clsx";
import { SlidersHorizontal, X, Pencil } from "lucide-react";
import type { WalletItem, FinCategoryItem } from "@/types/api";
import { api } from "@/lib/api";

interface TransactionItem {
  transaction_id: number;
  operation_type: string;
  amount: string;
  currency: string;
  wallet_id: number | null;
  from_wallet_id: number | null;
  to_wallet_id: number | null;
  category_id: number | null;
  category_title: string | null;
  description: string;
  occurred_at: string;
}

interface TransactionsResponse {
  total: number;
  page: number;
  per_page: number;
  pages: number;
  items: TransactionItem[];
}

const OP_TYPE_COLORS: Record<string, string> = {
  INCOME:   "text-emerald-400",
  EXPENSE:  "text-red-400",
  TRANSFER: "text-blue-400",
};

const OP_TYPE_LABELS: Record<string, string> = {
  INCOME:   "Доход",
  EXPENSE:  "Расход",
  TRANSFER: "Перемещение",
};

const OP_ACCENT: Record<string, string> = {
  INCOME:   "bg-emerald-500",
  EXPENSE:  "bg-red-400",
  TRANSFER: "bg-blue-400",
};

// ── Edit Transaction Modal ─────────────────────────────────────────────────────

function EditTransactionModal({
  tx,
  wallets,
  finCats,
  onClose,
  onSaved,
}: {
  tx: TransactionItem;
  wallets: WalletItem[];
  finCats: FinCategoryItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(tx.amount);
  const [walletId, setWalletId] = useState<string>(String(tx.wallet_id ?? ""));
  const [categoryId, setCategoryId] = useState<string>(String(tx.category_id ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTransfer = tx.operation_type === "TRANSFER";

  const walletOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— кошелёк —" },
    ...(wallets ?? []).map((w) => ({ value: String(w.wallet_id), label: `${w.title} (${w.currency})` })),
  ], [wallets]);

  const categoryOptions: SelectOption[] = useMemo(() => {
    const cats = (finCats ?? []).filter(
      (c) => c.category_type === tx.operation_type && c.parent_id !== null
    );
    return [
      { value: "", label: "— без категории —" },
      ...cats.map((c) => ({ value: String(c.category_id), label: c.title })),
    ];
  }, [finCats, tx.operation_type]);

  const inputCls = "w-full px-3 h-9 text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors [color-scheme:dark]";
  const labelCls = "block text-[11px] font-medium text-white/55 uppercase tracking-wider mb-1.5";

  async function handleSave() {
    const n = parseFloat(amount);
    if (!amount || isNaN(n) || n <= 0) { setError("Введите корректную сумму"); return; }
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/v2/transactions/${tx.transaction_id}`, {
        amount,
        ...(isTransfer ? {} : { wallet_id: walletId ? Number(walletId) : undefined }),
        ...(isTransfer ? {} : { category_id: categoryId ? Number(categoryId) : null }),
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.replace(/^API error \d+: /, "") : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-[#131b2e] border border-white/[0.10] rounded-2xl shadow-2xl p-5 w-[340px] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-white/90">Редактировать операцию</h3>
          <button
            onClick={onClose}
            className="text-[18px] leading-none w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/[0.06] text-white/50 transition-colors"
          >
            ×
          </button>
        </div>

        <div>
          <label className={labelCls}>Сумма</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputCls}
            autoFocus
          />
        </div>

        {!isTransfer && (
          <div>
            <label className={labelCls}>Кошелёк</label>
            <Select value={walletId} onChange={setWalletId} options={walletOptions} />
          </div>
        )}

        {(tx.operation_type === "INCOME" || tx.operation_type === "EXPENSE") && (
          <div>
            <label className={labelCls}>Категория</label>
            <Select value={categoryId} onChange={setCategoryId} options={categoryOptions} searchable />
          </div>
        )}

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl py-2 text-[13px] font-semibold border border-white/[0.08] hover:bg-white/[0.04] text-white/60 transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl py-2 text-[13px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
          >
            {saving ? "..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatAmount(amount: string, type: string, currency: string) {
  const num = parseFloat(amount);
  const sign = type === "INCOME" ? "+" : type === "EXPENSE" ? "\u2212" : "\u2194";
  const curr = currency === "RUB" ? "\u20bd" : currency;
  return `${sign}${num.toLocaleString("ru-RU", { minimumFractionDigits: 2 })} ${curr}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function MoneyPage() {
  const [showOpModal, setShowOpModal] = useState(false);
  const [editTx, setEditTx] = useState<TransactionItem | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [opTypeFilter, setOpTypeFilter] = useState("");
  const [walletFilter, setWalletFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const qc = useQueryClient();

  const params = new URLSearchParams();
  if (opTypeFilter) params.set("operation_type", opTypeFilter);
  if (walletFilter) params.set("wallet_id", walletFilter);
  if (categoryFilter) params.set("category_id", categoryFilter);
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  if (search) params.set("search", search);
  params.set("page", String(page));

  const { data, isLoading, isError } = useQuery<TransactionsResponse>({
    queryKey: ["transactions", opTypeFilter, walletFilter, categoryFilter, dateFrom, dateTo, search, page],
    queryFn: () => api.get<TransactionsResponse>(`/api/v2/transactions?${params}`),
    staleTime: 30_000,
  });

  const { data: wallets } = useQuery<WalletItem[]>({
    queryKey: ["wallets"],
    queryFn: () => api.get<WalletItem[]>("/api/v2/wallets"),
    staleTime: 60_000,
  });

  const { data: finCats } = useQuery<FinCategoryItem[]>({
    queryKey: ["fin-categories"],
    queryFn: () => api.get<FinCategoryItem[]>("/api/v2/fin-categories"),
    staleTime: 5 * 60_000,
  });

  const walletMap = Object.fromEntries((wallets ?? []).map((w) => [w.wallet_id, w.title]));

  const inputCls = "px-3 py-1.5 md:py-2 text-base md:text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/70 focus:outline-none focus:border-indigo-500/40 transition-colors [color-scheme:dark]";

  const opTypeOptions = useMemo(() => [
    { value: "", label: "Все типы" },
    { value: "INCOME",   label: "Доходы" },
    { value: "EXPENSE",  label: "Расходы" },
    { value: "TRANSFER", label: "Переводы" },
  ], []);

  const walletOptions = useMemo(() => [
    { value: "", label: "Все кошельки" },
    ...(wallets ?? []).map((w) => ({ value: String(w.wallet_id), label: w.title })),
  ], [wallets]);

  const categoryOptions = useMemo(() => [
    { value: "", label: "Все категории" },
    ...(finCats ?? []).filter((c) => c.parent_id !== null).map((c) => ({ value: String(c.category_id), label: c.title })),
  ], [finCats]);

  function resetFilters() {
    setOpTypeFilter(""); setWalletFilter(""); setCategoryFilter("");
    setDateFrom(""); setDateTo(""); setSearch(""); setPage(1);
  }

  const hasFilters = !!(opTypeFilter || walletFilter || categoryFilter || dateFrom || dateTo || search);
  const activeFilterCount = [opTypeFilter, walletFilter, categoryFilter, dateFrom, dateTo, search].filter(Boolean).length;

  return (
    <>
      {showOpModal && <CreateOperationModal onClose={() => { setShowOpModal(false); }} />}
      {editTx && (
        <EditTransactionModal
          tx={editTx}
          wallets={wallets ?? []}
          finCats={finCats ?? []}
          onClose={() => setEditTx(null)}
          onSaved={() => {
            setEditTx(null);
            qc.invalidateQueries({ queryKey: ["transactions"] });
            qc.invalidateQueries({ queryKey: ["wallets"] });
          }}
        />
      )}
      <AppTopbar title="Финансы" />

      <main className="flex-1 overflow-auto p-3 md:p-6 max-w-3xl">
        {/* Header actions */}
        <div className="flex items-center gap-2 mb-3 md:mb-6">
          <a
            href="/wallets"
            className="text-[11px] md:text-xs font-medium px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white/75 hover:bg-white/[0.08] transition-colors"
          >
            Кошельки
          </a>
          <a
            href="/legacy/budget"
            className="text-[11px] md:text-xs font-medium px-3 md:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/50 hover:text-white/75 hover:bg-white/[0.08] transition-colors"
          >
            Бюджет
          </a>
          <button
            onClick={() => setShowOpModal(true)}
            className="ml-auto bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] md:text-xs font-medium rounded-lg md:rounded-xl px-3 md:px-4 py-1.5 md:py-2 transition-colors"
          >
            + Операция
          </button>
        </div>

        {/* Mobile: collapsible filter toggle */}
        <div className="md:hidden mb-3">
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={clsx(
              "flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-lg border transition-colors",
              hasFilters
                ? "bg-indigo-500/[0.08] border-indigo-500/20 text-indigo-300"
                : "bg-white/[0.04] border-white/[0.08] text-white/55"
            )}
          >
            <SlidersHorizontal size={12} />
            Фильтры
            {activeFilterCount > 0 && (
              <span className="ml-0.5 text-[9px] font-bold bg-indigo-500/20 text-indigo-300 rounded-full w-4 h-4 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filters — always visible on desktop, toggleable on mobile */}
        <div className={clsx(
          "bg-white/[0.02] border border-white/[0.05] rounded-xl md:rounded-2xl p-3 md:p-4 mb-3 md:mb-5 space-y-2 md:space-y-3",
          "md:block",
          filtersOpen ? "block" : "hidden md:block"
        )}>
          <div className="flex items-center justify-between md:justify-start">
            <p className="text-[9px] md:text-[10px] font-semibold text-white/60 uppercase tracking-widest">Фильтры</p>
            <button
              onClick={() => setFiltersOpen(false)}
              className="md:hidden w-5 h-5 flex items-center justify-center rounded-md hover:bg-white/[0.08]"
              style={{ color: "var(--t-faint)" }}
            >
              <X size={12} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            <div className="w-full md:w-40">
              <Select value={opTypeFilter} onChange={(v) => { setOpTypeFilter(v); setPage(1); }} options={opTypeOptions} />
            </div>
            <div className="w-[calc(50%-3px)] md:w-44">
              <Select value={walletFilter} onChange={(v) => { setWalletFilter(v); setPage(1); }} options={walletOptions} />
            </div>
            <div className="w-[calc(50%-3px)] md:w-48">
              <Select value={categoryFilter} onChange={(v) => { setCategoryFilter(v); setPage(1); }} options={categoryOptions} searchable />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className={`${inputCls} w-[calc(50%-3px)] md:w-auto`} placeholder="От" />
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className={`${inputCls} w-[calc(50%-3px)] md:w-auto`} placeholder="До" />
            <input
              type="text" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Поиск..."
              className={`${inputCls} flex-1 min-w-0`}
            />
            {hasFilters && (
              <button
                onClick={resetFilters}
                className="text-[11px] md:text-xs font-medium text-white/60 hover:text-white/55 transition-colors px-2"
              >
                Сбросить
              </button>
            )}
          </div>
        </div>

        {/* Stats + loading */}
        {data && (
          <p className="text-[9px] md:text-[10px] font-semibold text-white/60 uppercase tracking-widest mb-2 md:mb-4">
            {data.total} операций
          </p>
        )}

        {isLoading && (
          <div className="space-y-1">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-12 md:h-14 bg-white/[0.02] rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-red-400/70 text-sm text-center py-12">Не удалось загрузить операции</p>
        )}

        {data && data.items.length === 0 && !isLoading && (
          <div className="flex flex-col items-center py-12 md:py-16 text-center">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-3 md:mb-4">
              <span className="text-lg md:text-xl">💳</span>
            </div>
            <p className="text-white/60 text-[13px] md:text-sm font-medium">Нет операций по заданным фильтрам</p>
          </div>
        )}

        {data && data.items.length > 0 && (
          <>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl md:rounded-2xl overflow-hidden">
              {data.items.map((tx, i) => (
                <div
                  key={tx.transaction_id}
                  className={clsx(
                    "flex items-center gap-2.5 md:gap-3 px-3 md:px-4 py-2.5 md:py-3.5 hover:bg-white/[0.03] transition-colors group/tx",
                    i < data.items.length - 1 && "border-b border-white/[0.04]"
                  )}
                >
                  <div
                    className={clsx("w-0.5 md:w-1 h-8 md:h-9 rounded-full shrink-0", OP_ACCENT[tx.operation_type] ?? "bg-white/20")}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] md:text-sm text-white/80 font-medium truncate leading-snug">
                      {tx.description || tx.category_title || OP_TYPE_LABELS[tx.operation_type]}
                    </p>
                    <p className="text-[10px] md:text-[11px] text-white/50 mt-0.5 truncate">
                      {tx.operation_type === "TRANSFER"
                        ? `${walletMap[tx.from_wallet_id ?? 0] ?? "?"} → ${walletMap[tx.to_wallet_id ?? 0] ?? "?"}`
                        : walletMap[tx.wallet_id ?? 0] ?? ""}
                      {tx.category_title && tx.description && ` · ${tx.category_title}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setEditTx(tx)}
                      className="opacity-0 group-hover/tx:opacity-100 w-6 h-6 flex items-center justify-center rounded-md hover:bg-white/[0.08] text-white/40 hover:text-white/70 transition-all"
                      title="Редактировать"
                    >
                      <Pencil size={12} />
                    </button>
                    <div className="text-right">
                      <p className={clsx("text-[13px] md:text-sm font-semibold tabular-nums leading-snug", OP_TYPE_COLORS[tx.operation_type])}>
                        {formatAmount(tx.amount, tx.operation_type, tx.currency)}
                      </p>
                      <p className="text-[9px] md:text-[11px] text-white/45 mt-0.5 tabular-nums">
                        {formatDate(tx.occurred_at)} · {formatTime(tx.occurred_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {data.pages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4 md:mt-6">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 md:px-4 py-1.5 md:py-2 text-[11px] md:text-xs font-medium rounded-lg md:rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/72 hover:text-white/70 disabled:opacity-30 transition-colors"
                >
                  ← Назад
                </button>
                <span className="text-[11px] md:text-xs font-medium text-white/65 tabular-nums">
                  {page} / {data.pages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                  disabled={page === data.pages}
                  className="px-3 md:px-4 py-1.5 md:py-2 text-[11px] md:text-xs font-medium rounded-lg md:rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/72 hover:text-white/70 disabled:opacity-30 transition-colors"
                >
                  Вперёд →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

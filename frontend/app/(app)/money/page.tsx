"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { CreateOperationModal } from "@/components/modals/CreateOperationModal";
import { Select } from "@/components/ui/Select";
import { clsx } from "clsx";
import { SlidersHorizontal, X } from "lucide-react";
import type { WalletItem, FinCategoryItem } from "@/types/api";

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [opTypeFilter, setOpTypeFilter] = useState("");
  const [walletFilter, setWalletFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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
    queryFn: () =>
      fetch(`/api/v2/transactions?${params}`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });

  const { data: wallets } = useQuery<WalletItem[]>({
    queryKey: ["wallets"],
    queryFn: () => fetch("/api/v2/wallets", { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: finCats } = useQuery<FinCategoryItem[]>({
    queryKey: ["fin-categories"],
    queryFn: () => fetch("/api/v2/fin-categories", { credentials: "include" }).then((r) => r.json()),
    staleTime: 5 * 60_000,
  });

  const walletMap = Object.fromEntries((wallets ?? []).map((w) => [w.wallet_id, w.title]));

  const inputCls = "px-3 py-1.5 md:py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/70 focus:outline-none focus:border-indigo-500/40 transition-colors [color-scheme:dark]";

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
                    "flex items-center gap-2.5 md:gap-3 px-3 md:px-4 py-2.5 md:py-3.5 hover:bg-white/[0.03] transition-colors",
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
                  <div className="text-right shrink-0">
                    <p className={clsx("text-[13px] md:text-sm font-semibold tabular-nums leading-snug", OP_TYPE_COLORS[tx.operation_type])}>
                      {formatAmount(tx.amount, tx.operation_type, tx.currency)}
                    </p>
                    <p className="text-[9px] md:text-[11px] text-white/45 mt-0.5 tabular-nums">
                      {formatDate(tx.occurred_at)} · {formatTime(tx.occurred_at)}
                    </p>
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

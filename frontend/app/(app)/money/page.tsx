"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { PageTabs } from "@/components/layout/PageTabs";
import { CreateOperationModal } from "@/components/modals/CreateOperationModal";
import { Select } from "@/components/ui/Select";
import type { SelectOption } from "@/components/ui/Select";
import { clsx } from "clsx";
import { SlidersHorizontal, X, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import type { WalletItem, FinCategoryItem } from "@/types/api";
import { api } from "@/lib/api";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { DateInput } from "@/components/primitives/DateInput";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FormRow } from "@/components/ui/FormRow";
import { Skeleton } from "@/components/primitives/Skeleton";
import { Tooltip } from "@/components/primitives/Tooltip";
import { Table, type TableColumn } from "@/components/primitives/Table";
import { Badge } from "@/components/primitives/Badge";

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

  const footer = (
    <div className="flex gap-2">
      <Button variant="secondary" size="md" onClick={onClose} fullWidth>
        Отмена
      </Button>
      <Button variant="primary" size="md" loading={saving} onClick={handleSave} fullWidth>
        Сохранить
      </Button>
    </div>
  );

  return (
    <BottomSheet open onClose={onClose} title="Редактировать операцию" footer={footer}>
      <div className="space-y-4">
        <FormRow label="Сумма" required>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            tabular
            autoFocus
          />
        </FormRow>

        {!isTransfer && (
          <FormRow label="Кошелёк">
            <Select value={walletId} onChange={setWalletId} options={walletOptions} />
          </FormRow>
        )}

        {(tx.operation_type === "INCOME" || tx.operation_type === "EXPENSE") && (
          <FormRow label="Категория">
            <Select value={categoryId} onChange={setCategoryId} options={categoryOptions} searchable />
          </FormRow>
        )}

        {error && <p className="text-red-500 text-xs">{error}</p>}
      </div>
    </BottomSheet>
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
      <AppTopbar title="Деньги" />
      {/* Desktop tabs */}
      <div className="hidden md:block">
        <PageTabs tabs={[
          { href: "/money", label: "Операции" },
          { href: "/wallets", label: "Кошельки" },
          { href: "/subscriptions", label: "Подписки" },
          { href: "/categories", label: "Категории" },
        ]} />
      </div>

      <main className="flex-1 overflow-auto p-3 md:p-6 w-full">

        {/* ── Mobile: type filter + add button ── */}
        <div className="md:hidden flex items-center gap-2 mb-3">
          <div className="flex items-center gap-0.5 bg-slate-100 border border-slate-200 rounded-lg p-0.5 flex-1">
            {[
              { value: "", label: "Все" },
              { value: "EXPENSE", label: "Расходы" },
              { value: "INCOME", label: "Доходы" },
            ].map((t) => (
              <button
                key={t.value}
                onClick={() => { setOpTypeFilter(t.value); setPage(1); }}
                className={clsx(
                  "flex-1 py-1.5 rounded-md text-[12px] font-semibold transition-all text-center",
                  opTypeFilter === t.value
                    ? "bg-white shadow-sm text-slate-800"
                    : "text-slate-500"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowOpModal(true)}
            className="bg-indigo-600 text-white text-[12px] font-semibold rounded-lg px-3 py-2 shrink-0"
          >
            +
          </button>
        </div>

        {/* ── Desktop: header actions ── */}
        <div className="hidden md:flex items-center gap-2 mb-6">
          <a href="/wallets" className="text-xs font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
            Кошельки
          </a>
          <a href="/budget" className="text-xs font-medium px-4 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
            Бюджет
          </a>
          <button
            onClick={() => setShowOpModal(true)}
            className="ml-auto bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl px-4 py-2 transition-colors"
          >
            + Операция
          </button>
        </div>

        {/* ── Desktop: Filters ── */}
        <div className="hidden md:block bg-white border border-slate-200 rounded-2xl p-4 mb-5 space-y-3">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Фильтры</p>
          <div className="flex flex-wrap gap-2">
            <div className="w-40">
              <Select value={opTypeFilter} onChange={(v) => { setOpTypeFilter(v); setPage(1); }} options={opTypeOptions} />
            </div>
            <div className="w-44">
              <Select value={walletFilter} onChange={(v) => { setWalletFilter(v); setPage(1); }} options={walletOptions} />
            </div>
            <div className="w-48">
              <Select value={categoryFilter} onChange={(v) => { setCategoryFilter(v); setPage(1); }} options={categoryOptions} searchable />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <DateInput value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1); }} size="sm" placeholder="Дата с" />
            <DateInput value={dateTo} onChange={(v) => { setDateTo(v); setPage(1); }} size="sm" placeholder="Дата по" />
            <Input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Поиск..." size="sm" className="flex-1 min-w-0" />
            {hasFilters && (
              <button onClick={resetFilters} className="text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors px-2">
                Сбросить
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        {data && (
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2 md:mb-4">
            {data.total} операций
          </p>
        )}

        {isLoading && (
          <div className="space-y-1">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} variant="rect" className="h-12 md:h-14 rounded-xl" />
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
            {/* Mobile: card list */}
            <div className="md:hidden bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-xl overflow-hidden">
              {data.items.map((tx, i) => (
                <div
                  key={tx.transaction_id}
                  className={clsx(
                    "flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors group/tx",
                    i < data.items.length - 1 && "border-b border-slate-100 dark:border-white/[0.04]"
                  )}
                >
                  <div
                    className={clsx("w-1 h-8 rounded-full shrink-0", OP_ACCENT[tx.operation_type] ?? "bg-slate-200")}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate leading-snug" style={{ color: "var(--t-primary)" }}>
                      {tx.description || tx.category_title || OP_TYPE_LABELS[tx.operation_type]}
                    </p>
                    <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--t-faint)" }}>
                      {tx.operation_type === "TRANSFER"
                        ? `${walletMap[tx.from_wallet_id ?? 0] ?? "?"} → ${walletMap[tx.to_wallet_id ?? 0] ?? "?"}`
                        : walletMap[tx.wallet_id ?? 0] ?? ""}
                      {tx.category_title && tx.description && ` · ${tx.category_title}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Tooltip content="Редактировать">
                      <button
                        onClick={() => setEditTx(tx)}
                        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-all touch-manipulation"
                        style={{ color: "var(--t-faint)" }}
                      >
                        <Pencil size={12} />
                      </button>
                    </Tooltip>
                    <div className="text-right">
                      <p className={clsx("text-[13px] font-semibold tabular-nums leading-snug", OP_TYPE_COLORS[tx.operation_type])}>
                        {formatAmount(tx.amount, tx.operation_type, tx.currency)}
                      </p>
                      <p className="text-[9px] mt-0.5 tabular-nums" style={{ color: "var(--t-faint)" }}>
                        {formatDate(tx.occurred_at)} · {formatTime(tx.occurred_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: Table primitive */}
            <div className="hidden md:block">
              <Table<TransactionItem>
                data={data.items}
                rowKey={(tx) => tx.transaction_id}
                onRowClick={(tx) => setEditTx(tx)}
                variant="card"
                columns={[
                  {
                    key: "occurred_at",
                    label: "Дата",
                    width: 110,
                    sortable: true,
                    render: (tx) => (
                      <span className="tabular-nums" style={{ color: "var(--t-faint)" }}>
                        {formatDate(tx.occurred_at)}
                      </span>
                    ),
                  },
                  {
                    key: "description",
                    label: "Получатель",
                    sortable: true,
                    render: (tx) => (
                      <div className="min-w-0">
                        <span className="font-medium truncate block" style={{ color: "var(--t-primary)" }}>
                          {tx.description || tx.category_title || OP_TYPE_LABELS[tx.operation_type]}
                        </span>
                        <span className="text-[11px] mt-0.5 truncate block" style={{ color: "var(--t-faint)" }}>
                          {tx.operation_type === "TRANSFER"
                            ? `${walletMap[tx.from_wallet_id ?? 0] ?? "?"} → ${walletMap[tx.to_wallet_id ?? 0] ?? "?"}`
                            : walletMap[tx.wallet_id ?? 0] ?? ""}
                        </span>
                      </div>
                    ),
                  },
                  {
                    key: "category_title",
                    label: "Категория",
                    width: 160,
                    align: "center",
                    render: (tx) => tx.category_title ? (
                      <Badge variant="neutral" size="md" className="!normal-case !tracking-normal !font-medium">
                        {tx.category_title}
                      </Badge>
                    ) : (
                      <span style={{ color: "var(--t-faint)" }}>—</span>
                    ),
                  },
                  {
                    key: "amount",
                    label: "Сумма",
                    width: 160,
                    align: "right",
                    sortable: true,
                    render: (tx) => (
                      <span className={clsx("font-semibold tabular-nums", OP_TYPE_COLORS[tx.operation_type])}>
                        {formatAmount(tx.amount, tx.operation_type, tx.currency)}
                      </span>
                    ),
                  },
                ] as TableColumn<TransactionItem>[]}
              />
            </div>

            {/* Pagination */}
            {data.pages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-4 md:mt-6">
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  aria-label="Назад"
                >
                  <ChevronLeft size={16} />
                </Button>
                <span className="text-[11px] md:text-xs font-medium text-white/65 tabular-nums">
                  {page} / {data.pages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                  disabled={page === data.pages}
                  aria-label="Вперёд"
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

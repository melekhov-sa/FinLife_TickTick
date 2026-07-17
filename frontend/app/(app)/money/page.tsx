"use client";

import { useState, useMemo , useRef } from "react";
import { useTabSwipe } from "@/lib/useTabSwipe";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Tabs } from "@/components/primitives/Tabs";
import { CreateOperationModal, type CreateOperationInitialValues } from "@/components/modals/CreateOperationModal";
import { ActionSheet } from "@/components/primitives/ActionSheet";
import { hapticTick } from "@/lib/native";
import { Select } from "@/components/ui/Select";
import type { SelectOption } from "@/components/ui/Select";
import { clsx } from "clsx";
import { SlidersHorizontal, X, Pencil, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import type { WalletItem, FinCategoryItem } from "@/types/api";
import { api } from "@/lib/api";
import { budgetMonthOptions, budgetMonthDiffers, budgetMonthShort } from "@/lib/budgetMonth";
import { buildCategoryColorMap } from "@/lib/categoryColor";
import { getCategoryEmoji } from "@/lib/categoryEmoji";
import { SwipeRow } from "@/components/primitives/SwipeRow";
import { PullToRefresh } from "@/components/primitives/PullToRefresh";
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
  budget_month: string | null;
}

interface TransactionsResponse {
  total: number;
  page: number;
  per_page: number;
  pages: number;
  totals: Record<string, number>;
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
  const [budgetMonth, setBudgetMonth] = useState<string>(tx.budget_month ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

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
        budget_month: budgetMonth || null,
      });
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.replace(/^API error \d+: /, "") : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelConfirm() {
    setCancelling(true);
    try {
      await api.delete(`/api/v2/transactions/${tx.transaction_id}`);
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.replace(/^API error \d+: /, "") : "Ошибка отмены");
      setConfirmCancel(false);
    } finally {
      setCancelling(false);
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

        <FormRow label="Месяц бюджета">
          <Select
            value={budgetMonth}
            onChange={setBudgetMonth}
            options={budgetMonthOptions(tx.occurred_at, tx.budget_month)}
          />
          <p className="text-[11px] mt-1" style={{ color: "var(--t-faint)" }}>
            В каком месяце учитывать операцию в бюджете и статистике.
            Дата и балансы не меняются.
          </p>
        </FormRow>

        {error && <p className="text-red-500 text-xs">{error}</p>}

        {/* Cancel / archive operation */}
        {!confirmCancel ? (
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            className="flex items-center gap-1.5 text-[12px] mt-1 transition-colors"
            style={{ color: "var(--t-faint)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "rgb(248,113,113)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--t-faint)"; }}
          >
            <Trash2 size={13} />
            Отменить операцию
          </button>
        ) : (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3.5 py-3 flex flex-col gap-2.5">
            <p className="text-[12px] leading-snug" style={{ color: "var(--t-secondary)" }}>
              Операция будет отменена, баланс кошелька скорректируется. Это действие нельзя отменить.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmCancel(false)} fullWidth>
                Назад
              </Button>
              <Button
                variant="destructive"
                size="sm"
                loading={cancelling}
                onClick={handleCancelConfirm}
                fullWidth
              >
                Да, отменить
              </Button>
            </div>
          </div>
        )}
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

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function dayLabel(key: string): string {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const y = new Date(today.getTime() - 86400_000);
  const yesterdayKey = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
  if (key === todayKey) return "Сегодня";
  if (key === yesterdayKey) return "Вчера";
  const d = new Date(key + "T00:00:00");
  return d.toLocaleDateString("ru-RU", {
    weekday: "short", day: "numeric", month: "long",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

const MONEY_TABS = [
  { id: "/money",      label: "Операции" },
  { id: "/wallets",    label: "Кошельки" },
  { id: "/categories", label: "Категории" },
  { id: "/goals",      label: "Цели" },
  { id: "/savings",    label: "Накопления" },
];

function getMoneyTab(pathname: string | null): string {
  if (!pathname) return "/money";
  if (pathname.startsWith("/wallets"))    return "/wallets";
  if (pathname.startsWith("/categories")) return "/categories";
  if (pathname.startsWith("/goals"))      return "/goals";
  if (pathname.startsWith("/savings"))    return "/savings";
  return "/money";
}

export default function MoneyPage() {
  useTabSwipe(["/money", "/wallets", "/categories", "/goals", "/savings"], "/money");
  const pathname = usePathname();
  const router = useRouter();
  const [showOpModal, setShowOpModal] = useState(false);
  const [editTx, setEditTx] = useState<TransactionItem | null>(null);
  const [ctxTx, setCtxTx] = useState<TransactionItem | null>(null); // long-press меню
  const [repeatValues, setRepeatValues] = useState<CreateOperationInitialValues | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startLongPress(tx: TransactionItem) {
    longPressRef.current = setTimeout(() => {
      void hapticTick();
      setCtxTx(tx);
    }, 450);
  }
  function cancelLongPress() {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  }
  async function deleteTx(tx: TransactionItem) {
    try {
      await api.delete(`/api/v2/transactions/${tx.transaction_id}`);
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch { /* уже удалена */ }
  }
  function repeatTx(tx: TransactionItem) {
    setRepeatValues({
      opType: tx.operation_type as CreateOperationInitialValues["opType"],
      amount: tx.amount,
      walletId: tx.wallet_id ?? undefined,
      fromWalletId: tx.from_wallet_id ?? undefined,
      toWalletId: tx.to_wallet_id ?? undefined,
      categoryId: tx.category_id ?? undefined,
    });
  }
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

  // Сводка текущего месяца (когда фильтры не активны)
  const { data: aggInc } = useQuery<{ total: string; period_label: string }>({
    queryKey: ["tx-agg", "INCOME"],
    queryFn: () => api.post("/api/v2/transactions/aggregate", { operation_type: "INCOME", period: "month" }),
    staleTime: 60_000,
  });
  const { data: aggExp } = useQuery<{ total: string; period_label: string }>({
    queryKey: ["tx-agg", "EXPENSE"],
    queryFn: () => api.post("/api/v2/transactions/aggregate", { operation_type: "EXPENSE", period: "month" }),
    staleTime: 60_000,
  });
  const monthAgg = {
    label: aggExp?.period_label ?? aggInc?.period_label ?? "",
    income: parseFloat(aggInc?.total ?? "0") || 0,
    expense: parseFloat(aggExp?.total ?? "0") || 0,
  };

  const catColorMap = useMemo(() => buildCategoryColorMap(finCats), [finCats]);
  const catEmojiMap = useMemo(() => {
    const m: Record<number, string | null> = {};
    for (const c of finCats ?? []) m[c.category_id] = getCategoryEmoji(c.title, c.emoji);
    return m;
  }, [finCats]);
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
      <ActionSheet
        open={!!ctxTx}
        onClose={() => setCtxTx(null)}
        title={ctxTx ? `${ctxTx.description || ctxTx.category_title || "Операция"} · ${ctxTx.amount}` : undefined}
        actions={ctxTx ? [
          { label: "Повторить операцию", onClick: () => repeatTx(ctxTx) },
          { label: "Редактировать", onClick: () => setEditTx(ctxTx) },
          { label: "Удалить", destructive: true, onClick: () => void deleteTx(ctxTx) },
        ] : []}
      />
      {repeatValues && (
        <CreateOperationModal
          initialValues={repeatValues}
          onClose={() => {
            setRepeatValues(null);
            qc.invalidateQueries({ queryKey: ["transactions"] });
            qc.invalidateQueries({ queryKey: ["wallets"] });
          }}
        />
      )}
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
            qc.invalidateQueries({ queryKey: ["dashboard"] });
          }}
        />
      )}
      <PageHeader
        title="Деньги"
        tabs={
          <Tabs
            items={MONEY_TABS}
            active={getMoneyTab(pathname)}
            onChange={(id) => router.push(id)}
          />
        }
      />

      <main className="flex-1 p-3 md:p-6 w-full">
        <PullToRefresh onRefresh={() => Promise.all([
          qc.invalidateQueries({ queryKey: ["transactions"] }),
          qc.invalidateQueries({ queryKey: ["wallets"] }),
        ])}>

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
            className="bg-[var(--app-accent)] text-[#fff] text-[12px] font-semibold rounded-lg px-3 py-2 shrink-0"
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
            className="ml-auto bg-[var(--app-accent)] hover:brightness-110 text-[#fff] text-xs font-medium rounded-xl px-4 py-2 transition-colors"
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

        {/* Stats: без фильтров — текущий месяц; с фильтрами — итог выборки */}
        {data && (
          <div className="flex items-center justify-between mb-2 md:mb-4 flex-wrap gap-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
              {hasFilters ? `Найдено: ${data.total}` : monthAgg.label || "Этот месяц"}
            </p>
            <div className="flex items-center gap-3">
              {hasFilters ? (
                <>
                  {data.totals["INCOME"] != null && data.totals["INCOME"] > 0 && (
                    <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--c-success-ink)" }}>
                      +{Math.round(data.totals["INCOME"]).toLocaleString("ru-RU")} ₽
                    </span>
                  )}
                  {data.totals["EXPENSE"] != null && data.totals["EXPENSE"] > 0 && (
                    <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--c-danger-ink)" }}>
                      −{Math.round(data.totals["EXPENSE"]).toLocaleString("ru-RU")} ₽
                    </span>
                  )}
                </>
              ) : (
                <>
                  {monthAgg.income > 0 && (
                    <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--c-success-ink)" }}>
                      +{Math.round(monthAgg.income).toLocaleString("ru-RU")} ₽
                    </span>
                  )}
                  {monthAgg.expense > 0 && (
                    <span className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--c-danger-ink)" }}>
                      −{Math.round(monthAgg.expense).toLocaleString("ru-RU")} ₽
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
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
            {/* Mobile: card list, grouped by day */}
            <div className="md:hidden bg-slate-50 dark:bg-white/[0.03] border-[1.5px] border-slate-300 dark:border-white/[0.09] rounded-xl overflow-hidden">
              {data.items.map((tx, i) => {
                const key = dayKey(tx.occurred_at);
                const isNewDay = i === 0 || dayKey(data.items[i - 1].occurred_at) !== key;
                // Итог дня: доходы − расходы (переводы не считаем)
                let dayNet = 0;
                if (isNewDay) {
                  for (const t of data.items) {
                    if (dayKey(t.occurred_at) !== key) continue;
                    const a = parseFloat(t.amount) || 0;
                    if (t.operation_type === "INCOME") dayNet += a;
                    else if (t.operation_type === "EXPENSE") dayNet -= a;
                  }
                }
                return (
                <div key={tx.transaction_id}>
                {isNewDay && (
                  <div
                    className={clsx(
                      "flex items-center justify-between px-3 py-1.5",
                      i > 0 && "border-t border-slate-200 dark:border-white/[0.06]"
                    )}
                    style={{ background: "var(--app-sidebar-bg, var(--app-card-bg))" }}
                  >
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--t-muted)" }}>
                      {dayLabel(key)}
                    </span>
                    {dayNet !== 0 && (
                      <span
                        className="text-[11px] font-semibold tabular-nums"
                        style={{ color: dayNet > 0 ? "var(--c-success-ink)" : "var(--c-danger-ink)" }}
                      >
                        {dayNet > 0 ? "+" : "−"}{Math.abs(Math.round(dayNet)).toLocaleString("ru-RU")} ₽
                      </span>
                    )}
                  </div>
                )}
                <SwipeRow
                  left={{
                    icon: <span className="text-[15px] leading-none">🔁</span>,
                    color: "var(--app-accent)",
                    onTrigger: () => repeatTx(tx),
                  }}
                  right={{
                    icon: <span className="text-[15px] leading-none">✏️</span>,
                    color: "var(--c-warning-ink)",
                    onTrigger: () => setEditTx(tx),
                  }}
                >
                <div
                  className={clsx(
                    "flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors group/tx",
                    i < data.items.length - 1 && "border-b border-slate-100 dark:border-white/[0.04]"
                  )}
                  onTouchStart={() => startLongPress(tx)}
                  onTouchMove={cancelLongPress}
                  onTouchEnd={cancelLongPress}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate leading-snug" style={{ color: "var(--t-primary)" }}>
                      {tx.description || tx.category_title || OP_TYPE_LABELS[tx.operation_type]}
                    </p>
                    <p className="text-[10px] mt-0.5 truncate flex items-center gap-1" style={{ color: "var(--t-faint)" }}>
                      {tx.category_id != null && (
                        catEmojiMap[tx.category_id] ? (
                          <span className="text-[11px] leading-none shrink-0">{catEmojiMap[tx.category_id]}</span>
                        ) : (
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: catColorMap[tx.category_id] ?? "var(--t-faint)" }}
                          />
                        )
                      )}
                      <span className="truncate">
                        {tx.operation_type === "TRANSFER"
                          ? `${walletMap[tx.from_wallet_id ?? 0] ?? "?"} → ${walletMap[tx.to_wallet_id ?? 0] ?? "?"}`
                          : walletMap[tx.wallet_id ?? 0] ?? ""}
                        {tx.category_title && tx.description && ` · ${tx.category_title}`}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <p className={clsx("text-[13px] font-semibold tabular-nums leading-snug", OP_TYPE_COLORS[tx.operation_type])}>
                        {formatAmount(tx.amount, tx.operation_type, tx.currency)}
                      </p>
                      <p className="text-[9px] mt-0.5 tabular-nums" style={{ color: "var(--t-faint)" }}>
                        {formatTime(tx.occurred_at)}
                        {budgetMonthDiffers(tx.budget_month, tx.occurred_at) && (
                          <span className="ml-1 font-semibold" style={{ color: "var(--app-accent)" }}>
                            →{budgetMonthShort(tx.budget_month!)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                </SwipeRow>
                </div>
                );
              })}
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
                        {budgetMonthDiffers(tx.budget_month, tx.occurred_at) && (
                          <span className="ml-1 font-semibold" style={{ color: "var(--app-accent)" }} title="Учитывается в бюджете другого месяца">
                            →{budgetMonthShort(tx.budget_month!)}
                          </span>
                        )}
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
        </PullToRefresh>
      </main>
    </>
  );
}

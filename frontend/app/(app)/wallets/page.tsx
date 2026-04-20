"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { PageTabs } from "@/components/layout/PageTabs";
import { api } from "@/lib/api";
import type { WalletItem } from "@/types/api";
import { CreateWalletModal } from "@/components/modals/CreateWalletModal";

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  REGULAR: "Обычный",
  CREDIT:  "Кредитный",
  SAVINGS: "Накопительный",
};

const TYPE_ORDER = ["REGULAR", "CREDIT", "SAVINGS"];

function formatAmount(amount: string) {
  const n = parseFloat(amount);
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useWallets(includeArchived: boolean) {
  return useQuery<WalletItem[]>({
    queryKey: ["wallets", includeArchived],
    queryFn: () => api.get<WalletItem[]>(`/api/v2/wallets?include_archived=${includeArchived}`),
    staleTime: 30_000,
  });
}

function useRenameWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ walletId, title }: { walletId: number; title: string }) =>
      api.patch(`/api/v2/wallets/${walletId}`, { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wallets"] }),
  });
}

function useArchiveWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (walletId: number) => api.delete(`/api/v2/wallets/${walletId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

function useRestoreWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (walletId: number) => api.post(`/api/v2/wallets/${walletId}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallets"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

function useActualizeBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ walletId, targetBalance }: { walletId: number; targetBalance: string }) =>
      api.post(`/api/v2/wallets/${walletId}/actualize-balance`, { target_balance: targetBalance }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wallets"] }),
  });
}

// ── Shared input style ─────────────────────────────────────────────────────────

const inputCls =
  "w-full bg-white/[0.05] border border-white/[0.1] rounded-xl px-3 py-1.5 text-[13px] outline-none focus:border-indigo-500/60 transition-colors";

// ── WalletRow ──────────────────────────────────────────────────────────────────

function WalletRow({ wallet }: { wallet: WalletItem }) {
  const [open, setOpen]               = useState(false);
  const [editTitle, setEditTitle]     = useState(wallet.title);
  const [targetBalance, setTargetBalance] = useState("");

  const { mutate: rename }    = useRenameWallet();
  const { mutate: archive }   = useArchiveWallet();
  const { mutate: restore }   = useRestoreWallet();
  const { mutate: actualize, isPending: actualizing } = useActualizeBalance();

  const balance = parseFloat(wallet.balance);
  const isNegative = balance < 0;

  function toggle() {
    if (!open) setEditTitle(wallet.title);
    setOpen((v) => !v);
  }

  function saveTitle() {
    const t = editTitle.trim();
    if (t && t !== wallet.title) rename({ walletId: wallet.wallet_id, title: t });
  }

  function handleActualize() {
    const val = targetBalance.trim();
    if (!val) return;
    actualize(
      { walletId: wallet.wallet_id, targetBalance: val },
      { onSuccess: () => setTargetBalance("") },
    );
  }

  function handleArchive() {
    archive(wallet.wallet_id);
  }

  function handleRestore() {
    restore(wallet.wallet_id);
  }

  return (
    <>
      {/* Collapsed row */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05] cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={toggle}
      >
        <div>
          <p className="text-[14px] font-medium" style={{ color: wallet.is_archived ? "var(--t-faint)" : "var(--t-primary)" }}>
            {wallet.title}
          </p>
          <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>
            {wallet.currency} · {TYPE_LABELS[wallet.wallet_type] ?? wallet.wallet_type}
            {wallet.is_archived && " · Архив"}
          </p>
        </div>
        <span
          className={`text-[15px] font-semibold tabular-nums ${isNegative ? "text-red-400" : ""}`}
          style={{ color: isNegative ? undefined : "var(--t-primary)" }}
        >
          {formatAmount(wallet.balance)} {wallet.currency}
        </span>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="px-4 py-4 bg-white/[0.02] border-b border-white/[0.05] space-y-3">
          {wallet.is_archived ? (
            /* Archived wallet: only restore */
            <button
              onClick={handleRestore}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Восстановить из архива
            </button>
          ) : (
            <>
              {/* Rename */}
              <div>
                <label className="text-[11px] text-white/50 uppercase tracking-wider">Название</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveTitle(); } }}
                  className={`${inputCls} mt-1`}
                  style={{ color: "var(--t-primary)" }}
                />
              </div>

              {/* Actualize balance — REGULAR and CREDIT */}
              {(wallet.wallet_type === "REGULAR" || wallet.wallet_type === "CREDIT") && (
                <div>
                  <label className="text-[11px] text-white/50 uppercase tracking-wider">
                    Актуализация баланса
                  </label>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="number"
                      step="0.01"
                      value={targetBalance}
                      onChange={(e) => setTargetBalance(e.target.value)}
                      placeholder={wallet.balance}
                      className={`${inputCls} flex-1`}
                      style={{ color: "var(--t-primary)" }}
                    />
                    <button
                      onClick={handleActualize}
                      disabled={actualizing || !targetBalance.trim()}
                      className="px-3 py-1.5 text-xs font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
                    >
                      Применить
                    </button>
                  </div>
                  <p className="text-[10px] text-white/40 mt-1">
                    Текущий: {wallet.balance} {wallet.currency}
                  </p>
                </div>
              )}

              {/* Archive */}
              <button
                onClick={handleArchive}
                className="text-[11px] text-red-400 hover:text-red-300 transition-colors"
              >
                В архив
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WalletsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { data, isLoading, isError } = useWallets(showArchived);

  const wallets = (data ?? []).filter((w) =>
    showArchived ? w.is_archived : !w.is_archived
  );

  // Group by type in defined order
  const groups: Record<string, WalletItem[]> = {};
  for (const w of wallets) {
    if (!groups[w.wallet_type]) groups[w.wallet_type] = [];
    groups[w.wallet_type].push(w);
  }
  const orderedGroups = TYPE_ORDER.filter((t) => groups[t]?.length).map((t) => ({
    type: t,
    label: TYPE_LABELS[t] ?? t,
    items: groups[t],
  }));

  return (
    <>
      {showCreateModal && (
        <CreateWalletModal onClose={() => setShowCreateModal(false)} />
      )}
      <AppTopbar title="Деньги" />
      <PageTabs tabs={[
        { href: "/money", label: "Операции" },
        { href: "/wallets", label: "Кошельки" },
        { href: "/subscriptions", label: "Подписки" },
        { href: "/categories", label: "Категории" },
      ]} />

      <main className="flex-1 overflow-auto p-3 md:p-6 max-w-3xl mx-auto w-full">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[18px] font-semibold" style={{ color: "var(--t-primary)" }}>
            Кошельки
          </h1>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[12px] cursor-pointer" style={{ color: "var(--t-muted)" }}>
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded"
              />
              Архивные
            </label>
            {!showArchived && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-semibold rounded-xl px-3.5 py-2 transition-colors"
              >
                + Создать
              </button>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="space-y-px">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-red-400/70 text-sm text-center py-12">Не удалось загрузить кошельки</p>
        )}

        {!isLoading && !isError && wallets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-xl">
              💳
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--t-muted)" }}>
              {showArchived ? "Нет архивных кошельков" : "Нет активных кошельков"}
            </p>
            {!showArchived && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-xs font-medium text-indigo-400/60 hover:text-indigo-400 transition-colors"
              >
                + Создать первый кошелёк
              </button>
            )}
          </div>
        )}

        {!isLoading && !isError && orderedGroups.length > 0 && (
          <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
            {orderedGroups.map(({ type, label, items }) => (
              <div key={type}>
                {/* Group header */}
                <div
                  className="text-[11px] font-semibold uppercase tracking-widest px-4 pt-5 pb-2"
                  style={{ color: "var(--t-faint)" }}
                >
                  {label}
                </div>
                {/* Wallet rows */}
                {items.map((w) => (
                  <WalletRow key={w.wallet_id} wallet={w} />
                ))}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}

"use client";

import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import { clsx } from "clsx";
import { Pencil, Check, X, Trash2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { WalletItem } from "@/types/api";

// ── Constants ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  REGULAR: "Обычный",
  CREDIT:  "Кредит",
  SAVINGS: "Накопления",
};

const TYPE_STYLES: Record<string, string> = {
  REGULAR: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  CREDIT:  "text-red-400 bg-red-500/10 border-red-500/20",
  SAVINGS: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  RUB: "₽", USD: "$", EUR: "€", GBP: "£",
};

function fmtMoney(amount: string | number, currency: string) {
  const n = parseFloat(String(amount));
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

// ── Hooks ──────────────────────────────────────────────────────────────────────

function useWallets() {
  return useQuery<WalletItem[]>({
    queryKey: ["wallets"],
    queryFn: () => api.get<WalletItem[]>("/api/v2/wallets"),
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

// ── WalletCard ─────────────────────────────────────────────────────────────────

function WalletCard({ wallet }: { wallet: WalletItem }) {
  const [editing, setEditing]       = useState(false);
  const [title, setTitle]           = useState(wallet.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef                    = useRef<HTMLInputElement>(null);

  const { mutate: rename, isPending: renaming } = useRenameWallet();
  const { mutate: archive }                     = useArchiveWallet();

  const delta     = parseFloat(wallet.delta_30d);
  const balance   = parseFloat(wallet.balance);
  const typeCls   = TYPE_STYLES[wallet.wallet_type] ?? "text-white/60 bg-white/[0.05] border-white/[0.08]";

  function startEdit() {
    setTitle(wallet.title);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 30);
  }

  function saveTitle() {
    const t = title.trim();
    if (t && t !== wallet.title) rename({ walletId: wallet.wallet_id, title: t });
    else setTitle(wallet.title);
    setEditing(false);
  }

  function cancelEdit() {
    setTitle(wallet.title);
    setEditing(false);
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 hover:bg-white/[0.045] transition-all">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); saveTitle(); }
                  if (e.key === "Escape") cancelEdit();
                }}
                className="flex-1 text-[14px] font-semibold bg-white/[0.06] border border-indigo-500/40 rounded-lg px-2.5 py-1 outline-none"
                style={{ color: "var(--t-primary)" }}
                autoFocus
              />
              <button
                onClick={saveTitle}
                disabled={renaming}
                className="w-6 h-6 flex items-center justify-center rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-white transition-colors"
              >
                <Check size={11} strokeWidth={2.5} />
              </button>
              <button
                onClick={cancelEdit}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/[0.08] transition-colors"
                style={{ color: "var(--t-faint)" }}
              >
                <X size={11} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group/title">
              <span
                className="text-[14px] font-semibold truncate"
                style={{ color: "var(--t-primary)", letterSpacing: "-0.01em" }}
              >
                {wallet.title}
              </span>
              <button
                onClick={startEdit}
                className="opacity-0 group-hover/title:opacity-100 w-5 h-5 flex items-center justify-center rounded-md hover:bg-white/[0.08] transition-all"
                style={{ color: "var(--t-faint)" }}
              >
                <Pencil size={10} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            <span className={clsx("text-[10px] px-1.5 py-0.5 rounded-full font-semibold border", typeCls)}>
              {TYPE_LABELS[wallet.wallet_type] ?? wallet.wallet_type}
            </span>
            <span className="text-[11px]" style={{ color: "var(--t-faint)" }}>
              {wallet.currency}
            </span>
          </div>
        </div>

        {/* Balance */}
        <div className="text-right shrink-0">
          <div
            className={clsx(
              "text-[20px] font-bold tabular-nums leading-none",
              balance < 0 ? "text-red-400" : "text-white/90"
            )}
            style={{ letterSpacing: "-0.04em" }}
          >
            {fmtMoney(wallet.balance, wallet.currency)}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mt-3.5 pt-3 border-t border-white/[0.05]">
        {/* Delta 30d */}
        <div className="flex items-center gap-1.5">
          {delta > 0.005 ? (
            <TrendingUp size={13} className="text-emerald-400 shrink-0" />
          ) : delta < -0.005 ? (
            <TrendingDown size={13} className="text-red-400 shrink-0" />
          ) : (
            <Minus size={13} className="shrink-0" style={{ color: "var(--t-faint)" }} />
          )}
          <span
            className={clsx(
              "text-[12px] font-semibold tabular-nums",
              delta > 0.005 ? "text-emerald-400" : delta < -0.005 ? "text-red-400" : ""
            )}
            style={{ color: Math.abs(delta) < 0.005 ? "var(--t-faint)" : undefined }}
          >
            {delta > 0.005 ? "+" : ""}{fmtMoney(wallet.delta_30d, wallet.currency)}
          </span>
          <span className="text-[10px]" style={{ color: "var(--t-faint)" }}>за 30д</span>
        </div>

        <div className="text-[11px] tabular-nums" style={{ color: "var(--t-faint)" }}>
          {wallet.operations_count_30d} опер.
        </div>

        {wallet.last_operation_at && (
          <div className="text-[11px] ml-auto" style={{ color: "var(--t-faint)" }}>
            {fmtDate(wallet.last_operation_at)}
          </div>
        )}

        {/* Archive */}
        <button
          onClick={() => {
            if (!confirmDelete) { setConfirmDelete(true); return; }
            archive(wallet.wallet_id);
          }}
          onBlur={() => setTimeout(() => setConfirmDelete(false), 200)}
          className={clsx(
            "ml-auto flex items-center gap-1 py-1 px-2 rounded-lg border text-[11px] font-medium transition-all",
            confirmDelete
              ? "bg-red-600 border-red-500 text-white"
              : "bg-transparent border-white/[0.07] hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
          )}
          style={{ color: confirmDelete ? undefined : "var(--t-faint)" }}
        >
          <Trash2 size={10} />
          {confirmDelete ? "Архивировать?" : "В архив"}
        </button>
      </div>
    </div>
  );
}

// ── Summary cards ──────────────────────────────────────────────────────────────

function SummaryCards({ wallets }: { wallets: WalletItem[] }) {
  const groups: Record<string, { total: number; count: number; currency: string }> = {};

  for (const w of wallets) {
    const key = `${w.wallet_type}__${w.currency}`;
    if (!groups[key]) groups[key] = { total: 0, count: 0, currency: w.currency };
    groups[key].total += parseFloat(w.balance);
    groups[key].count += 1;
  }

  const TYPE_ORDER = ["REGULAR", "CREDIT", "SAVINGS"];
  const entries = Object.entries(groups).sort(([a], [b]) => {
    const ta = a.split("__")[0]; const tb = b.split("__")[0];
    return TYPE_ORDER.indexOf(ta) - TYPE_ORDER.indexOf(tb);
  });

  if (entries.length === 0) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
      {entries.map(([key, g]) => {
        const wtype = key.split("__")[0];
        const typeCls = TYPE_STYLES[wtype] ?? "text-white/60 bg-white/[0.05] border-white/[0.08]";
        return (
          <div
            key={key}
            className="bg-white/[0.04] border border-white/[0.06] rounded-2xl p-4"
          >
            <div className={clsx("text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-1.5")}>
              <span className={clsx("px-1.5 py-0.5 rounded-full border text-[10px] font-semibold", typeCls)}>
                {TYPE_LABELS[wtype] ?? wtype}
              </span>
              <span style={{ color: "var(--t-faint)" }}>· {g.count} шт.</span>
            </div>
            <div
              className={clsx(
                "text-[22px] font-bold tabular-nums leading-none",
                g.total < 0 ? "text-red-400" : "text-white/90"
              )}
              style={{ letterSpacing: "-0.04em" }}
            >
              {fmtMoney(g.total, g.currency)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function WalletsPage() {
  const { data, isLoading, isError } = useWallets();
  const wallets = data ?? [];

  return (
    <>
      <AppTopbar
        title="Кошельки"
        subtitle={`${wallets.length} активных`}
      />

      <main className="flex-1 overflow-auto p-4 md:p-6 max-w-2xl">

        {/* Header actions */}
        <div className="flex items-center gap-2 mb-6">
          <a
            href="/legacy/wallets/new"
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-semibold rounded-xl px-3.5 py-2 transition-colors"
          >
            + Создать кошелёк
          </a>
          <a
            href="/legacy/wallets"
            className="text-[12px] font-medium px-3.5 py-2 rounded-xl border border-white/[0.08] hover:bg-white/[0.05] transition-colors"
            style={{ color: "var(--t-faint)" }}
          >
            Расширенное управление →
          </a>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-white/[0.03] rounded-2xl animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-red-400/70 text-sm text-center py-12">Не удалось загрузить кошельки</p>
        )}

        {!isLoading && !isError && (
          <>
            <SummaryCards wallets={wallets} />

            {wallets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-xl">
                  💳
                </div>
                <p className="text-sm font-medium" style={{ color: "var(--t-muted)" }}>
                  Нет активных кошельков
                </p>
                <a
                  href="/legacy/wallets/new"
                  className="text-xs font-medium text-indigo-400/60 hover:text-indigo-400 transition-colors"
                >
                  + Создать первый кошелёк
                </a>
              </div>
            ) : (
              <div className="space-y-3">
                {wallets.map((w) => (
                  <WalletCard key={w.wallet_id} wallet={w} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

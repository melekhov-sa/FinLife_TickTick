"use client";

/**
 * Быстрый ввод операций через ИИ.
 *
 * Текст в свободной форме (фраза / быстрая запись / банковская SMS) →
 * POST /api/v2/ai-ops/parse → карточки предложенных операций →
 * правка/исключение → сохранение штатным POST /api/v2/transactions →
 * POST /api/v2/ai-ops/{id}/resolve (история + самообучение).
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles, Trash2, AlertTriangle, HelpCircle, CheckCircle2,
  Loader2, CreditCard, Plus, X, ChevronDown, ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Button } from "@/components/primitives/Button";
import type { WalletItem, FinCategoryItem } from "@/types/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GoalWalletItem { wallet_id: number; amount: string }
interface GoalItem { goal_id: number; title: string; currency: string; wallets: GoalWalletItem[] }

interface AiProposal {
  operation_type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: string | null;
  description: string;
  occurred_at: string | null;
  category_id: number | null;
  category_alternatives: number[];
  wallet_id: number | null;
  to_goal_id: number | null;
  merchant: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
}

interface ParseResponse {
  parse_id: number | null;
  engine: string;
  proposals: AiProposal[];
  error: string | null;
}

interface EditableOp extends AiProposal {
  included: boolean;
  to_wallet_id: number | null;
  save_error?: string;
}

interface BankRef {
  id: number;
  wallet_id: number;
  wallet_title: string;
  ref_type: string;
  ref_digits: string;
}

const CONFIDENCE_META: Record<string, { label: string; color: string; bg: string; Icon: typeof CheckCircle2 }> = {
  high:   { label: "распознано уверенно",    color: "#059669", bg: "rgba(16,185,129,0.12)", Icon: CheckCircle2 },
  medium: { label: "рекомендуется проверить", color: "#D97706", bg: "rgba(245,158,11,0.12)", Icon: AlertTriangle },
  low:    { label: "недостаточно информации", color: "#DC2626", bg: "rgba(239,68,68,0.12)",  Icon: HelpCircle },
};

const OP_TYPE_LABELS: Record<string, string> = {
  EXPENSE: "Расход", INCOME: "Доход", TRANSFER: "Перевод",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function QuickAddPage() {
  const qc = useQueryClient();

  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseId, setParseId] = useState<number | null>(null);
  const [ops, setOps] = useState<EditableOp[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const { data: wallets } = useQuery<WalletItem[]>({
    queryKey: ["wallets"],
    queryFn: () => api.get<WalletItem[]>("/api/v2/wallets"),
  });
  const { data: cats } = useQuery<FinCategoryItem[]>({
    queryKey: ["fin-categories"],
    queryFn: () => api.get<FinCategoryItem[]>("/api/v2/fin-categories"),
  });
  const { data: goals } = useQuery<GoalItem[]>({
    queryKey: ["goals"],
    queryFn: () => api.get<GoalItem[]>("/api/v2/goals"),
  });

  const activeWallets = (wallets ?? []).filter((w) => !w.is_archived);
  const savingsWallets = activeWallets.filter((w) => w.wallet_type === "SAVINGS");

  async function handleParse() {
    const t = text.trim();
    if (!t || parsing) return;
    setParsing(true);
    setParseError(null);
    setSavedCount(null);
    try {
      const res = await api.post<ParseResponse>("/api/v2/ai-ops/parse", { text: t });
      if (res.error) setParseError(res.error);
      setParseId(res.parse_id);
      setOps(
        res.proposals.map((p) => ({
          ...p,
          included: true,
          // для TRANSFER на цель — подставить кошелёк цели
          to_wallet_id:
            p.operation_type === "TRANSFER" && p.to_goal_id
              ? goals?.find((g) => g.goal_id === p.to_goal_id)?.wallets[0]?.wallet_id ?? null
              : null,
        }))
      );
      if (!res.proposals.length && !res.error) {
        setParseError("Не удалось распознать операции — попробуй переформулировать.");
      }
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Ошибка разбора");
    } finally {
      setParsing(false);
    }
  }

  function patchOp(idx: number, patch: Partial<EditableOp>) {
    setOps((prev) => prev.map((op, i) => (i === idx ? { ...op, ...patch } : op)));
  }

  function removeOp(idx: number) {
    setOps((prev) => prev.filter((_, i) => i !== idx));
  }

  const includedOps = ops.filter((o) => o.included);
  const readyCount = includedOps.filter((o) => opIsReady(o)).length;

  function opIsReady(op: EditableOp): boolean {
    if (!op.amount || Number(op.amount) <= 0) return false;
    if (op.operation_type === "TRANSFER") return !!op.wallet_id && !!op.to_wallet_id;
    return !!op.wallet_id;
  }

  async function handleSaveAll() {
    if (saving || readyCount === 0) return;
    setSaving(true);
    let saved = 0;
    const next = [...ops];
    for (let i = 0; i < next.length; i++) {
      const op = next[i];
      if (!op.included || !opIsReady(op)) continue;
      const body: Record<string, unknown> = {
        operation_type: op.operation_type,
        amount: op.amount,
        description: op.description,
        occurred_at: op.occurred_at ? `${op.occurred_at}T12:00` : null,
      };
      if (op.operation_type === "TRANSFER") {
        body.from_wallet_id = op.wallet_id;
        body.to_wallet_id = op.to_wallet_id;
        body.to_goal_id = op.to_goal_id;
      } else {
        body.wallet_id = op.wallet_id;
        body.category_id = op.category_id;
      }
      try {
        await api.post<{ id: number }>("/api/v2/transactions", body);
        saved += 1;
        next[i] = { ...op, save_error: undefined };
      } catch (e) {
        next[i] = { ...op, save_error: e instanceof Error ? e.message : "Ошибка сохранения" };
      }
    }
    setOps(next);

    // История + самообучение (не блокируем UX при ошибке)
    if (parseId != null) {
      try {
        await api.post(`/api/v2/ai-ops/${parseId}/resolve`, {
          ops: next.map((op) => ({
            operation_type: op.operation_type,
            amount: op.amount,
            description: op.description,
            category_id: op.category_id,
            wallet_id: op.wallet_id,
            to_goal_id: op.to_goal_id,
            merchant: op.merchant,
            saved: op.included && !op.save_error && opIsReady(op),
          })),
          discarded: false,
        });
      } catch { /* история не должна ломать сохранение */ }
    }

    qc.invalidateQueries({ queryKey: ["wallets"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    setSavedCount(saved);
    const failed = next.some((op) => op.save_error);
    if (!failed) {
      setOps([]);
      setText("");
      setParseId(null);
    } else {
      setOps(next.filter((op) => op.save_error));
    }
    setSaving(false);
  }

  return (
    <>
      <PageHeader
        title="Быстрый ввод"
        subtitle="Опиши операции текстом или вставь банковскую SMS — ИИ разберёт"
        density="compact"
      />
      <main className="flex-1 p-4 md:p-6 max-w-2xl w-full mx-auto space-y-4">

        {/* Ввод */}
        <div
          className="rounded-2xl border p-4"
          style={{ background: "var(--app-card-bg)", borderColor: "var(--app-card-border)" }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder={"Например: Магнит 1800, кофе 220, такси 640\nили: вчера озон 4200\nили вставь SMS банка"}
            className="w-full resize-y rounded-xl border p-3 text-[14px] outline-none focus:ring-2"
            style={{
              background: "var(--app-bg)",
              borderColor: "var(--app-border)",
              color: "var(--t-primary)",
            }}
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>
              Ничего не сохраняется без твоего подтверждения
            </p>
            <Button onClick={handleParse} disabled={!text.trim() || parsing} size="md">
              {parsing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {parsing ? "Разбираю…" : "Разобрать"}
            </Button>
          </div>
          {parseError && (
            <p className="mt-2 text-[12px] rounded-lg px-3 py-2"
              style={{ color: "#DC2626", background: "rgba(239,68,68,0.08)" }}>
              {parseError}
            </p>
          )}
          {savedCount !== null && (
            <p className="mt-2 text-[12px] rounded-lg px-3 py-2"
              style={{ color: "#059669", background: "rgba(16,185,129,0.10)" }}>
              Сохранено операций: {savedCount}
            </p>
          )}
        </div>

        {/* Предложенные операции */}
        {ops.length > 0 && (
          <>
            <div className="space-y-3">
              {ops.map((op, idx) => (
                <ProposalCard
                  key={idx}
                  op={op}
                  cats={cats ?? []}
                  wallets={activeWallets}
                  savingsWallets={savingsWallets}
                  goals={goals ?? []}
                  onPatch={(patch) => patchOp(idx, patch)}
                  onRemove={() => removeOp(idx)}
                />
              ))}
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px]" style={{ color: "var(--t-muted)" }}>
                Готово к сохранению: {readyCount} из {includedOps.length}
              </p>
              <Button onClick={handleSaveAll} disabled={saving || readyCount === 0} size="lg">
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                {saving ? "Сохраняю…" : `Сохранить (${readyCount})`}
              </Button>
            </div>
          </>
        )}

        {/* Привязки счетов/карт */}
        <BankRefsBlock wallets={activeWallets} />
      </main>
    </>
  );
}

// ── Proposal card ─────────────────────────────────────────────────────────────

function ProposalCard({
  op, cats, wallets, savingsWallets, goals, onPatch, onRemove,
}: {
  op: EditableOp;
  cats: FinCategoryItem[];
  wallets: WalletItem[];
  savingsWallets: WalletItem[];
  goals: GoalItem[];
  onPatch: (patch: Partial<EditableOp>) => void;
  onRemove: () => void;
}) {
  const conf = CONFIDENCE_META[op.confidence] ?? CONFIDENCE_META.medium;
  const ConfIcon = conf.Icon;

  const catKind = op.operation_type === "INCOME" ? "INCOME" : "EXPENSE";
  const kindCats = cats.filter((c) => c.category_type === catKind && !c.is_archived);
  // альтернативы ИИ — в начало списка
  const altSet = new Set(op.category_alternatives);
  const sortedCats = [
    ...kindCats.filter((c) => altSet.has(c.category_id)),
    ...kindCats.filter((c) => !altSet.has(c.category_id)),
  ];

  const selectStyle = {
    background: "var(--app-bg)",
    borderColor: "var(--app-border)",
    color: "var(--t-primary)",
  } as const;

  return (
    <div
      className="rounded-2xl border p-4 space-y-3 transition-opacity"
      style={{
        background: "var(--app-card-bg)",
        borderColor: op.save_error ? "rgba(239,68,68,0.45)" : "var(--app-card-border)",
        opacity: op.included ? 1 : 0.55,
      }}
    >
      {/* Шапка карточки */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={op.included}
            onChange={(e) => onPatch({ included: e.target.checked })}
            className="w-4 h-4 accent-[var(--app-accent)]"
          />
          <span className="text-[13px] font-semibold" style={{ color: "var(--t-primary)" }}>
            {OP_TYPE_LABELS[op.operation_type]}
          </span>
        </label>
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ color: conf.color, background: conf.bg }}
        >
          <ConfIcon size={11} />
          {conf.label}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Удалить"
          className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center nav-hover"
          style={{ color: "var(--t-faint)" }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Поля */}
      <div className="grid grid-cols-2 gap-2">
        <select
          value={op.operation_type}
          onChange={(e) => onPatch({
            operation_type: e.target.value as EditableOp["operation_type"],
            category_id: null,
          })}
          className="rounded-lg border px-2 py-1.5 text-[13px]"
          style={selectStyle}
        >
          <option value="EXPENSE">Расход</option>
          <option value="INCOME">Доход</option>
          <option value="TRANSFER">Перевод</option>
        </select>
        <input
          type="number"
          inputMode="decimal"
          value={op.amount ?? ""}
          onChange={(e) => onPatch({ amount: e.target.value || null })}
          placeholder="Сумма"
          className="rounded-lg border px-2 py-1.5 text-[13px] tabular-nums"
          style={selectStyle}
        />
        <input
          type="text"
          value={op.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          placeholder="Описание"
          className="col-span-2 rounded-lg border px-2 py-1.5 text-[13px]"
          style={selectStyle}
        />

        {op.operation_type !== "TRANSFER" ? (
          <>
            <select
              value={op.category_id ?? ""}
              onChange={(e) => onPatch({ category_id: e.target.value ? Number(e.target.value) : null })}
              className="rounded-lg border px-2 py-1.5 text-[13px]"
              style={selectStyle}
            >
              <option value="">Категория…</option>
              {sortedCats.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {altSet.has(c.category_id) ? "★ " : ""}{c.title}
                </option>
              ))}
            </select>
            <select
              value={op.wallet_id ?? ""}
              onChange={(e) => onPatch({ wallet_id: e.target.value ? Number(e.target.value) : null })}
              className="rounded-lg border px-2 py-1.5 text-[13px]"
              style={selectStyle}
            >
              <option value="">Кошелёк…</option>
              {wallets.map((w) => (
                <option key={w.wallet_id} value={w.wallet_id}>{w.title}</option>
              ))}
            </select>
          </>
        ) : (
          <>
            <select
              value={op.wallet_id ?? ""}
              onChange={(e) => onPatch({ wallet_id: e.target.value ? Number(e.target.value) : null })}
              className="rounded-lg border px-2 py-1.5 text-[13px]"
              style={selectStyle}
            >
              <option value="">Откуда…</option>
              {wallets.map((w) => (
                <option key={w.wallet_id} value={w.wallet_id}>{w.title}</option>
              ))}
            </select>
            <select
              value={op.to_wallet_id ?? ""}
              onChange={(e) => {
                const wid = e.target.value ? Number(e.target.value) : null;
                // если кошелёк принадлежит цели — подставить цель
                const goal = goals.find((g) => g.wallets.some((gw) => gw.wallet_id === wid));
                onPatch({ to_wallet_id: wid, to_goal_id: goal?.goal_id ?? op.to_goal_id });
              }}
              className="rounded-lg border px-2 py-1.5 text-[13px]"
              style={selectStyle}
            >
              <option value="">Куда…</option>
              {[...savingsWallets, ...wallets.filter((w) => w.wallet_type !== "SAVINGS")].map((w) => (
                <option key={w.wallet_id} value={w.wallet_id}>
                  {w.wallet_type === "SAVINGS" ? "🎯 " : ""}{w.title}
                </option>
              ))}
            </select>
          </>
        )}

        <input
          type="date"
          value={op.occurred_at ?? ""}
          onChange={(e) => onPatch({ occurred_at: e.target.value || null })}
          className="rounded-lg border px-2 py-1.5 text-[13px]"
          style={selectStyle}
        />
      </div>

      {/* Почему так */}
      {op.reason && (
        <p className="text-[11px] leading-snug" style={{ color: "var(--t-faint)" }}>
          💡 {op.reason}
        </p>
      )}
      {op.save_error && (
        <p className="text-[11px]" style={{ color: "#DC2626" }}>
          Не сохранилось: {op.save_error}
        </p>
      )}
    </div>
  );
}

// ── Bank refs (счета/карты → кошельки) ───────────────────────────────────────

function BankRefsBlock({ wallets }: { wallets: WalletItem[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [walletId, setWalletId] = useState<number | "">("");
  const [refType, setRefType] = useState<"ACCOUNT" | "CARD">("ACCOUNT");
  const [digits, setDigits] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: refs } = useQuery<BankRef[]>({
    queryKey: ["ai-bank-refs"],
    queryFn: () => api.get<BankRef[]>("/api/v2/ai-ops/bank-refs"),
    enabled: open,
  });

  async function addRef() {
    if (!walletId || !digits.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post("/api/v2/ai-ops/bank-refs", {
        wallet_id: walletId,
        ref_type: refType,
        ref_digits: digits.trim(),
      });
      setDigits("");
      qc.invalidateQueries({ queryKey: ["ai-bank-refs"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRef(id: number) {
    try {
      await api.delete(`/api/v2/ai-ops/bank-refs/${id}`);
      qc.invalidateQueries({ queryKey: ["ai-bank-refs"] });
    } catch { /* ignore */ }
  }

  const inputStyle = {
    background: "var(--app-bg)",
    borderColor: "var(--app-border)",
    color: "var(--t-primary)",
  } as const;

  return (
    <div
      className="rounded-2xl border"
      style={{ background: "var(--app-card-bg)", borderColor: "var(--app-card-border)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 p-4 text-left"
      >
        {open ? <ChevronDown size={15} style={{ color: "var(--t-faint)" }} />
              : <ChevronRight size={15} style={{ color: "var(--t-faint)" }} />}
        <CreditCard size={15} style={{ color: "var(--app-accent)" }} />
        <span className="text-[13px] font-semibold" style={{ color: "var(--t-primary)" }}>
          Счета и карты для распознавания SMS
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-[11px]" style={{ color: "var(--t-faint)" }}>
            Привяжи последние цифры счёта («СЧЁТ2670») или карты — ИИ будет сам
            находить кошелёк, с которого прошла операция.
          </p>

          {(refs ?? []).map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-[13px]">
              <span
                className="px-2 py-0.5 rounded-md text-[11px] font-semibold"
                style={{ background: "var(--app-accent-weak)", color: "var(--app-accent-ink)" }}
              >
                {r.ref_type === "CARD" ? "Карта" : "Счёт"} …{r.ref_digits}
              </span>
              <span style={{ color: "var(--t-muted)" }}>→ {r.wallet_title}</span>
              <button
                type="button"
                onClick={() => deleteRef(r.id)}
                aria-label="Удалить привязку"
                className="ml-auto w-6 h-6 rounded-md flex items-center justify-center nav-hover"
                style={{ color: "var(--t-faint)" }}
              >
                <X size={13} />
              </button>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={refType}
              onChange={(e) => setRefType(e.target.value as "ACCOUNT" | "CARD")}
              className="rounded-lg border px-2 py-1.5 text-[13px]"
              style={inputStyle}
            >
              <option value="ACCOUNT">Счёт</option>
              <option value="CARD">Карта</option>
            </select>
            <input
              type="text"
              inputMode="numeric"
              value={digits}
              onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="Цифры (2670)"
              className="w-28 rounded-lg border px-2 py-1.5 text-[13px] tabular-nums"
              style={inputStyle}
            />
            <select
              value={walletId}
              onChange={(e) => setWalletId(e.target.value ? Number(e.target.value) : "")}
              className="flex-1 min-w-[140px] rounded-lg border px-2 py-1.5 text-[13px]"
              style={inputStyle}
            >
              <option value="">Кошелёк…</option>
              {wallets.map((w) => (
                <option key={w.wallet_id} value={w.wallet_id}>{w.title}</option>
              ))}
            </select>
            <Button size="sm" onClick={addRef} disabled={!walletId || digits.length < 2 || busy}>
              <Plus size={13} /> Привязать
            </Button>
          </div>
          {err && <p className="text-[11px]" style={{ color: "#DC2626" }}>{err}</p>}
        </div>
      )}
    </div>
  );
}

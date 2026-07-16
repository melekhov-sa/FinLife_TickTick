"use client";

/**
 * Долги и займы: кому/от кого, сумма, срок, частичные возвраты.
 * Итоги «мне должны / я должен» — по открытым долгам.
 */

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { HandCoins, ArrowUpRight, ArrowDownLeft, CalendarClock, Trash2, Pencil, CheckCircle2, RotateCcw, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Tabs } from "@/components/primitives/Tabs";
import { Skeleton } from "@/components/primitives/Skeleton";
import { EmptyState } from "@/components/primitives/EmptyState";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { DateInput } from "@/components/primitives/DateInput";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FormRow } from "@/components/ui/FormRow";
import { Select, type SelectOption } from "@/components/ui/Select";
import { hapticSuccess, hapticTick } from "@/lib/native";
import { clsx } from "clsx";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DebtPayment {
  payment_id: number;
  amount: number;
  paid_date: string;
  note: string;
}

interface Debt {
  debt_id: number;
  direction: "LENT" | "BORROWED";
  counterparty: string;
  contact_id: number | null;
  amount: number;
  paid: number;
  remaining: number;
  currency: string;
  opened_date: string;
  due_date: string | null;
  note: string;
  status: "OPEN" | "CLOSED";
  overdue: boolean;
  payments: DebtPayment[];
}

interface DebtsResponse {
  totals: Record<string, { lent: number; borrowed: number }>;
  items: Debt[];
}

interface Contact {
  id: number;
  name: string;
}

function fmt(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function cur(c: string): string {
  return c === "RUB" ? "₽" : c;
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}

// ── Форма создания/редактирования ────────────────────────────────────────────

function DebtFormSheet({ debt, onClose, onSaved }: {
  debt: Debt | null; // null = создание
  onClose: () => void;
  onSaved: () => void;
}) {
  const [direction, setDirection] = useState<"LENT" | "BORROWED">(debt?.direction ?? "LENT");
  const [counterparty, setCounterparty] = useState(debt?.counterparty ?? "");
  const [contactId, setContactId] = useState<string>(debt?.contact_id ? String(debt.contact_id) : "");
  const [amount, setAmount] = useState(debt ? String(debt.amount) : "");
  const [dueDate, setDueDate] = useState(debt?.due_date ?? "");
  const [note, setNote] = useState(debt?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: contacts } = useQuery<Contact[]>({
    queryKey: ["contacts"],
    queryFn: () => api.get("/api/v2/contacts"),
    staleTime: 300_000,
  });

  const contactOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— без контакта —" },
    ...(contacts ?? []).map((c) => ({ value: String(c.id), label: c.name })),
  ], [contacts]);

  async function handleSave() {
    const n = parseFloat(amount.replace(",", "."));
    if (!counterparty.trim()) { setError("Укажи, кто именно"); return; }
    if (!amount || isNaN(n) || n <= 0) { setError("Введи корректную сумму"); return; }
    setSaving(true);
    setError(null);
    try {
      if (debt) {
        await api.patch(`/api/v2/debts/${debt.debt_id}`, {
          counterparty: counterparty.trim(),
          contact_id: contactId ? Number(contactId) : null,
          amount,
          due_date: dueDate || "",
          note,
        });
      } else {
        await api.post("/api/v2/debts", {
          direction,
          counterparty: counterparty.trim(),
          contact_id: contactId ? Number(contactId) : null,
          amount,
          due_date: dueDate || null,
          note,
        });
      }
      void hapticSuccess();
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.replace(/^API error \d+: /, "") : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div className="flex gap-2">
      <Button variant="secondary" size="md" onClick={onClose} fullWidth>Отмена</Button>
      <Button variant="primary" size="md" loading={saving} onClick={handleSave} fullWidth>
        {debt ? "Сохранить" : "Добавить"}
      </Button>
    </div>
  );

  return (
    <BottomSheet open onClose={onClose} title={debt ? "Редактировать долг" : "Новый долг"} footer={footer}>
      <div className="space-y-4">
        {!debt && (
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: "LENT" as const, label: "Я одолжил", sub: "мне должны", icon: <ArrowUpRight size={15} /> },
              { id: "BORROWED" as const, label: "Я взял", sub: "я должен", icon: <ArrowDownLeft size={15} /> },
            ]).map((opt) => {
              const active = direction === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { setDirection(opt.id); void hapticTick(); }}
                  className="rounded-xl border px-3 py-3 text-left transition-all"
                  style={{
                    borderColor: active ? "var(--app-accent)" : "var(--app-border)",
                    background: active ? "var(--app-accent-weak)" : "var(--app-card-bg)",
                  }}
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: active ? "var(--app-accent)" : "var(--t-primary)" }}>
                    {opt.icon}
                    {opt.label}
                  </span>
                  <span className="block text-[11px] mt-0.5" style={{ color: "var(--t-faint)" }}>{opt.sub}</span>
                </button>
              );
            })}
          </div>
        )}

        <FormRow label="Кто" required>
          <Input
            value={counterparty}
            onChange={(e) => setCounterparty(e.target.value)}
            placeholder="Имя человека"
            autoFocus={!debt}
          />
        </FormRow>

        {(contacts?.length ?? 0) > 0 && (
          <FormRow label="Контакт">
            <Select
              value={contactId}
              onChange={(v) => {
                setContactId(v);
                const c = (contacts ?? []).find((x) => String(x.id) === v);
                if (c && !counterparty.trim()) setCounterparty(c.name);
              }}
              options={contactOptions}
            />
          </FormRow>
        )}

        <FormRow label="Сумма" required>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            tabular
          />
        </FormRow>

        <FormRow label="Срок возврата">
          <DateInput value={dueDate} onChange={setDueDate} />
          <p className="text-[11px] mt-1" style={{ color: "var(--t-faint)" }}>
            За 3 дня до срока и при просрочке придёт напоминание.
          </p>
        </FormRow>

        <FormRow label="Заметка">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Необязательно" />
        </FormRow>

        {error && <p className="text-red-500 text-xs">{error}</p>}
      </div>
    </BottomSheet>
  );
}

// ── Карточка долга + детали ───────────────────────────────────────────────────

function DebtDetailSheet({ debt, onClose, onEdit, onChanged }: {
  debt: Debt;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isLent = debt.direction === "LENT";

  async function run(fn: () => Promise<unknown>, haptic = false) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (haptic) void hapticSuccess();
      onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.replace(/^API error \d+: /, "") : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  function addPayment() {
    const n = parseFloat(payAmount.replace(",", "."));
    if (!payAmount || isNaN(n) || n <= 0) { setError("Введи сумму возврата"); return; }
    void run(async () => {
      await api.post(`/api/v2/debts/${debt.debt_id}/payments`, {
        amount: payAmount,
        paid_date: payDate || null,
      });
      setPayAmount("");
      setPayDate("");
    }, true);
  }

  const pct = debt.amount > 0 ? Math.min(100, (debt.paid / debt.amount) * 100) : 0;

  return (
    <BottomSheet open onClose={onClose} title={debt.counterparty}>
      <div className="space-y-4">
        {/* Сводка */}
        <div
          className="rounded-2xl border p-4"
          style={{ background: "var(--app-card-bg)", borderColor: "var(--app-card-border)" }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
              style={{
                background: isLent ? "var(--c-success-bg)" : "var(--c-danger-bg)",
                color: isLent ? "var(--c-success-ink)" : "var(--c-danger-ink)",
              }}
            >
              {isLent ? <ArrowUpRight size={11} /> : <ArrowDownLeft size={11} />}
              {isLent ? "Мне должны" : "Я должен"}
            </span>
            {debt.status === "CLOSED" && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--app-accent-weak)", color: "var(--app-accent)" }}>
                Закрыт
              </span>
            )}
            {debt.overdue && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">
                Просрочен
              </span>
            )}
          </div>
          <p className="text-[22px] font-bold tabular-nums font-display" style={{ color: "var(--t-primary)" }}>
            {fmt(debt.remaining)} {cur(debt.currency)}
            <span className="text-[13px] font-normal ml-1.5" style={{ color: "var(--t-faint)" }}>
              из {fmt(debt.amount)}
            </span>
          </p>
          <div className="h-1.5 rounded-full overflow-hidden mt-2" style={{ background: "var(--app-border-subtle, var(--app-border))" }}>
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: isLent ? "var(--c-success-ink)" : "var(--c-danger-ink)", opacity: 0.8 }} />
          </div>
          <div className="flex justify-between mt-1.5 text-[11px]" style={{ color: "var(--t-faint)" }}>
            <span>возвращено {fmt(debt.paid)}</span>
            {debt.due_date && (
              <span className={clsx(debt.overdue && "text-red-500 font-semibold")}>
                срок {fmtDate(debt.due_date)}
              </span>
            )}
          </div>
          {debt.note && (
            <p className="text-[12px] mt-2" style={{ color: "var(--t-muted)" }}>{debt.note}</p>
          )}
        </div>

        {/* Возврат */}
        {debt.status === "OPEN" && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
              Возврат
            </p>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder={`до ${fmt(debt.remaining)}`}
                tabular
              />
              <Button
                variant="primary"
                size="md"
                loading={busy}
                onClick={addPayment}
                className="shrink-0"
              >
                <Plus size={15} />
              </Button>
            </div>
            <button
              type="button"
              className="text-[12px] underline-offset-2"
              style={{ color: "var(--app-accent)" }}
              onClick={() => setPayAmount(String(debt.remaining))}
            >
              Вернули всё ({fmt(debt.remaining)} {cur(debt.currency)})
            </button>
          </div>
        )}

        {/* История платежей */}
        {debt.payments.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--t-faint)" }}>
              История возвратов
            </p>
            <div className="space-y-0.5">
              {debt.payments.map((p) => (
                <div key={p.payment_id} className="flex items-center gap-2 py-1.5 border-b" style={{ borderColor: "var(--app-border-subtle, var(--app-border))" }}>
                  <span className="text-[12px] tabular-nums" style={{ color: "var(--t-faint)" }}>{fmtDate(p.paid_date)}</span>
                  <span className="flex-1 text-right text-[13px] font-semibold tabular-nums" style={{ color: "var(--c-success-ink)" }}>
                    +{fmt(p.amount)} {cur(debt.currency)}
                  </span>
                  <button
                    type="button"
                    aria-label="Удалить платёж"
                    className="w-7 h-7 flex items-center justify-center rounded-md transition-colors hover:bg-red-500/10"
                    style={{ color: "var(--t-faint)" }}
                    onClick={() => run(() => api.delete(`/api/v2/debts/${debt.debt_id}/payments/${p.payment_id}`))}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-red-500 text-xs">{error}</p>}

        {/* Действия */}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <Pencil size={13} className="mr-1" /> Изменить
          </Button>
          {debt.status === "OPEN" ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => run(() => api.post(`/api/v2/debts/${debt.debt_id}/close`, {}), true)}
            >
              <CheckCircle2 size={13} className="mr-1" /> Закрыть
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => run(() => api.post(`/api/v2/debts/${debt.debt_id}/reopen`, {}))}
            >
              <RotateCcw size={13} className="mr-1" /> Переоткрыть
            </Button>
          )}
          {!confirmDelete ? (
            <Button variant="secondary" size="sm" className="text-red-500" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={13} className="mr-1" /> Удалить
            </Button>
          ) : (
            <Button
              variant="destructive"
              size="sm"
              loading={busy}
              onClick={() => run(() => api.delete(`/api/v2/debts/${debt.debt_id}`))}
            >
              Точно удалить?
            </Button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

function DebtCard({ debt, onClick }: { debt: Debt; onClick: () => void }) {
  const isLent = debt.direction === "LENT";
  const pct = debt.amount > 0 ? Math.min(100, (debt.paid / debt.amount) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl border p-4 transition-all active:scale-[0.99]"
      style={{ background: "var(--app-card-bg)", borderColor: "var(--app-card-border)" }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: isLent ? "var(--c-success-bg)" : "var(--c-danger-bg)",
            color: isLent ? "var(--c-success-ink)" : "var(--c-danger-ink)",
          }}
        >
          {isLent ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold truncate" style={{ color: "var(--t-primary)" }}>
            {debt.counterparty}
          </p>
          <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: debt.overdue ? "var(--c-danger-ink)" : "var(--t-faint)" }}>
            {debt.due_date ? (
              <>
                <CalendarClock size={11} />
                {debt.overdue ? "просрочен · " : "до "}
                {fmtDate(debt.due_date)}
              </>
            ) : (
              "без срока"
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[15px] font-bold tabular-nums" style={{ color: isLent ? "var(--c-success-ink)" : "var(--c-danger-ink)" }}>
            {fmt(debt.remaining)} {cur(debt.currency)}
          </p>
          {debt.paid > 0 && (
            <p className="text-[10px] tabular-nums" style={{ color: "var(--t-faint)" }}>
              из {fmt(debt.amount)}
            </p>
          )}
        </div>
      </div>
      {debt.paid > 0 && debt.status === "OPEN" && (
        <div className="h-1 rounded-full overflow-hidden mt-3" style={{ background: "var(--app-border-subtle, var(--app-border))" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: isLent ? "var(--c-success-ink)" : "var(--c-danger-ink)", opacity: 0.8 }} />
        </div>
      )}
    </button>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DebtsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"OPEN" | "CLOSED">("OPEN");
  const [formDebt, setFormDebt] = useState<Debt | null | "new">(null); // "new" | Debt | null
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data, isLoading } = useQuery<DebtsResponse>({
    queryKey: ["debts", tab],
    queryFn: () => api.get<DebtsResponse>(`/api/v2/debts?status=${tab}`),
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["debts"] });
  }

  const items = data?.items ?? [];
  const detailDebt = detailId != null ? items.find((d) => d.debt_id === detailId) ?? null : null;
  const totals = data?.totals ?? {};
  const currencies = Object.keys(totals);

  return (
    <>
      <PageHeader
        title="Долги"
        subtitle="Займы и возвраты: мне должны / я должен"
        density="compact"
        tabs={
          <Tabs
            items={[
              { id: "OPEN", label: "Открытые" },
              { id: "CLOSED", label: "Закрытые" },
            ]}
            active={tab}
            onChange={(id) => setTab(id as "OPEN" | "CLOSED")}
            variant="pills"
          />
        }
        actions={
          <Button variant="primary" size="sm" onClick={() => setFormDebt("new")}>
            <Plus size={14} className="mr-1" /> Долг
          </Button>
        }
      />
      <main className="flex-1 p-4 md:p-6 max-w-2xl space-y-4">
        {/* KPI по открытым */}
        {currencies.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border p-3" style={{ background: "var(--app-card-bg)", borderColor: "var(--app-card-border)" }}>
              <p className="text-[10px] uppercase tracking-wide mb-1 flex items-center gap-1" style={{ color: "var(--t-faint)" }}>
                <ArrowUpRight size={12} /> Мне должны
              </p>
              {currencies.map((c) => (
                <p key={c} className="text-[16px] font-bold tabular-nums font-display" style={{ color: "var(--c-success-ink)" }}>
                  {fmt(totals[c].lent)} {cur(c)}
                </p>
              ))}
            </div>
            <div className="rounded-xl border p-3" style={{ background: "var(--app-card-bg)", borderColor: "var(--app-card-border)" }}>
              <p className="text-[10px] uppercase tracking-wide mb-1 flex items-center gap-1" style={{ color: "var(--t-faint)" }}>
                <ArrowDownLeft size={12} /> Я должен
              </p>
              {currencies.map((c) => (
                <p key={c} className="text-[16px] font-bold tabular-nums font-display" style={{ color: "var(--c-danger-ink)" }}>
                  {fmt(totals[c].borrowed)} {cur(c)}
                </p>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" className="h-20 rounded-2xl" />)}
          </div>
        )}

        {!isLoading && items.length === 0 && (
          <EmptyState
            icon={<HandCoins size={28} />}
            title={tab === "OPEN" ? "Открытых долгов нет" : "Закрытых долгов нет"}
            description={tab === "OPEN" ? "Одолжил или взял в долг — зафиксируй, чтобы не держать в голове." : "Здесь появятся возвращённые и прощённые долги."}
            action={tab === "OPEN" ? { label: "Добавить долг", onClick: () => setFormDebt("new") } : undefined}
          />
        )}

        <div className="space-y-2 stagger-rise">
          {items.map((d) => (
            <DebtCard key={d.debt_id} debt={d} onClick={() => setDetailId(d.debt_id)} />
          ))}
        </div>
      </main>

      {formDebt !== null && (
        <DebtFormSheet
          debt={formDebt === "new" ? null : formDebt}
          onClose={() => setFormDebt(null)}
          onSaved={() => { setFormDebt(null); refresh(); }}
        />
      )}

      {detailDebt && formDebt === null && (
        <DebtDetailSheet
          debt={detailDebt}
          onClose={() => setDetailId(null)}
          onEdit={() => setFormDebt(detailDebt)}
          onChanged={refresh}
        />
      )}
    </>
  );
}

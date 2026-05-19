"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { WalletItem, FinCategoryItem } from "@/types/api";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FormRow } from "@/components/ui/FormRow";
import { Select } from "@/components/ui/Select";
import type { SelectOption } from "@/components/ui/Select";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";
import { api } from "@/lib/api";

interface GoalOption {
  goal_id: number;
  title: string;
}

export interface PlannedOpTemplate {
  template_id: number;
  title: string;
  kind: string;
  amount: string;
  wallet_id: number | null;
  destination_wallet_id: number | null;
  category_id: number | null;
  from_goal_id: number | null;
  to_goal_id: number | null;
  active_until: string | null;
}

interface Props {
  /** null = create mode */
  template: PlannedOpTemplate | null;
  onClose: () => void;
}

type KindType = "INCOME" | "EXPENSE" | "TRANSFER";

const KIND_OPTIONS: SelectOption[] = [
  { value: "INCOME",   label: "Доход" },
  { value: "EXPENSE",  label: "Расход" },
  { value: "TRANSFER", label: "Перемещение" },
];

const FREQ_OPTIONS: SelectOption[] = [
  { value: "DAILY",   label: "Ежедневно" },
  { value: "WEEKLY",  label: "Еженедельно" },
  { value: "MONTHLY", label: "Ежемесячно" },
  { value: "YEARLY",  label: "Ежегодно" },
];

function fmtBalance(balance: string, currency: string): string {
  const n = parseFloat(balance);
  if (isNaN(n)) return balance;
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n) + " " + currency;
}

export function PlannedOpEditModal({ template, onClose }: Props) {
  const qc = useQueryClient();
  const isCreate = template === null;

  const [kind, setKind] = useState<KindType>((template?.kind as KindType) ?? "EXPENSE");
  const [title, setTitle] = useState(template?.title ?? "");
  const [amount, setAmount] = useState(template?.amount ?? "");
  const [freq, setFreq] = useState("MONTHLY");
  const [activeFrom, setActiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [walletId, setWalletId] = useState<number | "">(template?.wallet_id ?? "");
  const [destWalletId, setDestWalletId] = useState<number | "">(template?.destination_wallet_id ?? "");
  const [categoryId, setCategoryId] = useState<number | "">(template?.category_id ?? "");
  const [fromGoalId, setFromGoalId] = useState<number | "">(template?.from_goal_id ?? "");
  const [toGoalId, setToGoalId] = useState<number | "">(template?.to_goal_id ?? "");
  const [activeUntil, setActiveUntil] = useState(template?.active_until ?? "");

  const isTransfer = kind === "TRANSFER";

  const { data: wallets } = useQuery<WalletItem[]>({
    queryKey: ["wallets"],
    queryFn: () => api.get<WalletItem[]>("/api/v2/wallets"),
    staleTime: 60_000,
  });

  const { data: finCats } = useQuery<FinCategoryItem[]>({
    queryKey: ["fin-categories"],
    queryFn: () => api.get<FinCategoryItem[]>("/api/v2/fin-categories"),
    staleTime: 5 * 60_000,
    enabled: !isTransfer,
  });

  const { data: goals } = useQuery<GoalOption[]>({
    queryKey: ["goals"],
    queryFn: () => api.get<GoalOption[]>("/api/v2/goals"),
    staleTime: 5 * 60_000,
    enabled: isTransfer,
  });

  const selectedFromWallet = (wallets ?? []).find((w) => w.wallet_id === walletId);
  const selectedToWallet = (wallets ?? []).find((w) => w.wallet_id === destWalletId);
  const showFromGoal = isTransfer && selectedFromWallet?.wallet_type === "SAVINGS";
  const showToGoal = isTransfer && selectedToWallet?.wallet_type === "SAVINGS";

  const allWalletOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— кошелёк —" },
    ...(wallets ?? []).map((w) => ({ value: String(w.wallet_id), label: `${w.title} · ${fmtBalance(w.balance, w.currency)}` })),
  ], [wallets]);

  const expenseWalletOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— кошелёк —" },
    ...(wallets ?? []).filter((w) => w.wallet_type !== "SAVINGS").map((w) => ({
      value: String(w.wallet_id),
      label: `${w.title} · ${fmtBalance(w.balance, w.currency)}`,
    })),
  ], [wallets]);

  const categoryOptions: SelectOption[] = useMemo(() => {
    const opts: SelectOption[] = [{ value: "", label: "— без категории —" }];
    const forType = (finCats ?? []).filter((c) => c.category_type === kind);
    forType.sort((a, b) => a.title.localeCompare(b.title, "ru"));
    forType.forEach((c) => opts.push({ value: String(c.category_id), label: c.title }));
    return opts;
  }, [finCats, kind]);

  const goalOptions: SelectOption[] = useMemo(() => [
    { value: "", label: "— без цели —" },
    ...(goals ?? []).map((g) => ({ value: String(g.goal_id), label: g.title })),
  ], [goals]);

  const { mutate: saveEdit, isPending: pendingEdit } = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/api/v2/planned-ops/${template?.template_id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planned-ops"] });
      qc.invalidateQueries({ queryKey: ["planned-ops-upcoming"] });
      onClose();
    },
  });

  const { mutate: saveCreate, isPending: pendingCreate } = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post("/api/v2/planned-ops", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planned-ops"] });
      qc.invalidateQueries({ queryKey: ["planned-ops-upcoming"] });
      onClose();
    },
  });

  const isPending = pendingEdit || pendingCreate;

  function handleSave() {
    if (!title.trim() || !amount) return;

    if (isCreate) {
      const body: Record<string, unknown> = {
        kind,
        title: title.trim(),
        amount,
        freq,
        active_from: activeFrom || undefined,
        active_until: activeUntil || null,
        category_id: categoryId || null,
      };
      if (isTransfer) {
        body.wallet_id = walletId || null;
        body.destination_wallet_id = destWalletId || null;
        body.from_goal_id = fromGoalId || null;
        body.to_goal_id = toGoalId || null;
      } else {
        body.wallet_id = walletId || null;
      }
      saveCreate(body);
    } else {
      const body: Record<string, unknown> = {
        title: title.trim(),
        amount,
        active_until: activeUntil || null,
        category_id: categoryId || null,
      };
      if (isTransfer) {
        body.wallet_id = walletId || null;
        body.destination_wallet_id = destWalletId || null;
        body.from_goal_id = fromGoalId || null;
        body.to_goal_id = toGoalId || null;
      } else {
        body.wallet_id = walletId || null;
      }
      saveEdit(body);
    }
  }

  const footer = (
    <div className="flex gap-2.5">
      <Button variant="primary" size="md" fullWidth loading={isPending} onClick={handleSave}>
        {isCreate ? "Создать" : "Сохранить"}
      </Button>
      <Button variant="secondary" size="md" onClick={onClose} className="hidden md:inline-flex">
        Отмена
      </Button>
    </div>
  );

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={isCreate ? "Новый шаблон" : "Редактировать шаблон"}
      footer={footer}
    >
      <div className="space-y-3 md:space-y-4">

        {/* Kind — create mode only */}
        {isCreate && (
          <FormRow label="Тип" required>
            <Select
              value={kind}
              onChange={(v) => {
                setKind(v as KindType);
                setWalletId("");
                setDestWalletId("");
                setCategoryId("");
                setFromGoalId("");
                setToGoalId("");
              }}
              options={KIND_OPTIONS}
            />
          </FormRow>
        )}

        <FormRow label="Название" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название операции"
            autoFocus={isCreate}
          />
        </FormRow>

        <FormRow label="Сумма" required>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            tabular
          />
        </FormRow>

        {/* Freq — create mode only */}
        {isCreate && (
          <FormRow label="Периодичность" required>
            <Select
              value={freq}
              onChange={(v) => setFreq(v as string)}
              options={FREQ_OPTIONS}
            />
          </FormRow>
        )}

        {isTransfer ? (
          <>
            <FormRow label="Откуда">
              <Select
                value={walletId}
                onChange={(v) => { setWalletId(v ? Number(v) : ""); setFromGoalId(""); }}
                options={allWalletOptions}
                placeholder="— кошелёк —"
              />
            </FormRow>
            {showFromGoal && (
              <FormRow label="Цель (откуда)">
                <Select
                  value={fromGoalId}
                  onChange={(v) => setFromGoalId(v ? Number(v) : "")}
                  options={goalOptions}
                  placeholder="— без цели —"
                />
              </FormRow>
            )}
            <FormRow label="Куда">
              <Select
                value={destWalletId}
                onChange={(v) => { setDestWalletId(v ? Number(v) : ""); setToGoalId(""); }}
                options={allWalletOptions}
                placeholder="— кошелёк —"
              />
            </FormRow>
            {showToGoal && (
              <FormRow label="Цель (куда)">
                <Select
                  value={toGoalId}
                  onChange={(v) => setToGoalId(v ? Number(v) : "")}
                  options={goalOptions}
                  placeholder="— без цели —"
                />
              </FormRow>
            )}
          </>
        ) : (
          <>
            <FormRow label="Кошелёк">
              <Select
                value={walletId}
                onChange={(v) => setWalletId(v ? Number(v) : "")}
                options={kind === "EXPENSE" ? expenseWalletOptions : allWalletOptions}
                placeholder="— кошелёк —"
              />
            </FormRow>
            <FormRow label="Категория">
              <Select
                value={categoryId}
                onChange={(v) => setCategoryId(v ? Number(v) : "")}
                options={categoryOptions}
                placeholder="— без категории —"
                searchable
              />
            </FormRow>
          </>
        )}

        {/* Active from — create mode only */}
        {isCreate && (
          <FormRow label="Начало">
            <Input
              type="date"
              value={activeFrom}
              onChange={(e) => setActiveFrom(e.target.value)}
            />
          </FormRow>
        )}

        <FormRow label="Действует до">
          <Input
            type="date"
            value={activeUntil}
            onChange={(e) => setActiveUntil(e.target.value)}
          />
        </FormRow>

      </div>
    </BottomSheet>
  );
}

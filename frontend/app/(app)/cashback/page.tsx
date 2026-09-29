"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/primitives/PageHeader";
import { PeriodSwitcher } from "@/components/primitives/PeriodSwitcher";
import { EmptyState } from "@/components/primitives/EmptyState";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { CashbackRows } from "@/components/cashback/CashbackRows";
import {
  monthKey,
  monthLabel,
  useCashbackCategories,
  useCashbackMonth,
  useCreateEntry,
  useDeleteEntry,
  useUpdateEntry,
} from "@/hooks/useCashback";

const fieldStyle = {
  background: "var(--app-card-bg)",
  border: "1px solid var(--app-border)",
  color: "var(--t-primary)",
} as const;

export default function CashbackPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const month = useMemo(() => monthKey(cursor), [cursor]);

  const { data, isLoading } = useCashbackMonth(month);
  const { data: categories } = useCashbackCategories();
  const createEntry = useCreateEntry(month);
  const updateEntry = useUpdateEntry(month);
  const deleteEntry = useDeleteEntry(month);

  // Форма добавления: в каком кошельке добавляем
  const [addFor, setAddFor] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [percent, setPercent] = useState("");

  // Форма правки процента
  const [editId, setEditId] = useState<number | null>(null);
  const [editPercent, setEditPercent] = useState("");

  function shiftMonth(delta: number) {
    setCursor((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(percent.replace(",", "."));
    if (!addFor || !title.trim() || !value) return;
    createEntry.mutate(
      { wallet_id: addFor, percent: value, month, category_title: title.trim() },
      {
        onSuccess: () => {
          setAddFor(null);
          setTitle("");
          setPercent("");
        },
      },
    );
  }

  function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(editPercent.replace(",", "."));
    if (!editId || !value) return;
    updateEntry.mutate({ id: editId, percent: value }, { onSuccess: () => setEditId(null) });
  }

  const cards = data?.cards ?? [];

  return (
    <>
      <PageHeader
        title="Кэшбек"
        subtitle="Ставки по картам на месяц"
        period={
          <PeriodSwitcher
            scope="month"
            scopes={["month"]}
            label={monthLabel(cursor)}
            onPrev={() => shiftMonth(-1)}
            onNext={() => shiftMonth(1)}
          />
        }
      />

      <div className="px-4 pb-8">
        {isLoading ? (
          <p className="text-[13px]" style={{ color: "var(--t-faint)" }}>
            Загрузка…
          </p>
        ) : cards.length === 0 ? (
          <EmptyState
            emoji="💳"
            title="Нет обычных карт"
            description="Кэшбек ведётся только по обычным кошелькам. Добавь кошелёк, чтобы вносить ставки."
          />
        ) : (
          <div className="space-y-5">
            {cards.map((card) => (
              <div key={card.wallet_id}>
                <CashbackRows
                  cards={[card]}
                  onEntryClick={(id, value) => {
                    setEditId(id);
                    setEditPercent(String(value));
                  }}
                />
                <button
                  type="button"
                  onClick={() => setAddFor(card.wallet_id)}
                  className="mt-2 ml-6 inline-flex items-center gap-1 text-[12px]"
                  style={{ color: "var(--app-accent)" }}
                >
                  <Plus size={13} /> Добавить кэшбек
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Добавление ставки */}
      <BottomSheet
        open={addFor !== null}
        onClose={() => setAddFor(null)}
        title="Новый кэшбек"
        onSubmit={submitAdd}
        detent="half"
        footer={
          <button
            type="submit"
            disabled={createEntry.isPending}
            className="w-full rounded-lg py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--app-accent)" }}
          >
            Добавить
          </button>
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className="block text-[12px] mb-1" style={{ color: "var(--t-muted)" }}>
              Категория
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              list="cashback-categories"
              placeholder="Супермаркеты"
              className="w-full rounded-lg px-3 py-2 text-[14px]"
              style={fieldStyle}
            />
            {/* Справочник наполняется постепенно: подсказки из уже введённых категорий */}
            <datalist id="cashback-categories">
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.title} />
              ))}
            </datalist>
          </label>

          <label className="block">
            <span className="block text-[12px] mb-1" style={{ color: "var(--t-muted)" }}>
              Процент
            </span>
            <input
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              inputMode="decimal"
              placeholder="5"
              className="w-full rounded-lg px-3 py-2 text-[14px]"
              style={fieldStyle}
            />
          </label>
        </div>
      </BottomSheet>

      {/* Правка / удаление ставки */}
      <BottomSheet
        open={editId !== null}
        onClose={() => setEditId(null)}
        title="Изменить процент"
        onSubmit={submitEdit}
        detent="half"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (editId) deleteEntry.mutate(editId, { onSuccess: () => setEditId(null) });
              }}
              className="rounded-lg px-4 py-2.5 text-[14px] font-semibold"
              style={{ color: "var(--color-expense)", border: "1px solid var(--app-border)" }}
            >
              Удалить
            </button>
            <button
              type="submit"
              disabled={updateEntry.isPending}
              className="flex-1 rounded-lg py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--app-accent)" }}
            >
              Сохранить
            </button>
          </div>
        }
      >
        <label className="block">
          <span className="block text-[12px] mb-1" style={{ color: "var(--t-muted)" }}>
            Процент
          </span>
          <input
            value={editPercent}
            onChange={(e) => setEditPercent(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-lg px-3 py-2 text-[14px]"
            style={fieldStyle}
          />
        </label>
      </BottomSheet>
    </>
  );
}

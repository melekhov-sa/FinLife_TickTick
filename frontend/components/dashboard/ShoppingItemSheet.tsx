"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { DateInput } from "@/components/primitives/DateInput";
import { api } from "@/lib/api";
import type { ShoppingItem } from "@/types/api";

/**
 * Примерная цена и дата, к которой хочется купить.
 *
 * В день `want_by` фоновое задание заводит задачу «Купить …» с этой ценой
 * как подсказанной суммой (app/application/shopping_tasks.py). Отметка
 * «куплено» и выполнение задачи синхронизированы в обе стороны, поэтому
 * отмечать одно и то же дважды не придётся.
 */

interface Props {
  item: ShoppingItem | null;
  onClose: () => void;
}

export function ShoppingItemSheet({ item, onClose }: Props) {
  const qc = useQueryClient();
  const [price, setPrice] = useState("");
  const [wantBy, setWantBy] = useState("");

  useEffect(() => {
    if (!item) return;
    setPrice(item.price != null ? String(item.price) : "");
    setWantBy(item.want_by ?? "");
  }, [item]);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      api.patch(`/api/v2/lists/items/${item!.id}`, {
        // Пустое поле — осознанный сброс, поэтому null, а не undefined.
        price: price.trim() ? Number(price.replace(",", ".")) : null,
        want_by: wantBy || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["list", item?.id] });
      onClose();
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isPending) return;
    save();
  }

  return (
    <BottomSheet
      open={item !== null}
      onClose={onClose}
      title={item?.title ?? "Покупка"}
      detent="half"
      onSubmit={submit}
      footer={
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--app-accent)" }}
        >
          {isPending ? "Сохраняю…" : "Сохранить"}
        </button>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="block text-[12px] mb-1" style={{ color: "var(--t-muted)" }}>
            Примерная цена
          </span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="12000"
            className="w-full rounded-lg px-3 py-2 text-[14px]"
            style={{
              background: "var(--app-card-bg)",
              border: "1px solid var(--app-border)",
              color: "var(--t-primary)",
            }}
          />
        </label>

        <div>
          <span className="block text-[12px] mb-1" style={{ color: "var(--t-muted)" }}>
            Купить до
          </span>
          <DateInput value={wantBy} onChange={setWantBy} placeholder="Без даты" />
          <p className="text-[11px] mt-1.5 leading-snug" style={{ color: "var(--t-faint)" }}>
            {wantBy
              ? "В этот день появится задача «Купить " + (item?.title ?? "") + "»."
              : "С датой в этот день сама появится задача на покупку."}
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}

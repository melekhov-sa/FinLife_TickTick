"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, TrendingUp, TrendingDown, Minus, Pencil, Trash2, History } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Button } from "@/components/primitives/Button";
import { Skeleton } from "@/components/primitives/Skeleton";
import { EmptyState } from "@/components/primitives/EmptyState";
import type { CollectionCategory, CollectionItem } from "@/types/api";
import { ItemFormModal } from "@/components/collection/ItemFormModal";
import { PriceHistoryModal } from "@/components/collection/PriceHistoryModal";

const fmt = (n: number) => n.toLocaleString("ru-RU");

function RoiBadge({ roi }: { roi: number | null }) {
  if (roi === null) return null;
  const color = roi > 0 ? "text-emerald-500" : roi < 0 ? "text-red-400" : "text-slate-400";
  const Icon = roi > 0 ? TrendingUp : roi < 0 ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${color}`}>
      <Icon size={11} />
      {roi > 0 ? "+" : ""}{roi}%
    </span>
  );
}

function ItemLabel({ item, trackingType }: { item: CollectionItem; trackingType: string }) {
  if (trackingType === "serial") {
    return (
      <div>
        <p className="text-sm font-medium text-[var(--t-primary)]">{item.serial_number ?? "—"}</p>
        <p className="text-xs text-[var(--t-muted)]">
          {[item.denomination, item.country, item.issue_year, item.series].filter(Boolean).join(" · ")}
        </p>
      </div>
    );
  }
  if (trackingType === "pokemon") {
    return (
      <div className="flex items-center gap-3">
        {item.pokemon_image_url && (
          <img src={item.pokemon_image_url} alt={item.name ?? ""} className="w-8 h-11 object-contain rounded" />
        )}
        <div>
          <p className="text-sm font-medium text-[var(--t-primary)]">{item.name ?? "—"}</p>
          <p className="text-xs text-[var(--t-muted)]">
            {[item.pokemon_set_name, item.pokemon_card_number ? `#${item.pokemon_card_number}` : null, item.pokemon_rarity].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
    );
  }
  return (
    <div>
      <p className="text-sm font-medium text-[var(--t-primary)]">{item.name ?? "—"}</p>
      {item.comment && <p className="text-xs text-[var(--t-muted)] truncate max-w-[200px]">{item.comment}</p>}
    </div>
  );
}

export default function CategoryPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const catId = parseInt(categoryId);
  const router = useRouter();
  const qc = useQueryClient();

  const [itemModal, setItemModal] = useState<{ open: boolean; item?: CollectionItem }>({ open: false });
  const [historyItem, setHistoryItem] = useState<CollectionItem | null>(null);

  const { data: categories = [] } = useQuery<CollectionCategory[]>({
    queryKey: ["collection-categories"],
    queryFn: () => api.get<CollectionCategory[]>("/api/v2/collection/categories"),
  });

  const { data: items = [], isLoading } = useQuery<CollectionItem[]>({
    queryKey: ["collection-items", catId],
    queryFn: () => api.get<CollectionItem[]>(`/api/v2/collection/items?category_id=${catId}`),
  });

  const deleteItem = useMutation({
    mutationFn: (id: number) => api.delete(`/api/v2/collection/items/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collection-items", catId] });
      qc.invalidateQueries({ queryKey: ["collection-categories"] });
      qc.invalidateQueries({ queryKey: ["collection-summary"] });
    },
  });

  const cat = categories.find(c => c.id === catId);
  const trackingType = cat?.tracking_type ?? "name";

  const totalAcq = items.reduce((s, i) => s + i.acquisition_price, 0);
  const totalCur = items.reduce((s, i) => s + i.current_value, 0);
  const totalRoi = totalAcq > 0 ? parseFloat(((totalCur - totalAcq) / totalAcq * 100).toFixed(1)) : null;

  return (
    <>
      <PageHeader
        title={cat ? `${cat.emoji ?? "📦"} ${cat.name}` : "Категория"}
        back={{ onClick: () => router.push("/collection") }}
        actions={
          <Button size="sm" onClick={() => setItemModal({ open: true })}>
            <Plus size={14} className="mr-1" />Добавить
          </Button>
        }
      />

      <main className="flex-1 p-3 md:p-6 space-y-4">
        {items.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-[var(--bdr)] bg-[var(--card-bg)] p-3 text-center">
              <p className="text-[10px] text-[var(--t-muted)] mb-1">Вложено</p>
              <p className="text-sm font-bold tabular-nums text-[var(--t-primary)]">{fmt(totalAcq)} ₽</p>
            </div>
            <div className="rounded-xl border border-[var(--bdr)] bg-[var(--card-bg)] p-3 text-center">
              <p className="text-[10px] text-[var(--t-muted)] mb-1">Сейчас</p>
              <p className="text-sm font-bold tabular-nums text-[var(--app-accent)]">{fmt(totalCur)} ₽</p>
            </div>
            <div className="rounded-xl border border-[var(--bdr)] bg-[var(--card-bg)] p-3 text-center">
              <p className="text-[10px] text-[var(--t-muted)] mb-1">ROI</p>
              <div className="flex justify-center"><RoiBadge roi={totalRoi} /></div>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Plus size={28} />}
            title="Нет предметов"
            description="Добавьте первый предмет в эту категорию"
            action={{ label: "Добавить", onClick: () => setItemModal({ open: true }) }}
          />
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div
                key={item.id}
                className="group flex items-center justify-between rounded-xl border border-[var(--bdr)] bg-[var(--card-bg)] px-4 py-3"
              >
                <ItemLabel item={item} trackingType={trackingType} />
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-[var(--t-primary)]">{fmt(item.current_value)} ₽</p>
                    <RoiBadge roi={item.roi_pct} />
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1.5 rounded hover:bg-[var(--hover-bg)] text-[var(--t-muted)]"
                      onClick={() => setHistoryItem(item)} title="История цен">
                      <History size={13} />
                    </button>
                    <button className="p-1.5 rounded hover:bg-[var(--hover-bg)] text-[var(--t-muted)]"
                      onClick={() => setItemModal({ open: true, item })}>
                      <Pencil size={13} />
                    </button>
                    <button className="p-1.5 rounded hover:bg-[var(--hover-bg)] text-red-400"
                      onClick={() => { if (confirm("Удалить предмет?")) deleteItem.mutate(item.id); }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {itemModal.open && (
        <ItemFormModal
          item={itemModal.item}
          categoryId={catId}
          categories={categories}
          onClose={() => setItemModal({ open: false })}
          onSaved={() => {
            setItemModal({ open: false });
            qc.invalidateQueries({ queryKey: ["collection-items", catId] });
            qc.invalidateQueries({ queryKey: ["collection-categories"] });
            qc.invalidateQueries({ queryKey: ["collection-summary"] });
          }}
        />
      )}

      {historyItem && (
        <PriceHistoryModal item={historyItem} onClose={() => setHistoryItem(null)} />
      )}
    </>
  );
}

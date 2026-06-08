"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Plus, Search, Package, TrendingUp, TrendingDown, Minus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Button } from "@/components/primitives/Button";
import { Skeleton } from "@/components/primitives/Skeleton";
import { EmptyState } from "@/components/primitives/EmptyState";
import type { CollectionCategory, CollectionSummary, CollectionItem } from "@/types/api";
import { CategoryFormModal } from "@/components/collection/CategoryFormModal";
import { ItemFormModal } from "@/components/collection/ItemFormModal";

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

export default function CollectionPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [catModal, setCatModal] = useState<{ open: boolean; cat?: CollectionCategory }>({ open: false });
  const [itemModal, setItemModal] = useState<{ open: boolean; categoryId?: number }>({ open: false });

  const { data: summary, isLoading: loadingSummary } = useQuery<CollectionSummary>({
    queryKey: ["collection-summary"],
    queryFn: () => api.get<CollectionSummary>("/api/v2/collection/summary"),
  });

  const { data: categories = [], isLoading: loadingCats } = useQuery<CollectionCategory[]>({
    queryKey: ["collection-categories"],
    queryFn: () => api.get<CollectionCategory[]>("/api/v2/collection/categories"),
  });

  const { data: searchResults, isLoading: loadingSearch } = useQuery<CollectionItem[]>({
    queryKey: ["collection-search", search],
    queryFn: () => api.get<CollectionItem[]>(`/api/v2/collection/items?q=${encodeURIComponent(search)}`),
    enabled: search.trim().length >= 2,
  });

  const deleteCat = useMutation({
    mutationFn: (id: number) => api.delete(`/api/v2/collection/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collection-categories"] });
      qc.invalidateQueries({ queryKey: ["collection-summary"] });
    },
  });

  const isSearching = search.trim().length >= 2;

  return (
    <>
      <PageHeader
        title="Коллекция"
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => router.push("/collection/actualize")}>
              <RefreshCw size={14} className="mr-1" />Обновить цены
            </Button>
            <Button size="sm" onClick={() => setCatModal({ open: true })}>
              <Plus size={14} className="mr-1" />Категория
            </Button>
          </div>
        }
      />

      <main className="flex-1 p-3 md:p-6 space-y-5">
        {loadingSummary ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Текущая стоимость" value={`${fmt(summary.total_current_value)} ₽`} accent />
            <SummaryCard label="Вложено" value={`${fmt(summary.total_acquisition)} ₽`} />
            <SummaryCard
              label="ROI"
              value={summary.total_roi_pct !== null ? `${summary.total_roi_pct > 0 ? "+" : ""}${summary.total_roi_pct}%` : "—"}
              color={summary.total_roi_pct === null ? undefined : summary.total_roi_pct >= 0 ? "text-emerald-500" : "text-red-400"}
            />
            <SummaryCard label="Предметов" value={String(summary.item_count)} />
          </div>
        )}

        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t-muted)]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по коллекции..."
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-[var(--bdr)] bg-[var(--app-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] focus:ring-opacity-30"
          />
        </div>

        {isSearching && (
          <div>
            <p className="text-xs text-[var(--t-muted)] mb-2">
              {loadingSearch ? "Поиск..." : `Найдено: ${searchResults?.length ?? 0}`}
            </p>
            {searchResults && searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map(item => (
                  <SearchResultCard key={item.id} item={item} categories={categories} />
                ))}
              </div>
            )}
            {!loadingSearch && searchResults?.length === 0 && (
              <p className="text-sm text-[var(--t-muted)] text-center py-8">Ничего не найдено</p>
            )}
          </div>
        )}

        {!isSearching && (
          <>
            {loadingCats ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
              </div>
            ) : categories.length === 0 ? (
              <EmptyState
                icon={<Package size={32} />}
                title="Нет категорий"
                description="Создайте первую категорию коллекции"
                action={{ label: "Создать", onClick: () => setCatModal({ open: true }) }}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {categories.map(cat => (
                  <CategoryCard
                    key={cat.id}
                    cat={cat}
                    onOpen={() => router.push(`/collection/${cat.id}`)}
                    onEdit={() => setCatModal({ open: true, cat })}
                    onDelete={() => { if (confirm(`Удалить категорию «${cat.name}»?`)) deleteCat.mutate(cat.id); }}
                    onAddItem={() => setItemModal({ open: true, categoryId: cat.id })}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {catModal.open && (
        <CategoryFormModal
          category={catModal.cat}
          onClose={() => setCatModal({ open: false })}
          onSaved={() => { setCatModal({ open: false }); qc.invalidateQueries({ queryKey: ["collection-categories"] }); }}
        />
      )}

      {itemModal.open && itemModal.categoryId && (
        <ItemFormModal
          categoryId={itemModal.categoryId}
          categories={categories}
          onClose={() => setItemModal({ open: false })}
          onSaved={() => {
            setItemModal({ open: false });
            qc.invalidateQueries({ queryKey: ["collection-categories"] });
            qc.invalidateQueries({ queryKey: ["collection-summary"] });
          }}
        />
      )}
    </>
  );
}

function SummaryCard({ label, value, accent, color }: { label: string; value: string; accent?: boolean; color?: string }) {
  return (
    <div className="rounded-xl border border-[var(--bdr)] bg-[var(--card-bg)] p-4">
      <p className="text-[11px] text-[var(--t-muted)] mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${accent ? "text-[var(--app-accent)]" : color ?? "text-[var(--t-primary)]"}`}>
        {value}
      </p>
    </div>
  );
}

function CategoryCard({ cat, onOpen, onEdit, onDelete, onAddItem }: {
  cat: CollectionCategory;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddItem: () => void;
}) {
  return (
    <div
      className="group rounded-xl border border-[var(--bdr)] bg-[var(--card-bg)] p-4 cursor-pointer hover:border-[var(--app-accent)] transition-colors"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{cat.emoji ?? "📦"}</span>
          <div>
            <p className="font-semibold text-[var(--t-primary)]">{cat.name}</p>
            <p className="text-xs text-[var(--t-muted)]">{cat.item_count} предм.</p>
          </div>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <button className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--t-muted)]" onClick={onAddItem} title="Добавить предмет">
            <Plus size={13} />
          </button>
          <button className="p-1 rounded hover:bg-[var(--hover-bg)] text-[var(--t-muted)]" onClick={onEdit}>
            <Pencil size={13} />
          </button>
          <button className="p-1 rounded hover:bg-[var(--hover-bg)] text-red-400" onClick={onDelete}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-[var(--bdr)] flex justify-between items-end">
        <span className="text-xs text-[var(--t-muted)]">Стоимость</span>
        <span className="font-semibold tabular-nums text-[var(--t-primary)]">{fmt(cat.total_value)} ₽</span>
      </div>
    </div>
  );
}

function SearchResultCard({ item, categories }: { item: CollectionItem; categories: CollectionCategory[] }) {
  const cat = categories.find(c => c.id === item.category_id);
  const label = item.name ?? item.serial_number ?? `#${item.id}`;
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--bdr)] bg-[var(--card-bg)] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-[var(--t-primary)]">{label}</p>
        <p className="text-xs text-[var(--t-muted)]">{cat?.emoji} {cat?.name}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums text-[var(--t-primary)]">{fmt(item.current_value)} ₽</p>
        <RoiBadge roi={item.roi_pct} />
      </div>
    </div>
  );
}

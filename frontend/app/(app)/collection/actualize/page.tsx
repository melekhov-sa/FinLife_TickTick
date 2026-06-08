"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Save, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/primitives/PageHeader";
import { Button } from "@/components/primitives/Button";
import { Skeleton } from "@/components/primitives/Skeleton";
import type { CollectionCategory, CollectionItem } from "@/types/api";

const fmt = (n: number) => n.toLocaleString("ru-RU");

export default function ActualizePage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: categories = [] } = useQuery<CollectionCategory[]>({
    queryKey: ["collection-categories"],
    queryFn: () => api.get<CollectionCategory[]>("/api/v2/collection/categories"),
  });

  const { data: items = [], isLoading } = useQuery<CollectionItem[]>({
    queryKey: ["collection-items-all"],
    queryFn: () => api.get<CollectionItem[]>("/api/v2/collection/items"),
  });

  const [prices, setPrices] = useState<Record<number, string>>({});
  const [changed, setChanged] = useState<Set<number>>(new Set());

  useEffect(() => {
    const init: Record<number, string> = {};
    items.forEach(item => { init[item.id] = String(item.current_value); });
    setPrices(init);
    setChanged(new Set());
  }, [items]);

  const actualize = useMutation({
    mutationFn: (payload: { items: { item_id: number; new_value: number }[] }) =>
      api.post("/api/v2/collection/actualize-prices", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collection-items-all"] });
      qc.invalidateQueries({ queryKey: ["collection-categories"] });
      qc.invalidateQueries({ queryKey: ["collection-summary"] });
      router.push("/collection");
    },
  });

  function handleChange(itemId: number, val: string) {
    setPrices(p => ({ ...p, [itemId]: val }));
    const item = items.find(i => i.id === itemId);
    const parsed = parseInt(val) || 0;
    if (item && parsed !== item.current_value) {
      setChanged(prev => new Set(prev).add(itemId));
    } else {
      setChanged(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    }
  }

  function handleSave() {
    const payload = Array.from(changed).map(itemId => ({
      item_id: itemId,
      new_value: parseInt(prices[itemId]) || 0,
    }));
    if (payload.length === 0) { router.push("/collection"); return; }
    actualize.mutate({ items: payload });
  }

  const groupedByCat = categories.map(cat => ({
    cat,
    items: items.filter(i => i.category_id === cat.id),
  })).filter(g => g.items.length > 0);

  return (
    <>
      <PageHeader
        title="Обновить цены"
        back={{ onClick: () => router.push("/collection") }}
        actions={
          <Button
            size="sm"
            onClick={handleSave}
            disabled={actualize.isPending}
          >
            {actualize.isPending
              ? <RefreshCw size={13} className="mr-1 animate-spin" />
              : <Save size={13} className="mr-1" />
            }
            Сохранить{changed.size > 0 ? ` (${changed.size})` : ""}
          </Button>
        }
      />

      <main className="flex-1 p-3 md:p-6 space-y-6">
        {isLoading ? (
          <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : (
          groupedByCat.map(({ cat, items: catItems }) => (
            <div key={cat.id}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--t-muted)] mb-2 px-1">
                {cat.emoji} {cat.name}
              </h3>
              <div className="space-y-2">
                {catItems.map(item => {
                  const label = item.name ?? item.serial_number ?? `#${item.id}`;
                  const subtitle = cat.tracking_type === "serial"
                    ? [item.denomination, item.country, item.issue_year].filter(Boolean).join(" · ")
                    : cat.tracking_type === "pokemon"
                    ? [item.pokemon_set_name, item.pokemon_card_number ? `#${item.pokemon_card_number}` : null].filter(Boolean).join(" · ")
                    : item.comment;
                  const isChanged = changed.has(item.id);

                  return (
                    <div key={item.id}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${isChanged ? "border-[var(--app-accent)] bg-[var(--app-accent)]/[0.04]" : "border-[var(--bdr)] bg-[var(--card-bg)]"}`}
                    >
                      <div className="min-w-0 flex-1 mr-4">
                        <p className="text-sm font-medium text-[var(--t-primary)] truncate">{label}</p>
                        {subtitle && <p className="text-xs text-[var(--t-muted)] truncate">{subtitle}</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-[var(--t-muted)] tabular-nums">{fmt(item.current_value)} ₽</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={prices[item.id] ?? ""}
                            onChange={e => handleChange(item.id, e.target.value)}
                            className="w-28 text-right text-sm font-semibold rounded-lg border border-[var(--bdr)] bg-[var(--app-bg)] px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] focus:ring-opacity-30 tabular-nums"
                          />
                          <span className="text-sm text-[var(--t-muted)]">₽</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </main>
    </>
  );
}

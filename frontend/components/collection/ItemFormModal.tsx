"use client";

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { BottomSheet } from "@/components/ui/BottomSheet";
import type { CollectionCategory, CollectionItem, PokemonCardResult } from "@/types/api";

const inputCls = "w-full px-3 h-10 text-sm rounded-xl border focus:outline-none focus:border-[var(--app-accent)] transition-colors bg-white dark:bg-white/[0.05] border-slate-300 dark:border-white/[0.08] text-slate-800 dark:text-white/85 placeholder-slate-400 dark:placeholder-white/25";
const labelCls = "block text-[11px] font-medium uppercase tracking-wider mb-1.5 text-slate-500 dark:text-white/60";

interface Props {
  item?: CollectionItem;
  categoryId: number;
  categories: CollectionCategory[];
  onClose: () => void;
  onSaved: () => void;
}

export function ItemFormModal({ item, categoryId, categories, onClose, onSaved }: Props) {
  const isEdit = !!item;
  const cat = categories.find(c => c.id === categoryId);
  const trackingType = cat?.tracking_type ?? "name";

  const [name, setName] = useState(item?.name ?? "");
  const [comment, setComment] = useState(item?.comment ?? "");
  const [acquisitionDate, setAcquisitionDate] = useState(item?.acquisition_date ?? "");
  const [acquisitionPrice, setAcquisitionPrice] = useState(String(item?.acquisition_price ?? ""));
  const [currentValue, setCurrentValue] = useState(String(item?.current_value ?? ""));

  // Serial fields
  const [serialNumber, setSerialNumber] = useState(item?.serial_number ?? "");
  const [denomination, setDenomination] = useState(item?.denomination ?? "");
  const [country, setCountry] = useState(item?.country ?? "");
  const [issueYear, setIssueYear] = useState(String(item?.issue_year ?? ""));
  const [series, setSeries] = useState(item?.series ?? "");

  // Pokemon fields
  const [pokemonCardId, setPokemonCardId] = useState(item?.pokemon_card_id ?? "");
  const [pokemonSetName, setPokemonSetName] = useState(item?.pokemon_set_name ?? "");
  const [pokemonCardNumber, setPokemonCardNumber] = useState(item?.pokemon_card_number ?? "");
  const [pokemonRarity, setPokemonRarity] = useState(item?.pokemon_rarity ?? "");
  const [pokemonImageUrl, setPokemonImageUrl] = useState(item?.pokemon_image_url ?? "");
  const [pokemonSearch, setPokemonSearch] = useState(item?.name ?? "");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: pokemonResults = [] } = useQuery<PokemonCardResult[]>({
    queryKey: ["pokemon-search", pokemonSearch],
    queryFn: () => api.get<PokemonCardResult[]>(`/api/v2/collection/pokemon-cards/search?q=${encodeURIComponent(pokemonSearch)}`),
    enabled: trackingType === "pokemon" && pokemonSearch.trim().length >= 2 && showSuggestions,
  });

  function selectPokemonCard(card: PokemonCardResult) {
    setName(card.name);
    setPokemonCardId(card.id);
    setPokemonSetName(card.set_name);
    setPokemonCardNumber(card.number);
    setPokemonRarity(card.rarity ?? "");
    setPokemonImageUrl(card.image_url_small ?? "");
    setPokemonSearch(card.name);
    setShowSuggestions(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      category_id: categoryId,
      acquisition_date: acquisitionDate || null,
      acquisition_price: parseInt(acquisitionPrice) || 0,
      current_value: parseInt(currentValue) || 0,
      comment: comment.trim() || null,
    };

    if (trackingType === "serial") {
      payload.serial_number = serialNumber.trim() || null;
      payload.denomination = denomination.trim() || null;
      payload.country = country.trim() || null;
      payload.issue_year = issueYear ? parseInt(issueYear) : null;
      payload.series = series.trim() || null;
    } else if (trackingType === "pokemon") {
      payload.name = name.trim() || null;
      payload.pokemon_card_id = pokemonCardId || null;
      payload.pokemon_set_name = pokemonSetName || null;
      payload.pokemon_card_number = pokemonCardNumber || null;
      payload.pokemon_rarity = pokemonRarity || null;
      payload.pokemon_image_url = pokemonImageUrl || null;
    } else {
      payload.name = name.trim() || null;
    }

    try {
      if (isEdit) {
        await api.patch(`/api/v2/collection/items/${item!.id}`, payload);
      } else {
        await api.post("/api/v2/collection/items", payload);
      }
      onSaved();
    } catch {
      setError("Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet open title={isEdit ? "Редактировать предмет" : "Добавить предмет"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">

        {trackingType === "pokemon" && (
          <div className="relative">
            <label className={labelCls}>Карточка</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={pokemonSearch}
                onChange={e => { setPokemonSearch(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Найти карточку..."
                className={inputCls + " pl-9"}
              />
              {pokemonCardId && (
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  onClick={() => { setPokemonCardId(""); setPokemonSearch(""); setName(""); }}>
                  <X size={14} />
                </button>
              )}
            </div>

            {showSuggestions && pokemonResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                {pokemonResults.map(card => (
                  <button
                    key={card.id}
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/[0.05] text-left"
                    onMouseDown={() => selectPokemonCard(card)}
                  >
                    {card.image_url_small && (
                      <img src={card.image_url_small} alt={card.name} className="w-8 h-11 object-contain rounded" />
                    )}
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-white/85">{card.name}</p>
                      <p className="text-xs text-slate-400">{card.set_name} · #{card.number} · {card.rarity}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {pokemonCardId && (
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-white/50">
                {pokemonImageUrl && <img src={pokemonImageUrl} alt={name} className="w-6 h-8 object-contain rounded" />}
                <span>{pokemonSetName} · #{pokemonCardNumber} · {pokemonRarity}</span>
              </div>
            )}
          </div>
        )}

        {(trackingType === "name" || (trackingType === "pokemon" && !pokemonCardId)) && (
          <div>
            <label className={labelCls}>Название *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Название предмета" className={inputCls} />
          </div>
        )}

        {trackingType === "serial" && (
          <>
            <div>
              <label className={labelCls}>Серийный номер *</label>
              <input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="АА 0000000" className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Номинал</label>
                <input value={denomination} onChange={e => setDenomination(e.target.value)} placeholder="100 руб" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Год</label>
                <input value={issueYear} onChange={e => setIssueYear(e.target.value)} type="number" placeholder="2023" className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Страна</label>
                <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Россия" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Серия</label>
                <input value={series} onChange={e => setSeries(e.target.value)} placeholder="АА" className={inputCls} />
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Куплено за ₽</label>
            <input value={acquisitionPrice} onChange={e => setAcquisitionPrice(e.target.value)}
              type="number" placeholder="0" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Текущая цена ₽</label>
            <input value={currentValue} onChange={e => setCurrentValue(e.target.value)}
              type="number" placeholder="0" className={inputCls} />
          </div>
        </div>

        <div>
          <label className={labelCls}>Дата приобретения</label>
          <input value={acquisitionDate} onChange={e => setAcquisitionDate(e.target.value)}
            type="date" className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Комментарий</label>
          <input value={comment} onChange={e => setComment(e.target.value)}
            placeholder="Особенности, состояние..." className={inputCls} />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full h-11 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent)] disabled:opacity-50 text-white font-semibold text-sm transition-colors"
        >
          {saving ? "Сохранение..." : isEdit ? "Сохранить" : "Добавить"}
        </button>
      </form>
    </BottomSheet>
  );
}

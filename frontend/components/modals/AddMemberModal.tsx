"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Select } from "@/components/ui/Select";

interface ContactItem {
  id: number;
  name: string;
}

interface Props {
  subId: number;
  onClose: () => void;
}

const inputCls =
  "w-full px-3 h-10 text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors";
const labelCls =
  "block text-xs font-medium text-white/72 uppercase tracking-wider mb-1.5";

export function AddMemberModal({ subId, onClose }: Props) {
  const qc = useQueryClient();
  const overlayRef = useRef<HTMLDivElement>(null);

  const [contactId, setContactId] = useState<string>("");
  const [paymentPerMonth, setPaymentPerMonth] = useState("");
  const [paidUntil, setPaidUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: contacts = [] } = useQuery<ContactItem[]>({
    queryKey: ["contacts"],
    queryFn: () => api.get<ContactItem[]>("/api/v2/contacts"),
    staleTime: 60_000,
  });

  const contactOptions = [
    { value: "", label: "— Выберите участника —" },
    ...contacts.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  async function handleSave() {
    if (!contactId) { setError("Выберите участника"); return; }
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/v2/subscriptions/${subId}/members`, {
        contact_id: Number(contactId),
        payment_per_month: paymentPerMonth ? parseFloat(paymentPerMonth) : null,
        paid_until: paidUntil || null,
      });
      qc.invalidateQueries({ queryKey: ["subscriptions"] });
      onClose();
    } catch {
      setError("Не удалось добавить участника");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-sm mx-4 bg-[#1a1d23] border border-white/[0.09] rounded-2xl shadow-2xl p-6">
        <h2 className="text-[15px] font-semibold text-white/90 mb-5">Добавить участника</h2>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>Участник</label>
            <Select
              value={contactId}
              onChange={setContactId}
              options={contactOptions}
            />
          </div>

          <div>
            <label className={labelCls}>Сумма в месяц (₽)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={paymentPerMonth}
              onChange={(e) => setPaymentPerMonth(e.target.value)}
              placeholder="необязательно"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Оплачено до</label>
            <input
              type="date"
              value={paidUntil}
              onChange={(e) => setPaidUntil(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mt-4">
            {error}
          </p>
        )}

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleSave}
            disabled={saving || !contactId}
            className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
          >
            {saving ? "Сохраняем…" : "Добавить"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/68 hover:bg-white/[0.08] transition-colors"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

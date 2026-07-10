"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useCreateDocument, useUpdateDocument } from "@/hooks/useDocuments";
import type { Document } from "@/types/api";

const DOC_TYPE_PRESETS = [
  "Загранпаспорт", "Внутренний паспорт", "Водительские права",
  "Виза", "Страховой полис", "Медкнижка", "Вид на жительство",
  "Разрешение на работу", "Техпаспорт", "Другое",
];

interface Props {
  doc?: Document;
  onClose: () => void;
}

export function DocumentModal({ doc, onClose }: Props) {
  const isEdit = !!doc;

  const [title, setTitle] = useState(doc?.title ?? "");
  const [docType, setDocType] = useState(doc?.doc_type ?? "");
  const [issuedDate, setIssuedDate] = useState(doc?.issued_date ?? "");
  const [expiryDate, setExpiryDate] = useState(doc?.expiry_date ?? "");
  const [notifyDays, setNotifyDays] = useState<string>(
    doc?.notify_days_before != null ? String(doc.notify_days_before) : "30"
  );
  const [note, setNote] = useState(doc?.note ?? "");

  const { mutate: create, isPending: isCreating } = useCreateDocument();
  const { mutate: update, isPending: isUpdating } = useUpdateDocument();
  const isPending = isCreating || isUpdating;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !expiryDate) return;

    const payload = {
      title: title.trim(),
      doc_type: docType.trim() || null,
      issued_date: issuedDate || null,
      expiry_date: expiryDate,
      notify_days_before: notifyDays ? parseInt(notifyDays, 10) : null,
      note: note.trim() || null,
    };

    if (isEdit) {
      update({ id: doc.id, ...payload }, { onSuccess: onClose });
    } else {
      create(payload, { onSuccess: onClose });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl p-5 max-h-[calc(100dvh-48px)] overflow-y-auto overscroll-contain"
        style={{ background: "var(--app-card-bg)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[17px] font-bold" style={{ color: "var(--t-primary)" }}>
            {isEdit ? "Редактировать документ" : "Добавить документ"}
          </h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08]">
            <X size={16} style={{ color: "var(--t-faint)" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
              Название *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Загранпаспорт"
              className="w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-indigo-400"
              style={{ borderColor: "rgba(99,102,241,0.25)", background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" }}
              required
            />
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
              Тип документа
            </label>
            <input
              list="doc-type-list"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              placeholder="Выберите или введите"
              className="w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-indigo-400"
              style={{ borderColor: "rgba(99,102,241,0.25)", background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" }}
            />
            <datalist id="doc-type-list">
              {DOC_TYPE_PRESETS.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
                Дата выдачи
              </label>
              <input
                type="date"
                value={issuedDate}
                onChange={(e) => setIssuedDate(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-indigo-400"
                style={{ borderColor: "rgba(99,102,241,0.25)", background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" }}
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
                Действителен до *
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-indigo-400"
                style={{ borderColor: "rgba(99,102,241,0.25)", background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" }}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
              Напомнить за (дней)
            </label>
            <div className="flex gap-2">
              {["14", "30", "60", "90"].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setNotifyDays(d)}
                  className={`flex-1 py-1.5 rounded-lg text-[13px] font-medium border transition-colors ${
                    notifyDays === d
                      ? "bg-indigo-500 border-indigo-500 text-white"
                      : "border-slate-200 dark:border-white/[0.12]"
                  }`}
                  style={notifyDays !== d ? { color: "var(--t-muted)" } : undefined}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[12px] font-medium mb-1" style={{ color: "var(--t-muted)" }}>
              Заметка
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Серия, номер, кем выдан…"
              className="w-full rounded-xl border px-3 py-2 text-[14px] outline-none focus:border-indigo-400 resize-none"
              style={{ borderColor: "rgba(99,102,241,0.25)", background: "var(--t-input-bg, transparent)", color: "var(--t-primary)" }}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border text-[14px] font-medium transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.06]"
              style={{ borderColor: "rgba(99,102,241,0.2)", color: "var(--t-muted)" }}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isPending || !title.trim() || !expiryDate}
              className="flex-1 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-[14px] font-medium transition-colors disabled:opacity-50"
            >
              {isPending ? "Сохранение…" : isEdit ? "Сохранить" : "Добавить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { FileBadge2, Archive, Pencil, AlertTriangle, Plus } from "lucide-react";
import { clsx } from "clsx";
import { useDocuments, useArchiveDocument } from "@/hooks/useDocuments";
import { Button } from "@/components/primitives/Button";
import { Skeleton } from "@/components/primitives/Skeleton";
import type { Document } from "@/types/api";
import { DocumentModal } from "@/components/modals/DocumentModal";

function daysLabel(days: number): { text: string; cls: string } {
  if (days < 0) return { text: "Истёк", cls: "text-red-500" };
  if (days === 0) return { text: "Сегодня", cls: "text-red-500" };
  if (days <= 30) return { text: `${days} дн.`, cls: "text-orange-500" };
  if (days <= 60) return { text: `${days} дн.`, cls: "text-amber-500" };
  return { text: `${days} дн.`, cls: "text-emerald-500" };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

function DocCard({ doc, onEdit }: { doc: Document; onEdit: (doc: Document) => void }) {
  const { mutate: archive, isPending } = useArchiveDocument();
  const { text, cls } = daysLabel(doc.days_until_expiry);

  return (
    <div className={clsx(
      "bg-white dark:bg-white/[0.05] rounded-2xl border p-4 flex flex-col gap-3 transition-opacity",
      doc.is_expired ? "border-red-300/60 dark:border-red-500/30" : "border-slate-200 dark:border-white/[0.09]",
      isPending && "opacity-50 pointer-events-none",
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileBadge2 size={16} className="shrink-0 text-indigo-400" />
          <div className="min-w-0">
            <p className="font-semibold text-[15px] truncate" style={{ color: "var(--t-primary)" }}>{doc.title}</p>
            {doc.doc_type && <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>{doc.doc_type}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onEdit(doc)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors" style={{ color: "var(--t-faint)" }}>
            <Pencil size={13} />
          </button>
          <button onClick={() => archive(doc.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-500 transition-colors" style={{ color: "var(--t-faint)" }}>
            <Archive size={13} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
        {doc.issued_date && (
          <><span style={{ color: "var(--t-faint)" }}>Выдан</span><span style={{ color: "var(--t-muted)" }}>{formatDate(doc.issued_date)}</span></>
        )}
        <span style={{ color: "var(--t-faint)" }}>Действителен до</span>
        <span style={{ color: "var(--t-muted)" }}>{formatDate(doc.expiry_date)}</span>
        <span style={{ color: "var(--t-faint)" }}>До истечения</span>
        <span className={clsx("font-semibold", cls)}>{text}</span>
        {doc.notify_days_before != null && (
          <><span style={{ color: "var(--t-faint)" }}>Напомнить за</span><span style={{ color: "var(--t-muted)" }}>{doc.notify_days_before} дн.</span></>
        )}
      </div>
      {doc.note && <p className="text-[13px] italic" style={{ color: "var(--t-faint)" }}>{doc.note}</p>}
    </div>
  );
}

export function DocumentsTab() {
  const { data: docs, isLoading } = useDocuments();
  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const active = docs?.filter((d) => !d.is_archived) ?? [];
  const expired = active.filter((d) => d.is_expired);
  const expiringSoon = active.filter((d) => !d.is_expired && d.days_until_expiry <= 60);
  const valid = active.filter((d) => !d.is_expired && d.days_until_expiry > 60);

  return (
    <>
      {(showCreate || editDoc) && (
        <DocumentModal doc={editDoc ?? undefined} onClose={() => { setShowCreate(false); setEditDoc(null); }} />
      )}

      <div className="w-full">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-[13px]" style={{ color: "var(--t-muted)" }}>Отслеживайте сроки действия документов</p>
          <Button variant="primary" size="sm" leftIcon={<Plus size={14} />} onClick={() => setShowCreate(true)}>
            Добавить
          </Button>
        </div>

        {isLoading && (
          <div className="grid sm:grid-cols-2 gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} variant="rect" className="h-36 rounded-2xl" />)}
          </div>
        )}

        {!isLoading && active.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <FileBadge2 size={32} className="text-slate-300 dark:text-white/20" />
            <p className="text-[14px]" style={{ color: "var(--t-muted)" }}>Нет документов</p>
            <p className="text-[13px]" style={{ color: "var(--t-faint)" }}>Добавьте паспорт, права, визу или любой другой документ с датой окончания</p>
          </div>
        )}

        {expired.length > 0 && (
          <section className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} className="text-red-500" />
              <h2 className="text-[12px] font-bold uppercase tracking-wider text-red-500">Истекли</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {expired.map((d) => <DocCard key={d.id} doc={d} onEdit={setEditDoc} />)}
            </div>
          </section>
        )}

        {expiringSoon.length > 0 && (
          <section className="mb-5">
            <h2 className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--t-muted)" }}>Истекают в ближайшие 60 дней</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {expiringSoon.map((d) => <DocCard key={d.id} doc={d} onEdit={setEditDoc} />)}
            </div>
          </section>
        )}

        {valid.length > 0 && (
          <section>
            <h2 className="text-[12px] font-bold uppercase tracking-wider mb-2" style={{ color: "var(--t-muted)" }}>Действительны</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {valid.map((d) => <DocCard key={d.id} doc={d} onEdit={setEditDoc} />)}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";

interface Props {
  action: "archive" | "restore";
  entityName: string;  // e.g. "кошелёк", "подписку", "привычку"
  title: string;       // entity title to display
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmArchiveModal({ action, entityName, title, onConfirm, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isArchive = action === "archive";
  const heading = isArchive ? "В архив" : "Из архива";
  const description = isArchive
    ? `Перенести ${entityName} «${title}» в архив?`
    : `Восстановить ${entityName} «${title}» из архива?`;
  const buttonText = isArchive ? "В архив" : "Восстановить";
  const buttonColor = isArchive
    ? "bg-amber-600 hover:bg-amber-500"
    : "bg-emerald-600 hover:bg-emerald-500";

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  const footer = (
    <div className="flex gap-2.5">
      <button
        onClick={handleConfirm}
        disabled={loading}
        className={`flex-1 py-2.5 text-sm font-medium rounded-xl ${buttonColor} text-white disabled:opacity-50 transition-colors`}
      >
        {loading ? "Обработка…" : buttonText}
      </button>
      <button
        onClick={onClose}
        className="px-4 py-2.5 text-sm font-medium rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/60 hover:bg-white/[0.08] transition-colors"
      >
        Отмена
      </button>
    </div>
  );

  return (
    <BottomSheet open={true} title={heading} onClose={onClose} footer={footer}>
      <p className="text-[14px]" style={{ color: "var(--t-secondary)" }}>
        {description}
      </p>
      {!isArchive && (
        <p className="text-[12px] mt-2" style={{ color: "var(--t-faint)" }}>
          Сущность станет снова активной и появится в основных списках.
        </p>
      )}
      {error && (
        <p className="text-[13px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 mt-3">
          {error}
        </p>
      )}
    </BottomSheet>
  );
}

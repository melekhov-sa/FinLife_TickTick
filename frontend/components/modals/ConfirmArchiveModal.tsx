"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/primitives/Button";

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
      <Button
        variant="primary"
        size="md"
        loading={loading}
        onClick={handleConfirm}
        fullWidth
      >
        {buttonText}
      </Button>
      <Button variant="secondary" size="md" onClick={onClose}>
        Отмена
      </Button>
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

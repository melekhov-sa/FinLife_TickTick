"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";

interface Props {
  /** Название удаляемой сущности в винительном падеже: "задачу", "элемент", "группу". */
  entityName?: string;
  /** Заголовок самой удаляемой записи, подставляется в кавычки. */
  title: string;
  /** Полностью кастомное сообщение вместо стандартного. */
  description?: string;
  /** Обработчик подтверждения; может быть async. */
  onConfirm: () => Promise<void> | void;
  /** Закрытие модалки. */
  onClose: () => void;
}

export function ConfirmDeleteModal({
  entityName = "элемент",
  title,
  description,
  onConfirm,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const msg =
    description ?? `Удалить ${entityName} «${title}»? Это действие необратимо.`;

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e: unknown) {
      const errMessage = e instanceof Error ? e.message : "Ошибка";
      setError(errMessage);
    } finally {
      setLoading(false);
    }
  }

  const footer = (
    <div className="flex gap-2.5">
      <button
        onClick={handleConfirm}
        disabled={loading}
        className="flex-1 py-2.5 text-sm font-medium rounded-xl bg-red-600 hover:bg-red-500 text-white disabled:opacity-50 transition-colors"
      >
        {loading ? "Удаляем…" : "Удалить"}
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
    <BottomSheet open={true} title="Удалить?" onClose={onClose} footer={footer}>
      <p className="text-[14px]" style={{ color: "var(--t-secondary)" }}>
        {msg}
      </p>
      {error && (
        <p className="text-[13px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 mt-3">
          {error}
        </p>
      )}
    </BottomSheet>
  );
}

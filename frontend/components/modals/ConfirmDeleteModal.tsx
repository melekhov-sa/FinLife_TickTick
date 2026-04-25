"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/primitives/Button";

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
      <Button
        variant="destructive"
        size="md"
        loading={loading}
        onClick={handleConfirm}
        fullWidth
      >
        Удалить
      </Button>
      <Button variant="secondary" size="md" onClick={onClose}>
        Отмена
      </Button>
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

"use client";

/**
 * Одиночный вопрос себе на дату («1 августа: передать показания счётчиков?»).
 * Всплывёт попапом в выбранный день; «Нет» может создать задачу.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FormRow } from "@/components/ui/FormRow";
import { Input } from "@/components/primitives/Input";
import { Button } from "@/components/primitives/Button";
import { DateInput } from "@/components/primitives/DateInput";
import { hapticSuccess } from "@/lib/native";

export function SelfCheckModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [question, setQuestion] = useState("");
  const [askDate, setAskDate] = useState("");
  const [fallbackTitle, setFallbackTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      api.post("/api/v2/checks", {
        question: question.trim(),
        ask_date: askDate,
        fallback_task_title: fallbackTitle.trim() || null,
      }),
    onSuccess: () => {
      void hapticSuccess();
      qc.invalidateQueries({ queryKey: ["checks-pending"] });
      onClose();
    },
    onError: (e: unknown) =>
      setError(e instanceof Error ? e.message.replace(/^API error \d+: /, "") : "Ошибка"),
  });

  const footer = (
    <div className="flex gap-2">
      <Button variant="secondary" size="md" onClick={onClose} fullWidth>Отмена</Button>
      <Button
        variant="primary"
        size="md"
        fullWidth
        loading={createMut.isPending}
        disabled={!question.trim() || !askDate}
        onClick={() => createMut.mutate()}
      >
        Создать
      </Button>
    </div>
  );

  return (
    <BottomSheet open onClose={onClose} title="Спросить себя" footer={footer}>
      <div className="space-y-4">
        <FormRow label="Вопрос" required>
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="«Передать показания счётчиков?»"
            autoFocus
          />
        </FormRow>
        <FormRow label="Когда спросить" required>
          <DateInput value={askDate} onChange={setAskDate} />
          <p className="text-[11px] mt-1" style={{ color: "var(--t-faint)" }}>
            В этот день вопрос всплывёт при открытии приложения.
          </p>
        </FormRow>
        <FormRow label="Задача при «Нет»">
          <Input
            value={fallbackTitle}
            onChange={(e) => setFallbackTitle(e.target.value)}
            placeholder="Необязательно"
          />
        </FormRow>
        {error && <p className="text-red-500 text-xs">{error}</p>}
      </div>
    </BottomSheet>
  );
}

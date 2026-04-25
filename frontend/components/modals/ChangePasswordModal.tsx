"use client";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";

interface Props {
  onClose: () => void;
}

const errCls = "text-[11px] text-red-400 mt-1";

export function ChangePasswordModal({ onClose }: Props) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!oldPw) { setError("Введите текущий пароль"); return; }
    if (newPw.length < 6) { setError("Новый пароль — минимум 6 символов"); return; }
    if (newPw !== confirmPw) { setError("Пароли не совпадают"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/v2/profile/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_password: oldPw, new_password: newPw }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? "Ошибка при смене пароля");
        return;
      }
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div className="flex gap-2.5">
      <Button
        type="submit"
        variant="primary"
        size="md"
        loading={saving}
        disabled={success}
        fullWidth
      >
        {success ? "Пароль изменён" : "Сохранить"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={onClose}
        className="hidden md:inline-flex"
      >
        Отмена
      </Button>
    </div>
  );

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="Смена пароля"
      footer={footer}
      onSubmit={handleSubmit}
    >
      <Input
        label="Текущий пароль"
        type="password"
        value={oldPw}
        onChange={(e) => setOldPw(e.target.value)}
        placeholder="Введите текущий пароль"
        autoFocus
      />

      <Input
        label="Новый пароль"
        type="password"
        value={newPw}
        onChange={(e) => setNewPw(e.target.value)}
        placeholder="Минимум 6 символов"
      />

      <Input
        label="Подтвердите новый пароль"
        type="password"
        value={confirmPw}
        onChange={(e) => setConfirmPw(e.target.value)}
        placeholder="Повторите новый пароль"
      />

      {error && (
        <p className={errCls + " text-[13px] bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5"}>
          {error}
        </p>
      )}

      {success && (
        <p className="text-[13px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">
          Пароль успешно изменён
        </p>
      )}
    </BottomSheet>
  );
}

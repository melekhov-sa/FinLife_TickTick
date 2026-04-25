"use client";
import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/primitives/Button";

interface Props {
  onClose: () => void;
}

const inputCls =
  "w-full px-3 h-10 text-base md:text-sm rounded-xl bg-white/[0.05] border border-white/[0.08] text-white/85 placeholder-white/25 focus:outline-none focus:border-indigo-500/60 transition-colors";
const labelCls =
  "block text-[11px] md:text-xs font-medium text-white/50 uppercase tracking-wider mb-1.5";
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
      <div>
        <label className={labelCls}>Текущий пароль</label>
        <input
          type="password"
          value={oldPw}
          onChange={(e) => setOldPw(e.target.value)}
          placeholder="Введите текущий пароль"
          className={inputCls}
          autoFocus
        />
      </div>

      <div>
        <label className={labelCls}>Новый пароль</label>
        <input
          type="password"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          placeholder="Минимум 6 символов"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Подтвердите новый пароль</label>
        <input
          type="password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          placeholder="Повторите новый пароль"
          className={inputCls}
        />
      </div>

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

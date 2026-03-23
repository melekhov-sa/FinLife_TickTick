"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);

  // Supabase appends the recovery token as a URL hash fragment.
  // onAuthStateChange fires with event "PASSWORD_RECOVERY" once the token is consumed.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < 6) { setError("Пароль должен быть не менее 6 символов"); return; }
    if (password !== confirm) { setError("Пароли не совпадают"); return; }

    setLoading(true);
    setError("");
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError("Не удалось изменить пароль. Попробуйте запросить ссылку ещё раз.");
    } else {
      setDone(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <span className="text-indigo-400 text-sm font-bold">FL</span>
          </div>
          <span className="text-white/80 font-semibold text-lg">FinLife</span>
        </div>

        {done ? (
          <div className="text-center space-y-4">
            <p className="text-white/80 text-sm">Пароль успешно изменён.</p>
            <a href="/login" className="block text-indigo-400 text-sm hover:underline">
              Войти
            </a>
          </div>
        ) : !ready ? (
          <div className="text-center space-y-4">
            <p className="text-white/55 text-sm">Проверяем ссылку…</p>
            <p className="text-white/30 text-xs">
              Если страница не обновляется, попробуйте перейти по ссылке из письма ещё раз.
            </p>
            <a href="/login" className="block text-white/40 text-xs hover:text-white/60 transition-colors">
              Вернуться ко входу
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <h2 className="text-white/80 font-semibold text-base text-center mb-2">Новый пароль</h2>
            <div>
              <label className="block text-xs text-white/68 mb-1.5">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white/80 outline-none focus:border-indigo-500/50 focus:bg-white/[0.06] transition-colors placeholder:text-white/50"
                placeholder="Не менее 6 символов"
              />
            </div>
            <div>
              <label className="block text-xs text-white/68 mb-1.5">Повторите пароль</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white/80 outline-none focus:border-indigo-500/50 focus:bg-white/[0.06] transition-colors placeholder:text-white/50"
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-red-400/80 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium text-sm rounded-lg py-2.5 transition-colors mt-2"
            >
              {loading ? "Сохраняем…" : "Сохранить пароль"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError("Неверный email или пароль");
      setLoading(false);
    } else {
      window.location.href = "/";
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Введите email для сброса пароля");
      return;
    }
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError("Ошибка отправки письма. Проверьте email.");
    } else {
      setResetSent(true);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        // Самодостаточный брендовый фон — не зависит от темы приложения
        background:
          "radial-gradient(ellipse 70% 50% at 15% 0%, rgba(124,58,237,0.35) 0%, transparent 55%)," +
          "radial-gradient(ellipse 60% 45% at 90% 100%, rgba(219,39,119,0.28) 0%, transparent 55%)," +
          "#140E26",
      }}
    >
      <div className="w-full max-w-sm animate-rise">
        {/* Logo */}
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: "linear-gradient(135deg, #7C3AED 0%, #DB2777 100%)" }}
          >
            <span className="text-white text-sm font-bold tracking-tight">FL</span>
          </div>
          <span className="font-display text-white/90 font-semibold text-lg">FinLife</span>
        </div>

        {resetSent ? (
          <div className="text-center space-y-3">
            <p className="text-white/80 text-sm">Письмо со ссылкой для сброса пароля отправлено на {email}</p>
            <button
              onClick={() => setResetSent(false)}
              className="text-fuchsia-300 text-xs hover:underline"
            >
              Вернуться ко входу
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-white/68 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-white/[0.05] border border-white/[0.10] rounded-lg px-4 py-2.5 text-sm text-white/85 outline-none focus:border-fuchsia-400/60 focus:bg-white/[0.07] transition-colors placeholder:text-white/40"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs text-white/68 mb-1.5">Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-white/[0.05] border border-white/[0.10] rounded-lg px-4 py-2.5 text-sm text-white/85 outline-none focus:border-fuchsia-400/60 focus:bg-white/[0.07] transition-colors placeholder:text-white/40"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-red-400/80 text-xs">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full disabled:opacity-50 text-[#fff] font-semibold text-sm rounded-lg py-2.5 transition-all hover:brightness-110 active:scale-[0.98] motion-reduce:transform-none mt-2"
              style={{ background: "linear-gradient(135deg, #7C3AED 0%, #DB2777 100%)" }}
            >
              {loading ? "Вход…" : "Войти"}
            </button>

            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              className="w-full text-white/40 hover:text-white/60 text-xs transition-colors pt-1"
            >
              Забыли пароль?
            </button>

            <a
              href="/register"
              className="block w-full text-center text-white/40 hover:text-white/60 text-xs transition-colors"
            >
              Нет аккаунта? Зарегистрироваться
            </a>
          </form>
        )}
      </div>
    </div>
  );
}

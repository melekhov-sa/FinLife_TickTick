"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (password !== password2) {
      setError("Пароли не совпадают");
      return;
    }
    if (password.length < 8) {
      setError("Пароль должен быть не менее 8 символов");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      if (error.message === "User already registered") {
        setError("Пользователь с таким email уже существует");
      } else if (error.message === "Signups not allowed for this instance") {
        setError("Регистрация временно отключена. Обратитесь к администратору.");
      } else if (error.message.includes("sending confirmation email") || error.message.includes("email")) {
        setError("Не удалось отправить письмо подтверждения. Попробуйте позже или обратитесь к администратору.");
      } else {
        setError(`Ошибка регистрации: ${error.message}`);
      }
    } else {
      setDone(true);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          "radial-gradient(ellipse 70% 50% at 15% 0%, rgba(124,58,237,0.35) 0%, transparent 55%)," +
          "radial-gradient(ellipse 60% 45% at 90% 100%, rgba(219,39,119,0.28) 0%, transparent 55%)," +
          "#140E26",
      }}
    >
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-10">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: "linear-gradient(135deg, #7C3AED 0%, #DB2777 100%)" }}
          >
            <span className="text-white text-sm font-bold tracking-tight">FL</span>
          </div>
          <span className="text-white/80 font-semibold text-lg">FinLife</span>
        </div>

        {done ? (
          <div className="text-center space-y-3">
            <p className="text-white/80 text-sm">
              Письмо с подтверждением отправлено на <strong>{email}</strong>
            </p>
            <p className="text-white/40 text-xs">Перейдите по ссылке в письме чтобы активировать аккаунт</p>
            <a href="/login" className="block text-fuchsia-300 text-xs hover:underline mt-4">
              Вернуться ко входу
            </a>
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
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white/80 outline-none focus:border-fuchsia-400/60 focus:bg-white/[0.06] transition-colors placeholder:text-white/50"
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
                autoComplete="new-password"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white/80 outline-none focus:border-fuchsia-400/60 focus:bg-white/[0.06] transition-colors placeholder:text-white/50"
                placeholder="Минимум 8 символов"
              />
            </div>
            <div>
              <label className="block text-xs text-white/68 mb-1.5">Повторите пароль</label>
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white/80 outline-none focus:border-fuchsia-400/60 focus:bg-white/[0.06] transition-colors placeholder:text-white/50"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-red-400/80 text-xs">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full disabled:opacity-50 text-[#fff] font-semibold text-sm rounded-lg py-2.5 transition-all hover:brightness-110 active:scale-[0.98] motion-reduce:transform-none mt-2"
              style={{ background: "linear-gradient(135deg, #7C3AED 0%, #DB2777 100%)" }}
            >
              {loading ? "Регистрация…" : "Создать аккаунт"}
            </button>

            <a
              href="/login"
              className="block w-full text-center text-white/40 hover:text-white/60 text-xs transition-colors pt-1"
            >
              Уже есть аккаунт? Войти
            </a>
          </form>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/primitives/PageHeader";
import { api } from "@/lib/api";
import { Button } from "@/components/primitives/Button";
import { Smartphone, RefreshCw, Copy, Check, ChevronRight } from "lucide-react";

// ── API ───────────────────────────────────────────────────────────────────────

interface TokenData {
  token: string;
  enabled: boolean;
}

function useCalDAVToken() {
  return useQuery<TokenData>({
    queryKey: ["caldav-token"],
    queryFn: () => api.get<TokenData>("/api/v2/caldav-token"),
  });
}

// ── Step component ────────────────────────────────────────────────────────────

function Step({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5"
        style={{ background: "var(--app-accent)", color: "#fff" }}
      >
        {n}
      </span>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--t-secondary)" }}>
        {text}
      </p>
    </div>
  );
}

// ── CopyField ─────────────────────────────────────────────────────────────────

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: "var(--t-faint)" }}>
        {label}
      </p>
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-xl border"
        style={{ background: "var(--app-sidebar-bg)", borderColor: "var(--app-border)" }}
      >
        <span className="flex-1 text-[13px] font-mono truncate" style={{ color: "var(--t-primary)" }}>
          {value}
        </span>
        <button
          onClick={handleCopy}
          className="shrink-0 p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
        >
          {copied ? (
            <Check size={14} style={{ color: "#10b981" }} />
          ) : (
            <Copy size={14} style={{ color: "var(--t-faint)" }} />
          )}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CalDAVSettingsPage() {
  const { data, isLoading } = useCalDAVToken();
  const qc = useQueryClient();
  const [regenerating, setRegenerating] = useState(false);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await api.post("/api/v2/caldav-token/regenerate");
      qc.invalidateQueries({ queryKey: ["caldav-token"] });
    } finally {
      setRegenerating(false);
    }
  }

  const serverUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}${window.location.port !== "80" && window.location.port !== "443" ? ":" + window.location.port : ""}`
      : "";

  return (
    <>
      <PageHeader title="iPhone Reminders (CalDAV)" density="compact" />

      <main className="flex-1 p-3 md:p-6 w-full max-w-xl">
        {/* Header card */}
        <div
          className="rounded-2xl p-5 mb-5 flex items-start gap-4 border"
          style={{ background: "var(--app-card-bg, var(--app-sidebar-bg))", borderColor: "var(--app-border)" }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--app-accent)", opacity: 0.9 }}
          >
            <Smartphone size={20} color="#fff" />
          </div>
          <div>
            <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--t-primary)" }}>
              Синхронизация с Напоминаниями
            </p>
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--t-faint)" }}>
              Задачи из FinLife будут отображаться в приложении Напоминания на iPhone и синхронизироваться в обе стороны.
            </p>
          </div>
        </div>

        {/* Credentials */}
        {isLoading ? (
          <div className="h-24 rounded-2xl animate-pulse" style={{ background: "var(--app-border)" }} />
        ) : data ? (
          <div
            className="rounded-2xl p-5 mb-5 space-y-3 border"
            style={{ background: "var(--app-card-bg, var(--app-sidebar-bg))", borderColor: "var(--app-border)" }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--t-faint)" }}>
              Данные для подключения
            </p>
            <CopyField label="Сервер" value={`${serverUrl}/caldav/`} />
            <CopyField label="Пароль (CalDAV-токен)" value={data.token} />
            <div className="pt-1">
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<RefreshCw size={13} className={regenerating ? "animate-spin" : ""} />}
                onClick={handleRegenerate}
                disabled={regenerating}
              >
                Обновить токен
              </Button>
              <p className="text-[11px] mt-1.5" style={{ color: "var(--t-faint)" }}>
                После обновления токена потребуется перенастроить аккаунт на iPhone.
              </p>
            </div>
          </div>
        ) : null}

        {/* Setup guide */}
        <div
          className="rounded-2xl p-5 space-y-4 border"
          style={{ background: "var(--app-card-bg, var(--app-sidebar-bg))", borderColor: "var(--app-border)" }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
            Как подключить iPhone
          </p>

          <Step n={1} text="Откройте Настройки → Приложения → Календарь → Аккаунты" />
          <Step n={2} text="Нажмите «Добавить аккаунт» → «Другой» → «Аккаунт CalDAV»" />
          <Step
            n={3}
            text={`Введите: Сервер — скопируйте выше. Имя пользователя — ваш email. Пароль — скопируйте токен выше.`}
          />
          <Step n={4} text="Нажмите «Далее». iPhone проверит соединение и добавит аккаунт." />
          <Step
            n={5}
            text="Откройте «Напоминания» — появится список «Задачи FinLife». Новые задачи добавятся автоматически."
          />

          <div
            className="rounded-xl px-4 py-3 mt-2"
            style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)" }}
          >
            <p className="text-[12px]" style={{ color: "var(--t-secondary)" }}>
              <span className="font-semibold" style={{ color: "var(--t-primary)" }}>Совет: </span>
              Для локальной разработки на одном устройстве используйте{" "}
              <span className="font-mono text-[11px]">http://localhost:8000</span>. Для доступа с iPhone вам
              нужен публичный адрес сервера (ngrok, Tailscale или деплой).
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Sparkles, CheckCircle2, AlertTriangle, Info,
  Trash2, Wifi, Save, Eye, EyeOff,
} from "lucide-react";
import { clsx } from "clsx";
import { useTheme } from "next-themes";

interface OpenAIConfig {
  has_key: boolean;
  source: "db" | "env" | "none";
  masked: string | null;
}

interface TestResult {
  ok: boolean;
  error?: string;
  model_used?: string;
}

export default function AISettingsPage() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();

  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);

  const cardBorder = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const cardBg = isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)";
  const inputCls = clsx(
    "w-full px-3 py-2.5 rounded-lg text-[14px] border focus:outline-none focus:border-violet-500/50 font-mono",
    isDark
      ? "bg-white/[0.05] border-white/[0.08] placeholder:text-white/20"
      : "bg-black/[0.03] border-black/[0.08] placeholder:text-black/20",
  );

  const { data: config, isLoading: configLoading } = useQuery<OpenAIConfig>({
    queryKey: ["admin-openai-config"],
    queryFn: () => api.get("/api/v2/admin/openai-config"),
    enabled: !!me?.is_admin,
    staleTime: 30_000,
  });

  const saveMut = useMutation({
    mutationFn: (key: string) =>
      api.patch<OpenAIConfig>("/api/v2/admin/openai-config", { api_key: key }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-openai-config"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      setKeyInput("");
      setFlash({ msg: "Ключ сохранён", ok: true });
      setTimeout(() => setFlash(null), 3000);
    },
    onError: (e: any) => {
      setFlash({ msg: e?.message || "Ошибка сохранения", ok: false });
      setTimeout(() => setFlash(null), 4000);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () =>
      api.patch<OpenAIConfig>("/api/v2/admin/openai-config", { api_key: "" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-openai-config"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      setFlash({ msg: "Ключ из БД удалён (активен .env-фолбэк если есть)", ok: true });
      setTimeout(() => setFlash(null), 4000);
    },
    onError: (e: any) => {
      setFlash({ msg: e?.message || "Ошибка удаления", ok: false });
      setTimeout(() => setFlash(null), 4000);
    },
  });

  const testMut = useMutation({
    mutationFn: () => api.post<TestResult>("/api/v2/admin/openai-config/test"),
    onSuccess: (data) => setTestResult(data),
    onError: (e: any) => setTestResult({ ok: false, error: e?.message || "Ошибка запроса" }),
  });

  if (!meLoading && me && !me.is_admin) {
    router.replace("/settings");
    return null;
  }

  if (meLoading || !me) {
    return (
      <>
        <AppTopbar title="Настройки AI" />
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-lg animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl" style={{ background: cardBg }} />
            ))}
          </div>
        </main>
      </>
    );
  }

  if (!me.is_admin) return null;

  const statusText = () => {
    if (!config) return null;
    if (config.source === "none") return "Ключ OpenAI не настроен. AI-комментарии в дайджестах недоступны.";
    if (config.source === "env") return "Ключ прочитан из .env файла сервера. Можно переопределить через интерфейс.";
    return "Ключ настроен через интерфейс. " + config.masked;
  };

  const statusColor = () => {
    if (!config) return "var(--t-secondary)";
    if (config.source === "none") return "var(--t-secondary)";
    if (config.source === "db") return "#34d399";
    return "#60a5fa";
  };

  const statusBg = () => {
    if (!config) return "transparent";
    if (config.source === "none") return "rgba(245,158,11,0.1)";
    if (config.source === "db") return "rgba(52,211,153,0.1)";
    return "rgba(96,165,250,0.1)";
  };

  const StatusIcon = () => {
    if (!config) return null;
    if (config.source === "none") return <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />;
    if (config.source === "db") return <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />;
    return <Info size={15} className="text-blue-400 shrink-0 mt-0.5" />;
  };

  return (
    <>
      <AppTopbar title="Настройки AI" />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-lg space-y-5">

          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--t-faint)" }}
          >
            <ArrowLeft size={14} /> Настройки
          </Link>

          {flash && (
            <div
              className={clsx(
                "flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium",
                flash.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400",
              )}
            >
              {flash.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              {flash.msg}
            </div>
          )}

          <div
            className="rounded-xl border p-5 space-y-4"
            style={{ borderColor: cardBorder, background: cardBg }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-500/10">
                <Sparkles size={16} className="text-violet-400" />
              </div>
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--t-primary)" }}>
                OpenAI API ключ
              </h2>
            </div>

            {configLoading ? (
              <div className="h-10 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
            ) : config ? (
              <div
                className="flex items-start gap-3 px-4 py-3 rounded-lg text-[13px]"
                style={{ background: statusBg() }}
              >
                <StatusIcon />
                <span style={{ color: statusColor() }}>{statusText()}</span>
              </div>
            ) : null}
          </div>

          <div
            className="rounded-xl border p-5 space-y-4"
            style={{ borderColor: cardBorder, background: cardBg }}
          >
            <h3
              className="text-[13px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--t-faint)" }}
            >
              Установить новый ключ
            </h3>

            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk-proj-..."
                className={inputCls}
                style={{ color: "var(--t-primary)", paddingRight: "2.5rem" }}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-70 transition-opacity"
                tabIndex={-1}
              >
                {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => saveMut.mutate(keyInput)}
                disabled={!keyInput.trim() || saveMut.isPending}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)" }}
              >
                <Save size={14} />
                {saveMut.isPending ? "..." : "Сохранить"}
              </button>

              <button
                onClick={() => { setTestResult(null); testMut.mutate(); }}
                disabled={testMut.isPending || !config?.has_key}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold border transition-all hover:bg-white/[0.04] disabled:opacity-40"
                style={{ borderColor: cardBorder, color: "var(--t-secondary)" }}
              >
                <Wifi size={14} />
                {testMut.isPending ? "..." : "Проверить соединение"}
              </button>

              {config?.source === "db" && (
                <button
                  onClick={() => {
                    if (confirm("Удалить ключ из БД? Будет использован .env-фолбэк если есть.")) {
                      setTestResult(null);
                      deleteMut.mutate();
                    }
                  }}
                  disabled={deleteMut.isPending}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-semibold border transition-all hover:bg-red-500/10 disabled:opacity-40"
                  style={{ borderColor: "rgba(239,68,68,0.2)", color: "#ef4444" }}
                >
                  <Trash2 size={14} />
                  {deleteMut.isPending ? "..." : "Удалить"}
                </button>
              )}
            </div>

            {testResult && (
              <div
                className={clsx(
                  "flex items-start gap-2 px-4 py-3 rounded-lg text-[13px]",
                  testResult.ok ? "bg-emerald-500/10" : "bg-red-500/10",
                )}
              >
                {testResult.ok ? (
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                )}
                <span style={{ color: testResult.ok ? "#34d399" : "#f87171" }}>
                  {testResult.ok
                    ? "Соединение успешно. Модель: " + testResult.model_used
                    : "Ошибка: " + testResult.error}
                </span>
              </div>
            )}
          </div>

          <p className="text-[12px] leading-relaxed" style={{ color: "var(--t-faint)" }}>
            Ключ хранится в БД в открытом виде. Используется для генерации AI-комментариев
            в дайджестах. Получить ключ можно на{" "}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:opacity-80"
            >
              platform.openai.com/api-keys
            </a>
            .
          </p>

        </div>
      </main>
    </>
  );
}

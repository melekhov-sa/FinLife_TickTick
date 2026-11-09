"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/primitives/PageHeader";
import { api } from "@/lib/api";
import { Button } from "@/components/primitives/Button";
import { LayoutGrid, RefreshCw, Copy, Check } from "lucide-react";

const SCRIPT_URL =
  "https://raw.githubusercontent.com/melekhov-sa/FinLife_TickTick/main/scripts/finlife-widget.js";

interface TokenData {
  token: string;
  enabled: boolean;
}

function useWidgetToken() {
  return useQuery<TokenData>({
    queryKey: ["widget-token"],
    queryFn: () => api.get<TokenData>("/api/v2/widget-token"),
  });
}

/** Загрузчик с уже вшитым токеном: скопировал → вставил в Scriptable → запустил. */
function buildLoader(token: string): string {
  return [
    `const u=${JSON.stringify(SCRIPT_URL)}`,
    `let c=await new Request(u).loadString()`,
    `c=c.replace("const MOCK = true;","const MOCK = false;")`,
    `c=c.replace('const TOKEN = "";','const TOKEN = ${JSON.stringify(token)};')`,
    `let f=FileManager.local()`,
    `try{const i=FileManager.iCloud();i.documentsDirectory();f=i}catch(e){}`,
    `f.writeString(f.joinPath(f.documentsDirectory(),"FinLife.js"),c)`,
    `const a=new Alert();a.title="Готово";a.addAction("OK");await a.present()`,
  ].join("\n");
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5"
        style={{ background: "var(--app-accent)", color: "#fff" }}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium mb-1" style={{ color: "var(--t-primary)" }}>
          {title}
        </p>
        {children}
      </div>
    </div>
  );
}

function CopyBox({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div
      className="flex items-start gap-2 px-3 py-2 rounded-xl border"
      style={{ background: "var(--app-sidebar-bg)", borderColor: "var(--app-border)" }}
    >
      <pre
        className={`flex-1 min-w-0 text-[11px] overflow-x-auto whitespace-pre ${mono ? "font-mono" : ""}`}
        style={{ color: "var(--t-primary)" }}
      >
        {value}
      </pre>
      <button
        onClick={handleCopy}
        className="shrink-0 p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
        title="Скопировать"
      >
        {copied ? (
          <Check size={14} style={{ color: "#10b981" }} />
        ) : (
          <Copy size={14} style={{ color: "var(--t-faint)" }} />
        )}
      </button>
    </div>
  );
}

export default function WidgetSettingsPage() {
  const { data, isLoading } = useWidgetToken();
  const qc = useQueryClient();
  const [regenerating, setRegenerating] = useState(false);

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      await api.post("/api/v2/widget-token/regenerate");
      qc.invalidateQueries({ queryKey: ["widget-token"] });
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <>
      <PageHeader title="Виджеты на iPhone" density="compact" />

      <main className="flex-1 p-3 md:p-6 w-full max-w-xl">
        <div
          className="rounded-2xl p-5 mb-5 flex items-start gap-4 border"
          style={{
            background: "var(--app-card-bg, var(--app-sidebar-bg))",
            borderColor: "var(--app-border)",
          }}
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--app-accent)", opacity: 0.9 }}
          >
            <LayoutGrid size={20} color="#fff" />
          </div>
          <div>
            <p className="text-[14px] font-semibold mb-1" style={{ color: "var(--t-primary)" }}>
              Кэшбеки и задачи на домашнем экране
            </p>
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--t-faint)" }}>
              Через бесплатное приложение Scriptable. Один скрипт обслуживает все виджеты —
              какой именно показывать, задаётся в поле Parameter при настройке виджета.
            </p>
          </div>
        </div>

        {isLoading ? (
          <p className="text-[13px]" style={{ color: "var(--t-faint)" }}>
            Загрузка…
          </p>
        ) : !data ? (
          <p className="text-[13px]" style={{ color: "var(--t-faint)" }}>
            Не удалось получить токен. Обнови страницу.
          </p>
        ) : (
          <>
            <Step n={1} title="Установи Scriptable из App Store">
              <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>
                Приложение бесплатное, автор Simon Støvring.
              </p>
            </Step>

            <Step n={2} title="Создай новый скрипт и вставь в него этот загрузчик">
              <p className="text-[12px] mb-2" style={{ color: "var(--t-faint)" }}>
                В нём уже вшит твой токен. Нажми ▶ — он скачает основной скрипт и сохранит
                его как «FinLife». Его же запускай потом, чтобы обновить виджет до свежей версии.
              </p>
              <CopyBox value={buildLoader(data.token)} />
            </Step>

            <Step n={3} title="Добавь виджет на домашний экран">
              <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>
                Долгий тап по экрану → «+» → Scriptable → размер Medium. Затем тап по
                добавленному виджету: Script = FinLife, а в поле Parameter впиши нужный вид.
              </p>
              <div className="mt-2 space-y-1">
                <p className="text-[12px]" style={{ color: "var(--t-muted)" }}>
                  <code className="font-mono" style={{ color: "var(--app-accent)" }}>cashback</code>
                  {" — лучшие кэшбеки по категориям за текущий месяц"}
                </p>
                <p className="text-[12px]" style={{ color: "var(--t-muted)" }}>
                  <code className="font-mono" style={{ color: "var(--app-accent)" }}>today</code>
                  {" — задачи на сегодня, без просроченных"}
                </p>
                <p className="text-[12px]" style={{ color: "var(--t-muted)" }}>
                  <code className="font-mono" style={{ color: "var(--app-accent)" }}>payments</code>
                  {" — ближайшие плановые платежи с суммами"}
                </p>
              </div>
            </Step>

            <div
              className="mt-6 pt-5 border-t"
              style={{ borderColor: "var(--app-border)" }}
            >
              <p className="text-[12px] mb-2" style={{ color: "var(--t-faint)" }}>
                Ссылка виджета содержит токен: у кого она есть, тот видит эти данные (и только
                их, доступ только на чтение). Если ссылка куда-то утекла — перевыпусти токен,
                старая перестанет работать. После этого загрузчик нужно будет вставить заново.
              </p>
              <Button
                variant="secondary"
                onClick={handleRegenerate}
                loading={regenerating}
                leftIcon={<RefreshCw size={14} />}
              >
                {regenerating ? "Перевыпускаю…" : "Перевыпустить токен"}
              </Button>
            </div>
          </>
        )}
      </main>
    </>
  );
}

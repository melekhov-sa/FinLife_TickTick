import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ── Нативный fetch для Capacitor/WKWebView ──────────────────────────────────
// В обёртке AltStore (Capacitor 7 загружает живой сайт в WKWebView) прямой fetch
// к ЧУЖОМУ домену supabase.co падает с «Load failed»: встроенный вебвью, в
// отличие от Safari, подчиняется ATS/кросс-origin-ограничениям приложения.
// Поэтому внутри приложения гоним запросы Supabase (вход + рефреш токена) через
// нативный HTTP-мост Capacitor (CapacitorHttp) — он не подчиняется этим
// ограничениям. Мост инъектируется как window.Capacitor, отдельная npm-зависимость
// не нужна. В обычном браузере/PWA моста нет → используется штатный fetch.

type CapacitorHttpBridge = {
  request: (opts: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    data?: unknown;
    responseType?: string;
    connectTimeout?: number;
    readTimeout?: number;
  }) => Promise<{ status: number; headers?: Record<string, string>; data?: unknown }>;
};

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
  Plugins?: { CapacitorHttp?: CapacitorHttpBridge };
};

function getNativeHttp(): CapacitorHttpBridge | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap.Plugins?.CapacitorHttp ?? null;
}

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

async function nativeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const http = getNativeHttp();
  if (!http) return fetch(input, init);

  const req = new Request(input, init);
  const body =
    req.method !== "GET" && req.method !== "HEAD"
      ? await req.clone().text()
      : undefined;

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key] = value;
  });

  try {
    const res = await http.request({
      url: req.url,
      method: req.method,
      headers,
      data: body || undefined,
      responseType: "text",
      connectTimeout: 20000,
      readTimeout: 20000,
    });
    const status = res.status ?? 0;
    if (status < 200 || status > 599) return fetch(input, init);
    const payload =
      typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
    return new Response(NULL_BODY_STATUS.has(status) ? null : payload, {
      status,
      headers: (res.headers ?? {}) as HeadersInit,
    });
  } catch {
    // Мост недоступен/ошибся — не делаем хуже, чем было: штатный fetch.
    return fetch(input, init);
  }
}

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: nativeFetch },
});

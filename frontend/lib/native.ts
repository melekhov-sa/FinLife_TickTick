"use client";

/**
 * Мост к Capacitor-плагинам нативной iOS-оболочки.
 *
 * В PWA/браузере `window.Capacitor` отсутствует — все функции тихо
 * превращаются в no-op, поэтому вызывать их можно безусловно.
 * Плагины вкомпилированы в ipa (mobile/package.json), а логика вызовов
 * живёт здесь и деплоится обычным путём без пересборки приложения.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type CapGlobal = {
  isNativePlatform?: () => boolean;
  Plugins?: Record<string, any>;
};

function cap(): CapGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { Capacitor?: CapGlobal }).Capacitor ?? null;
}

export function isNative(): boolean {
  return !!cap()?.isNativePlatform?.();
}

function plugin(name: string): any | null {
  const c = cap();
  if (!c?.isNativePlatform?.()) return null;
  return c.Plugins?.[name] ?? null;
}

// ── Хаптика ──────────────────────────────────────────────────────────────────

/** Виброотклик «успех» — выполнение задачи/привычки (с fallback-цепочкой). */
export async function hapticSuccess(): Promise<void> {
  const h = plugin("Haptics");
  if (!h) return;
  try {
    await h.notification({ type: "SUCCESS" });
    return;
  } catch { /* пробуем дальше */ }
  try {
    await h.impact({ style: "MEDIUM" });
    return;
  } catch { /* пробуем дальше */ }
  try {
    await h.vibrate();
  } catch { /* no-op */ }
}

/** Лёгкий тактильный тик — нажатия, свайпы. */
export async function hapticTick(): Promise<void> {
  try {
    await plugin("Haptics")?.impact({ style: "LIGHT" });
  } catch { /* no-op */ }
}

// ── Статус-бар ───────────────────────────────────────────────────────────────

/**
 * lightText=true → светлые часы (для градиентных/тёмных шапок).
 * В Capacitor Style.Dark означает «светлый текст на тёмном фоне».
 */
export async function setStatusBarLightText(lightText: boolean): Promise<void> {
  const sb = plugin("StatusBar");
  if (!sb) return;
  try {
    await sb.setOverlaysWebView({ overlay: true });
    await sb.setStyle({ style: lightText ? "DARK" : "LIGHT" });
  } catch { /* no-op */ }
}

// ── Локальные уведомления (напоминания без APNs) ─────────────────────────────

export interface NativeReminder {
  key: string;      // стабильный ключ (kind-id-time) для генерации int id
  title: string;
  body?: string;
  at: Date;
  /** Если задано — уведомление получает кнопку «✅ Выполнить». */
  completeKind?: "task" | "task_occ" | "habit";
  completeId?: number;
}

const ACTION_TYPE_COMPLETABLE = "FINLIFE_COMPLETABLE";

// ── Биометрия (Face ID / Touch ID) ──────────────────────────────────────────

export const BIOLOCK_KEY = "finlife_biolock";

export function bioLockEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(BIOLOCK_KEY) === "1";
}

export function setBioLockEnabled(on: boolean): void {
  localStorage.setItem(BIOLOCK_KEY, on ? "1" : "0");
}

export async function biometryAvailable(): Promise<boolean> {
  const nb = plugin("NativeBiometric");
  if (!nb) return false;
  try {
    const res = await nb.isAvailable();
    return !!res?.isAvailable;
  } catch {
    return false;
  }
}

/** true — юзер прошёл Face ID/Touch ID; false — отказ/ошибка. */
export async function biometricVerify(reason: string): Promise<boolean> {
  const nb = plugin("NativeBiometric");
  if (!nb) return true; // не нативная среда — не блокируем
  try {
    await nb.verifyIdentity({
      reason,
      title: "FinLife",
      subtitle: "",
      description: "",
    });
    return true;
  } catch {
    return false;
  }
}

// ── Сеть ─────────────────────────────────────────────────────────────────────

/**
 * Точный статус сети из нативного слоя (navigator.onLine в WKWebView врёт).
 * Возвращает cleanup; колбэк вызывается сразу с текущим статусом.
 */
export async function onNetworkChange(
  cb: (connected: boolean) => void
): Promise<() => void> {
  const net = plugin("Network");
  if (!net) return () => undefined;
  try {
    const status = await net.getStatus();
    cb(!!status?.connected);
    const handle = await net.addListener(
      "networkStatusChange",
      (s: { connected?: boolean }) => cb(!!s?.connected)
    );
    return () => { try { handle?.remove?.(); } catch { /* no-op */ } };
  } catch {
    return () => undefined;
  }
}

// ── Буфер обмена ─────────────────────────────────────────────────────────────

/** Текст из буфера (или пустая строка). iOS покажет системный баннер вставки. */
export async function readClipboardText(): Promise<string> {
  const c = plugin("Clipboard");
  if (!c) return "";
  try {
    const res = await c.read();
    return typeof res?.value === "string" && (res?.type ?? "").includes("text")
      ? res.value
      : (typeof res?.value === "string" ? res.value : "");
  } catch {
    return "";
  }
}

/** Похоже ли на банковскую SMS (для предложения ИИ-разбора). */
export function looksLikeBankSms(text: string): boolean {
  if (!text || text.length < 15 || text.length > 600) return false;
  const hasAmount = /\d[\d\s]*[.,]?\d*\s*(р|руб|₽|RUB)\b/i.test(text);
  const hasKeyword = /(покупк|оплат|списан|перевод|зачислен|поступлен|пополнен|счёт|счет|карт[аы]|баланс)/i.test(text);
  return hasAmount && hasKeyword;
}

// ── Бейдж на иконке приложения ───────────────────────────────────────────────

/** Число на иконке (0 — убрать). Требует разрешения на уведомления. */
export async function setAppBadge(count: number): Promise<void> {
  const b = plugin("Badge");
  if (!b) return;
  try {
    if (count > 0) await b.set({ count });
    else await b.clear();
  } catch { /* no-op */ }
}

// ── Quick Actions (меню долгого тапа по иконке) ──────────────────────────────

export interface AppShortcut {
  id: string;
  title: string;
}

export async function setAppShortcuts(items: AppShortcut[]): Promise<void> {
  const sc = plugin("AppShortcuts");
  if (!sc) return;
  try {
    await sc.set({ shortcuts: items.map((i) => ({ id: i.id, title: i.title })) });
  } catch { /* no-op */ }
}

export async function onAppShortcut(cb: (id: string) => void): Promise<() => void> {
  const sc = plugin("AppShortcuts");
  if (!sc) return () => undefined;
  try {
    const handle = await sc.addListener("click", (ev: { shortcutId?: string }) => {
      if (ev?.shortcutId) cb(ev.shortcutId);
    });
    return () => { try { handle?.remove?.(); } catch { /* no-op */ } };
  } catch {
    return () => undefined;
  }
}

function hash32(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

/**
 * Полная пересинхронизация запланированных локальных уведомлений:
 * отменяем все прежние и планируем свежий список (будущие, максимум 60).
 */
export async function syncLocalReminders(items: NativeReminder[]): Promise<void> {
  const ln = plugin("LocalNotifications");
  if (!ln) return;
  try {
    const perm = await ln.requestPermissions();
    if (perm?.display !== "granted") return;

    const pending = await ln.getPending();
    if (pending?.notifications?.length) {
      await ln.cancel({
        notifications: pending.notifications.map((n: any) => ({ id: n.id })),
      });
    }

    const now = Date.now();
    const future = items
      .filter((i) => i.at.getTime() > now + 30_000)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, 60);
    if (!future.length) return;

    // Категория с кнопкой «Выполнить» (идемпотентно)
    try {
      await ln.registerActionTypes({
        types: [{
          id: ACTION_TYPE_COMPLETABLE,
          actions: [{ id: "complete", title: "✅ Выполнить" }],
        }],
      });
    } catch { /* необязательно */ }

    await ln.schedule({
      notifications: future.map((i) => ({
        id: hash32(i.key),
        title: i.title,
        body: i.body ?? "",
        schedule: { at: i.at },
        ...(i.completeKind && i.completeId
          ? {
              actionTypeId: ACTION_TYPE_COMPLETABLE,
              extra: { kind: i.completeKind, id: i.completeId },
            }
          : {}),
      })),
    });
  } catch { /* no-op */ }
}

/** Диагностика уведомлений: статус разрешения и число запланированных. */
export async function notificationDiagnostics(): Promise<{
  permission: string;
  pending: number;
}> {
  const ln = plugin("LocalNotifications");
  if (!ln) return { permission: "no-plugin", pending: 0 };
  try {
    const perm = await ln.checkPermissions();
    const pending = await ln.getPending();
    return {
      permission: String(perm?.display ?? "unknown"),
      pending: pending?.notifications?.length ?? 0,
    };
  } catch (e) {
    return { permission: `error: ${String(e)}`, pending: 0 };
  }
}

/** Тестовое уведомление через 10 секунд (сверни приложение и жди). */
export async function testLocalNotification(): Promise<string> {
  const ln = plugin("LocalNotifications");
  if (!ln) return "плагин недоступен (не нативная среда?)";
  try {
    const perm = await ln.requestPermissions();
    if (perm?.display !== "granted") return `нет разрешения: ${perm?.display}`;
    await ln.schedule({
      notifications: [{
        id: 424242,
        title: "FinLife: тест уведомлений",
        body: "Если ты это видишь — локальные уведомления работают ✅",
        schedule: { at: new Date(Date.now() + 10_000) },
      }],
    });
    return "запланировано через 10 сек — сверни приложение";
  } catch (e) {
    return `ошибка: ${String(e)}`;
  }
}

export interface NotificationActionInfo {
  actionId: string; // "complete" | "tap"
  kind?: "task" | "task_occ" | "habit";
  id?: number;
}

/** Слушатель нажатий по уведомлению (тап по телу — actionId "tap"). */
export async function onNotificationAction(
  cb: (info: NotificationActionInfo) => void
): Promise<() => void> {
  const ln = plugin("LocalNotifications");
  if (!ln) return () => undefined;
  try {
    const handle = await ln.addListener(
      "localNotificationActionPerformed",
      (ev: { actionId?: string; notification?: { extra?: { kind?: NotificationActionInfo["kind"]; id?: number } } }) => {
        cb({
          actionId: ev?.actionId ?? "tap",
          kind: ev?.notification?.extra?.kind,
          id: ev?.notification?.extra?.id,
        });
      }
    );
    return () => { try { handle?.remove?.(); } catch { /* no-op */ } };
  } catch {
    return () => undefined;
  }
}

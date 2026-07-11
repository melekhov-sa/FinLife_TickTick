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

/** Виброотклик «успех» — выполнение задачи/привычки. */
export async function hapticSuccess(): Promise<void> {
  try {
    await plugin("Haptics")?.notification({ type: "SUCCESS" });
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
}

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

    await ln.schedule({
      notifications: future.map((i) => ({
        id: hash32(i.key),
        title: i.title,
        body: i.body ?? "",
        schedule: { at: i.at },
      })),
    });
  } catch { /* no-op */ }
}

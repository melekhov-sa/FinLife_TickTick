/**
 * Push notification helpers for the Next.js frontend.
 * Registers the service worker and manages push subscriptions via v2 API.
 */
import { api } from "@/lib/api";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const regs = await navigator.serviceWorker.getRegistrations();
  if (regs.length === 0) {
    await navigator.serviceWorker.register("/service-worker.js");
  }
  return navigator.serviceWorker.ready;
}

export async function isPushSupported(): Promise<boolean> {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getPushState(): Promise<"subscribed" | "prompt" | "denied" | "unsupported"> {
  if (!(await isPushSupported())) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await getRegistration();
    if (!reg) return "unsupported";
    const sub = await reg.pushManager.getSubscription();
    return sub ? "subscribed" : "prompt";
  } catch {
    return "prompt";
  }
}

export async function subscribePush(): Promise<boolean> {
  const reg = await getRegistration();
  if (!reg) return false;

  // Get VAPID key from backend
  const { key } = await api.get<{ key: string }>("/api/v2/push/vapid-key");
  if (!key) return false;

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });

  const json = sub.toJSON();
  await api.post("/api/v2/push/subscribe", {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
  });

  return true;
}

export async function unsubscribePush(): Promise<void> {
  const reg = await getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  const json = sub.toJSON();
  await sub.unsubscribe();

  await api.post("/api/v2/push/unsubscribe", {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
  }).catch(() => {});
}

export async function testPush(): Promise<number> {
  const res = await api.post<{ ok: boolean; sent: number }>("/api/v2/push/test");
  return res.sent;
}

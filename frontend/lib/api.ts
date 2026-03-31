/**
 * API client for FinLife backend (v2 JSON API).
 *
 * Auth: Supabase JWT sent as Authorization: Bearer <token> header.
 * Refresh mutex prevents thundering herd when parallel requests hit expired token.
 * IMPORTANT: Never calls signOut() — only AuthGuard handles logout.
 */
import { supabase } from "@/lib/supabase";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

// ── Refresh mutex ─────────────────────────────────────────────────────────
let refreshPromise: Promise<string | null> | null = null;

async function refreshOnce(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session?.access_token) return null;
      return data.session.access_token;
    } catch {
      return null;
    } finally {
      setTimeout(() => { refreshPromise = null; }, 2000);
    }
  })();

  return refreshPromise;
}

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;
  return refreshOnce();
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();

  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  });

  if (res.status === 401) {
    // Token might have expired between getToken() and the request arriving.
    // Try ONE refresh + retry.
    const newToken = await refreshOnce();
    if (newToken) {
      const retryRes = await fetch(`${BASE}${path}`, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${newToken}`,
          ...init?.headers,
        },
        ...init,
      });
      if (retryRes.ok) {
        if (retryRes.status === 204 || retryRes.headers.get("content-length") === "0") {
          return undefined as T;
        }
        return retryRes.json() as Promise<T>;
      }
      // Retry also failed — throw, do NOT signOut
      const text = await retryRes.text().catch(() => "");
      throw new Error(`API error ${retryRes.status}: ${text}`);
    }
    // No token at all — throw auth error but do NOT signOut
    // AuthGuard will detect session loss via onAuthStateChange
    throw new Error("Unauthenticated");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

export const api = {
  get:    <T>(path: string) => apiFetch<T>(path),
  post:   <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST",   body: body ? JSON.stringify(body) : undefined }),
  patch:  <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH",  body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) =>
    apiFetch<T>(path, { method: "DELETE" }),
};

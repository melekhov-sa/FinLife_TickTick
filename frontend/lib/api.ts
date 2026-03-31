/**
 * API client for FinLife backend (v2 JSON API).
 *
 * In development, Next.js proxies /api/v2/* → http://localhost:8000/api/v2/*
 * Auth: Supabase JWT sent as Authorization: Bearer <token> header.
 *
 * Key feature: refresh token mutex prevents thundering herd problem
 * when many parallel requests detect an expired token simultaneously.
 */
import { supabase } from "@/lib/supabase";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

// ── Refresh mutex: only one refresh at a time ─────────────────────────────
// When 13+ parallel requests all see an expired token, only the first one
// calls refreshSession(). The rest wait for the same promise.
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
      // Release mutex after a short delay so back-to-back calls still share
      setTimeout(() => { refreshPromise = null; }, 1000);
    }
  })();

  return refreshPromise;
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }

  // Token missing — try refresh (shared across all concurrent callers)
  const token = await refreshOnce();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeader = await getAuthHeader();

  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...init?.headers,
    },
    ...init,
  });

  if (res.status === 401) {
    // Try refreshing once (mutex ensures only one actual refresh call)
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
    }
    // Refresh failed — sign out
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
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

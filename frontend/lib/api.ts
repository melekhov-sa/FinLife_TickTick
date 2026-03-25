/**
 * API client for FinLife backend (v2 JSON API).
 *
 * In development, Next.js proxies /api/v2/* → http://localhost:8000/api/v2/*
 * Auth: Supabase JWT sent as Authorization: Bearer <token> header.
 */
import { supabase } from "@/lib/supabase";

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

async function getAuthHeader(): Promise<Record<string, string>> {
  let { data: { session } } = await supabase.auth.getSession();

  // If the access token is expired or missing, try refreshing once
  if (!session?.access_token) {
    const { data } = await supabase.auth.refreshSession();
    session = data.session;
  }

  if (!session?.access_token) return {};
  return { Authorization: `Bearer ${session.access_token}` };
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
    // Try refreshing the token once before giving up
    const { data } = await supabase.auth.refreshSession();
    if (data.session?.access_token) {
      // Retry the request with the new token
      const retryRes = await fetch(`${BASE}${path}`, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
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
    // Refresh failed — only now sign out
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

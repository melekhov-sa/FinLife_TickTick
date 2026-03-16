/**
 * API client for FinLife backend (v2 JSON API).
 *
 * In development, Next.js proxies /api/v2/* → http://localhost:8000/api/v2/*
 * so session cookies work on the same origin (no CORS complexity).
 * See next.config.ts rewrites.
 */

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (res.status === 401) {
    // Redirect to login if not authenticated
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new Error("Unauthenticated");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
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

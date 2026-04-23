"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

function clearSupabaseCookies() {
  // Hard reset: delete any cookie that looks like a supabase session.
  // Covers edge cases where signOut() does not remove them (SSR cookie edge cases).
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const name = cookie.split("=")[0]?.trim();
    if (!name) continue;
    if (name.startsWith("sb-") || name.includes("supabase")) {
      // Try common path/domain combos — at least one will match the real cookie.
      document.cookie = `${name}=; Max-Age=0; path=/`;
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${window.location.hostname}`;
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.${window.location.hostname}`;
    }
  }
  // Also purge any localStorage leftovers from the pre-SSR client.
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("sb-") || key.includes("supabase"))) {
        localStorage.removeItem(key);
      }
    }
  } catch { /* ignore */ }
}

export default function LogoutPage() {
  useEffect(() => {
    (async () => {
      // scope: "local" drops the session on this device without a network
      // round-trip to Supabase — fast and can't hang.
      // Race with a short timeout as a final safety net.
      try {
        await Promise.race([
          supabase.auth.signOut({ scope: "local" }),
          new Promise((resolve) => setTimeout(resolve, 1500)),
        ]);
      } catch { /* proceed with hard reset regardless */ }
      clearSupabaseCookies();
      window.location.replace("/login");
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
      <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}

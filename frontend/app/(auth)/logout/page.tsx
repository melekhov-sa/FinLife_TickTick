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
      try {
        await supabase.auth.signOut();
      } catch { /* proceed with hard reset regardless */ }
      clearSupabaseCookies();
      window.location.href = "/login";
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
      <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}

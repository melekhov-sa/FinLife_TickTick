"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) window.location.href = "/login";
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      // TOKEN_REFRESHED fires automatically when Supabase refreshes the JWT
      if (event === "TOKEN_REFRESHED") {
        setSession(s);
        return;
      }
      setSession(s);
      if (!s) window.location.href = "/login";
    });

    // Proactively refresh the session every 45 minutes
    // (access tokens expire after 1 hour, refresh before that)
    const interval = setInterval(async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        window.location.href = "/login";
      }
    }, 45 * 60 * 1000);

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
        <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return null;

  return <>{children}</>;
}

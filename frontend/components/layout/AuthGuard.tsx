"use client";

import { useEffect, useState, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const refreshFailures = useRef(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) window.location.href = "/login";
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "TOKEN_REFRESHED") {
        refreshFailures.current = 0;
        setSession(s);
        return;
      }
      if (event === "SIGNED_OUT") {
        window.location.href = "/login";
        return;
      }
      setSession(s);
    });

    // Proactively refresh the session every 50 minutes
    // (access tokens expire after 1 hour)
    const interval = setInterval(async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (error || !data.session) {
        refreshFailures.current += 1;
        // Only redirect after 3 consecutive failures (allows for temporary network issues)
        if (refreshFailures.current >= 3) {
          window.location.href = "/login";
        }
      } else {
        refreshFailures.current = 0;
      }
    }, 50 * 60 * 1000);

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

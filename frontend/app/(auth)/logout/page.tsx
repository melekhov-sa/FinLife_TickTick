"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function LogoutPage() {
  useEffect(() => {
    (async () => {
      await supabase.auth.signOut();
      window.location.href = "/login";
    })();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
      <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );
}

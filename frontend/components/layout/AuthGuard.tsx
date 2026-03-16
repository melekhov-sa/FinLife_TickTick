"use client";

import { useEffect } from "react";
import { useMe } from "@/hooks/useMe";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isError, isPending } = useMe();

  useEffect(() => {
    if (isError) {
      window.location.href = "/login";
    }
  }, [isError]);

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--app-bg)" }}>
        <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) return null;

  return <>{children}</>;
}

"use client";

import { useEffect } from "react";
import { useMe } from "@/hooks/useMe";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isError, isLoading } = useMe();

  useEffect(() => {
    if (isError) {
      window.location.href = "/login";
    }
  }, [isError]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (isError) return null;

  return <>{children}</>;
}

"use client";
import { useEffect } from "react";
import { AppTopbar } from "@/components/layout/AppTopbar";
export default function Page() {
  useEffect(() => { window.location.href = "/legacy/strategy"; }, []);
  return (
    <>
      <AppTopbar title="Strategy" />
      <main className="flex-1 flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </main>
    </>
  );
}

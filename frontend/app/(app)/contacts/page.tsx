"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { api } from "@/lib/api";
import { useMe } from "@/hooks/useMe";
import { UserPlus, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { useRouter } from "next/navigation";

interface Contact {
  id: number;
  name: string;
}

export default function ContactsPage() {
  const { data: me } = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);

  // Redirect non-admin
  if (me && !me.is_admin) {
    router.replace("/settings");
    return null;
  }

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["contacts"],
    queryFn: () => api.get("/api/v2/contacts"),
  });

  const createMut = useMutation({
    mutationFn: (name: string) => api.post("/api/v2/contacts", { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contacts"] }); setNewName(""); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/api/v2/contacts/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contacts"] }); setConfirmId(null); },
  });

  return (
    <>
      <AppTopbar title="Участники" />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-md space-y-4">
          <p className="text-[12px]" style={{ color: "var(--t-faint)" }}>
            Управление участниками подписок. Добавьте людей, чтобы потом назначать их в подписки.
          </p>

          {/* Add form */}
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) createMut.mutate(newName.trim()); }}
              placeholder="Имя участника"
              className="flex-1 px-3 py-2.5 rounded-lg text-[14px] bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 placeholder:text-white/20"
              style={{ color: "var(--t-primary)" }}
            />
            <button
              onClick={() => newName.trim() && createMut.mutate(newName.trim())}
              disabled={!newName.trim() || createMut.isPending}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)" }}
            >
              <UserPlus size={14} /> Добавить
            </button>
          </div>

          {/* List */}
          <div className="space-y-1">
            {contacts.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 py-3 px-4 rounded-xl border transition-all"
                style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
              >
                <div className="w-8 h-8 rounded-full bg-indigo-500/15 flex items-center justify-center text-[11px] font-bold text-indigo-300/80 shrink-0">
                  {c.name.slice(0, 2).toUpperCase()}
                </div>
                <span className="flex-1 text-[14px] font-medium" style={{ color: "var(--t-primary)" }}>
                  {c.name}
                </span>
                <button
                  onClick={() => {
                    if (confirmId === c.id) deleteMut.mutate(c.id);
                    else setConfirmId(c.id);
                  }}
                  onBlur={() => setTimeout(() => setConfirmId(null), 200)}
                  className={clsx(
                    "w-7 h-7 rounded-lg flex items-center justify-center border transition-all",
                    confirmId === c.id
                      ? "bg-red-600 border-red-500 text-white"
                      : "border-transparent hover:bg-red-500/10 hover:border-red-500/20"
                  )}
                  style={{ color: confirmId === c.id ? undefined : "var(--t-faint)" }}
                  title={confirmId === c.id ? "Удалить?" : "Удалить участника"}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {contacts.length === 0 && (
              <p className="text-[13px] py-6 text-center" style={{ color: "var(--t-faint)" }}>
                Нет участников. Добавьте первого.
              </p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

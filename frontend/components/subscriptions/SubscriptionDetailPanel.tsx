"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Trash2, Calendar, DollarSign, UserMinus, UserPlus } from "lucide-react";
import { AddMemberModal } from "@/components/modals/AddMemberModal";
import { clsx } from "clsx";
import type { SubscriptionItem, SubscriptionMember } from "@/types/api";
import {
  useUpdateSubscription, useArchiveSubscription,
  useUpdateMember, useArchiveMember,
} from "@/hooks/useSubscriptions";
import { useMe } from "@/hooks/useMe";
import { Stat } from "@/components/primitives/Stat";
import { Popover } from "@/components/primitives/Popover";
import { Button } from "@/components/primitives/Button";

// ── Helpers ────────────────────────────────────────────────────────────────────

function daysBadgeCls(days: number | null): string {
  if (days === null) return "bg-white/[0.06] border-white/10 text-white/50";
  if (days < 0)   return "bg-red-500/10 border-red-500/20 text-red-400";
  if (days <= 7)  return "bg-red-500/10 border-red-500/20 text-red-400";
  if (days <= 30) return "bg-amber-500/10 border-amber-500/20 text-amber-400";
  return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
}

function daysLabel(days: number | null): string {
  if (days === null) return "нет даты";
  if (days < 0) return `просрочено ${Math.abs(days)}д`;
  if (days === 0) return "сегодня";
  return `${days} дн.`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ── MemberRow ──────────────────────────────────────────────────────────────────

function MemberRow({
  member,
  subId,
}: {
  member: SubscriptionMember;
  subId: number;
}) {
  const [editDate, setEditDate] = useState(false);
  const [editPay, setEditPay]   = useState(false);
  const [dateVal, setDateVal]   = useState(member.paid_until ?? "");
  const [payVal, setPayVal]     = useState(member.payment_per_month?.toString() ?? "");
  const [removePopoverOpen, setRemovePopoverOpen] = useState(false);

  const { mutate: updateMember } = useUpdateMember();
  const { mutate: removeMember } = useArchiveMember();

  useEffect(() => {
    setDateVal(member.paid_until ?? "");
    setPayVal(member.payment_per_month?.toString() ?? "");
  }, [member.paid_until, member.payment_per_month]);

  function saveDateVal() {
    updateMember({ subId, memberId: member.member_id, data: { paid_until: dateVal || null } });
    setEditDate(false);
  }

  function savePayVal() {
    const n = parseFloat(payVal);
    updateMember({ subId, memberId: member.member_id, data: { payment_per_month: isNaN(n) ? null : n } });
    setEditPay(false);
  }

  return (
    <div className="flex items-center gap-3 py-3 border-b border-white/[0.05] last:border-0">
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-indigo-500/15 flex items-center justify-center text-[11px] font-bold text-indigo-300/80 shrink-0">
        {getInitials(member.contact_name)}
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium truncate" style={{ color: "var(--t-primary)" }}>
          {member.contact_name}
        </p>

        {/* Date + payment inline edit */}
        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
          {/* Paid until */}
          {editDate ? (
            <input
              type="date"
              value={dateVal}
              onChange={(e) => setDateVal(e.target.value)}
              onBlur={saveDateVal}
              onKeyDown={(e) => { if (e.key === "Enter") saveDateVal(); if (e.key === "Escape") setEditDate(false); }}
              autoFocus
              className="text-[12px] px-2 py-0.5 rounded-md bg-white/[0.06] border border-indigo-500/40 outline-none [color-scheme:dark]"
              style={{ color: "var(--t-secondary)" }}
            />
          ) : (
            <button
              onClick={() => setEditDate(true)}
              className="flex items-center gap-1 text-[11px] hover:text-white/80 transition-colors"
              style={{ color: "var(--t-faint)" }}
            >
              <Calendar size={11} />
              {member.paid_until
                ? new Date(member.paid_until + "T00:00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })
                : "нет даты"}
            </button>
          )}

          {/* Payment */}
          {editPay ? (
            <input
              type="number"
              value={payVal}
              onChange={(e) => setPayVal(e.target.value)}
              onBlur={savePayVal}
              onKeyDown={(e) => { if (e.key === "Enter") savePayVal(); if (e.key === "Escape") setEditPay(false); }}
              autoFocus
              className="w-24 text-[12px] px-2 py-0.5 rounded-md bg-white/[0.06] border border-indigo-500/40 outline-none"
              style={{ color: "var(--t-secondary)" }}
              placeholder="сумма/мес"
            />
          ) : (
            <button
              onClick={() => setEditPay(true)}
              className="flex items-center gap-1 text-[11px] hover:text-white/80 transition-colors"
              style={{ color: "var(--t-faint)" }}
            >
              <DollarSign size={11} />
              {member.payment_per_month
                ? `${member.payment_per_month.toLocaleString("ru-RU")} ₽/мес`
                : "нет суммы"}
            </button>
          )}
        </div>
      </div>

      {/* Days badge */}
      {member.days_left !== null && (
        <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0", daysBadgeCls(member.days_left))}>
          {daysLabel(member.days_left)}
        </span>
      )}

      {/* Remove member */}
      <Popover
        open={removePopoverOpen}
        onOpenChange={setRemovePopoverOpen}
        side="left"
        align="center"
        className="min-w-[200px] p-3"
        trigger={
          <button
            className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center border transition-all border-transparent hover:bg-red-500/10 hover:border-red-500/20"
            style={{ color: "var(--t-faint)" }}
            title="Убрать участника"
          >
            <UserMinus size={11} />
          </button>
        }
      >
        <p className="text-[13px] font-medium mb-3" style={{ color: "var(--t-primary)" }}>
          Убрать {member.contact_name}?
        </p>
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setRemovePopoverOpen(false)}
          >
            Отмена
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              removeMember({ subId, memberId: member.member_id });
              setRemovePopoverOpen(false);
            }}
          >
            Убрать
          </Button>
        </div>
      </Popover>
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────────

interface Props {
  sub: SubscriptionItem;
  onClose: () => void;
}

export function SubscriptionDetailPanel({ sub, onClose }: Props) {
  const { data: me } = useMe();
  const isAdmin = me?.is_admin ?? false;
  const [name, setName]               = useState(sub.name);
  const [nameFocused, setNameFocused] = useState(false);
  const [paidUntil, setPaidUntil]     = useState(sub.paid_until_self ?? "");
  const [archivePopoverOpen, setArchivePopoverOpen] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);

  const nameRef     = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { mutate: update }  = useUpdateSubscription();
  const { mutate: archive } = useArchiveSubscription();

  // Sync when sub prop changes (after mutations)
  useEffect(() => {
    setName(sub.name);
    setPaidUntil(sub.paid_until_self ?? "");
  }, [sub.id]);

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function saveName() {
    const t = name.trim();
    if (t && t !== sub.name) update({ subId: sub.id, data: { name: t } });
    else setName(sub.name);
  }

  const debounceSavePaidUntil = useCallback((val: string) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      update({ subId: sub.id, data: { paid_until_self: val || null } });
    }, 600);
  }, [sub.id, update]);

  const monthlyTotal = sub.members.reduce((s, m) => s + (m.payment_per_month ?? 0), 0);

  return (
    <>
      {/* Backdrop (mobile) */}
      <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onClose} />

      <div
        className={clsx(
          "fixed z-40 bg-[#161d2b] border-l border-white/[0.07] shadow-2xl flex flex-col",
          "inset-x-0 bottom-0 top-[15%] rounded-t-2xl",
          "lg:inset-x-auto lg:top-0 lg:bottom-0 lg:right-0 lg:w-[420px] lg:rounded-none",
        )}
        style={{ animation: "slideInPanel 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center shrink-0">
              <span className="text-indigo-400 text-sm">💳</span>
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
              Подписка
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors touch-manipulation"
            style={{ color: "var(--t-faint)" }}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Name */}
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setNameFocused(true)}
            onBlur={() => { setNameFocused(false); saveName(); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); nameRef.current?.blur(); }
              if (e.key === "Escape") { setName(sub.name); nameRef.current?.blur(); }
            }}
            className={clsx(
              "w-full text-[18px] font-semibold bg-transparent outline-none leading-snug border-b transition-colors pb-1",
              nameFocused ? "border-indigo-500/50" : "border-transparent hover:border-white/[0.08]"
            )}
            style={{ color: "var(--t-primary)", letterSpacing: "-0.02em" }}
          />

          {/* Stats */}
          <div className={clsx("grid gap-3", isAdmin ? "grid-cols-2" : "grid-cols-1")}>
            {isAdmin && (
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3 flex items-center justify-center">
                <Stat label="Участников" value={sub.total_members} align="center" size="lg" />
              </div>
            )}
            <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3 flex items-center justify-center">
              <Stat
                label="/ месяц"
                value={monthlyTotal > 0 ? `${monthlyTotal.toLocaleString("ru-RU")} ₽` : "—"}
                align="center"
                size="lg"
                valueClassName="text-red-600 dark:text-red-400"
              />
            </div>
          </div>

          {/* Paid until self */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--t-faint)" }}>
              Оплачено до (мой доступ)
            </p>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={paidUntil}
                onChange={(e) => {
                  setPaidUntil(e.target.value);
                  debounceSavePaidUntil(e.target.value);
                }}
                className="px-2.5 py-1.5 text-[13px] rounded-lg bg-white/[0.05] border border-white/[0.08] focus:outline-none focus:border-indigo-500/50 transition-colors [color-scheme:dark]"
                style={{ color: "var(--t-secondary)" }}
              />
              {paidUntil && sub.days_left_self !== null && (
                <span className={clsx("text-[11px] font-semibold px-2 py-0.5 rounded-full border", daysBadgeCls(sub.days_left_self))}>
                  {daysLabel(sub.days_left_self)}
                </span>
              )}
              {paidUntil && (
                <button
                  onClick={() => { setPaidUntil(""); debounceSavePaidUntil(""); }}
                  className="text-[11px] hover:text-red-400 transition-colors"
                  style={{ color: "var(--t-faint)" }}
                >✕</button>
              )}
            </div>
          </div>

          {/* Members — admin only */}
          {isAdmin && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
                  Участники
                </p>
                <button
                  onClick={() => setShowAddMember(true)}
                  className="text-[11px] font-medium text-indigo-400/70 hover:text-indigo-400 transition-colors flex items-center gap-1"
                >
                  <UserPlus size={11} /> Добавить
                </button>
              </div>
              {sub.members.length === 0 ? (
                <p className="text-[13px] py-3 text-center" style={{ color: "var(--t-faint)" }}>
                  Нет участников
                </p>
              ) : (
                <div>
                  {sub.members.map((m) => (
                    <MemberRow key={m.member_id} member={m} subId={sub.id} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Add member modal */}
          {showAddMember && (
            <AddMemberModal subId={sub.id} onClose={() => setShowAddMember(false)} />
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-white/[0.06] px-5 py-4 flex justify-end">
          <Popover
            open={archivePopoverOpen}
            onOpenChange={setArchivePopoverOpen}
            side="top"
            align="end"
            className="min-w-[240px] p-3"
            trigger={
              <button
                className="flex items-center gap-1.5 py-2 px-3 rounded-xl border transition-all text-[12px] font-medium bg-white/[0.04] border-white/[0.07] hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-400"
                style={{ color: "var(--t-secondary)" }}
              >
                <Trash2 size={13} />
                В архив
              </button>
            }
          >
            <p className="text-[13px] font-medium mb-3" style={{ color: "var(--t-primary)" }}>
              Архивировать подписку?
            </p>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setArchivePopoverOpen(false)}
              >
                Отмена
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  archive(sub.id);
                  setArchivePopoverOpen(false);
                  onClose();
                }}
              >
                Архивировать
              </Button>
            </div>
          </Popover>
        </div>
      </div>

      <style>{`
        @keyframes slideInPanel {
          from { transform: translateX(100%); opacity: 0.8; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @media (max-width: 1023px) {
          @keyframes slideInPanel {
            from { transform: translateY(40px); opacity: 0.8; }
            to   { transform: translateY(0);    opacity: 1; }
          }
        }
      `}</style>
    </>
  );
}

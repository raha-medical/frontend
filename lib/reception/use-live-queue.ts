"use client";
import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getLiveSessions, type QueueItem, type QueueSession } from "../api/reception";
import { isNetworkError } from "../api/errors";
import { db } from "../offline/db";
import { useLive } from "../realtime/provider";

export const LIVE_KEY = ["queue", "live"] as const;

async function saveLocal(sessions: QueueSession[]) {
  try { await db().transaction("rw", db().queues, async () => { await db().queues.clear(); await db().queues.bulkPut(sessions); }); } catch { /* ignore */ }
}
async function loadLocal(): Promise<QueueSession[] | null> {
  try { const s = (await db().queues.toArray()) as QueueSession[]; return s.length ? s : null; } catch { return null; }
}

/**
 * طابور اليوم لعيادات الموظف: GET /queue/live + الحدث queue.updated (العقد 7).
 * عند إعادة الاتصال يعاد التحميل (العقد 0.9)، وعند انقطاع الإنترنت تُعرض آخر نسخة محفوظة محلياً.
 */
export function useLiveQueue() {
  const qc = useQueryClient();
  const { live } = useLive();
  const q = useQuery({
    queryKey: LIVE_KEY,
    queryFn: async () => {
      try { const s = await getLiveSessions(); void saveLocal(s); return s; }
      catch (e) { if (isNetworkError(e)) { const l = await loadLocal(); if (l) return l; } throw e; }
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!live) return;
    const offUpd = live.on("queue.updated", (p: { session_id: string; doctor_id: string; items: QueueItem[] }) => {
      let found = false;
      qc.setQueryData<QueueSession[]>(LIVE_KEY, (old) => old?.map((s) => (s.session_id === p.session_id ? ((found = true), { ...s, items: p.items }) : s)));
      if (!found) void qc.invalidateQueries({ queryKey: LIVE_KEY });
      else void saveLocal(qc.getQueryData<QueueSession[]>(LIVE_KEY) ?? []);
    });
    const offRe = live.onReconnected(() => void qc.invalidateQueries({ queryKey: LIVE_KEY }));
    return () => { offUpd(); offRe(); };
  }, [live, qc]);

  useEffect(() => {
    const h = () => void qc.invalidateQueries({ queryKey: LIVE_KEY });
    addEventListener("rahma:synced", h);
    return () => removeEventListener("rahma:synced", h);
  }, [qc]);

  return q;
}

/** تعديل محلي فوري لتذكرة (تحديث متفائل أو عملية أوفلاين). */
export function patchTicket(qc: QueryClient, ticketId: string, patch: Partial<QueueItem>) {
  qc.setQueryData<QueueSession[]>(LIVE_KEY, (old) => old?.map((s) => ({ ...s, items: s.items.map((i) => (i.ticket_id === ticketId ? { ...i, ...patch } : i)) })));
}
export function addTicket(qc: QueryClient, doctorId: string, item: QueueItem) {
  qc.setQueryData<QueueSession[]>(LIVE_KEY, (old) => old?.map((s) => (s.doctor_id === doctorId ? { ...s, items: [...s.items.filter((i) => i.ticket_id !== item.ticket_id), item] } : s)));
}

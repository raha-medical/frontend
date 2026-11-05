"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useAuth } from "../auth/store";
import { db } from "./db";
import { flushOutbox } from "./outbox";
import { refreshSnapshot } from "./snapshot";
import { pumpAgentEvents } from "../agent/lifecycle";

interface SyncCtx { online: boolean; pending: number; needsReview: number; flush: () => Promise<void> }
const Ctx = createContext<SyncCtx>({ online: true, pending: 0, needsReview: 0, flush: async () => {} });
export const useSync = () => useContext(Ctx);

export function useOnline() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(navigator.onLine);
    const a = () => setOn(true), b = () => setOn(false);
    addEventListener("online", a); addEventListener("offline", b);
    return () => { removeEventListener("online", a); removeEventListener("offline", b); };
  }, []);
  return on;
}

/** يرسل الصندوق الصادر عند: الدخول، عودة الإنترنت، إضافة عملية، وكل 30 ثانية. */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const authed = useAuth((s) => s.status === "authed" && !s.user?.must_change_password);
  // اللقطة (أسماء وهواتف مرضى اليوم) لأجهزة الاستقبال فقط، مثل الخادم
  const canSnapshot = useAuth((s) => !!s.user?.permissions.includes("patients.write"));
  const online = useOnline();
  const pending = useLiveQuery(() => db().outbox.where("status").anyOf("pending", "sending").count(), [], 0) ?? 0;
  const needsReview = useLiveQuery(() => db().outbox.where("status").equals("needs_review").count(), [], 0) ?? 0;

  useEffect(() => {
    if (!authed) return;
    const run = () => { void flushOutbox(); };
    run();
    const t = setInterval(run, 30_000);
    addEventListener("online", run);
    addEventListener("rahma:outbox", run);
    return () => { clearInterval(t); removeEventListener("online", run); removeEventListener("rahma:outbox", run); };
  }, [authed]);

  // أحداث الدرج والطابعة من الوكيل المحلي ← الصادر ← السيرفر (فتح الدرج بدون إيصال يصل المحاسب)
  useEffect(() => {
    if (!authed) return;
    const pump = () => { void pumpAgentEvents(); };
    pump();
    const t = setInterval(pump, 60_000);
    return () => clearInterval(t);
  }, [authed]);

  // لقطة بيانات اليوم للعمل أوفلاين: عند الدخول وكل 5 دقائق (لمن يدير الطابور)
  useEffect(() => {
    if (!authed || !canSnapshot) return;
    const snap = () => { refreshSnapshot().catch(() => { /* تُعاد لاحقاً */ }); };
    snap();
    const t = setInterval(snap, 5 * 60_000);
    addEventListener("online", snap);
    return () => { clearInterval(t); removeEventListener("online", snap); };
  }, [authed, canSnapshot]);

  return <Ctx.Provider value={{ online, pending, needsReview, flush: async () => { await flushOutbox(); } }}>{children}</Ctx.Provider>;
}

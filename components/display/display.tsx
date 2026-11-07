"use client";
/**
 * شاشة الانتظار العامة 1280×720 — Public.dc.html. بدون أسماء مرضى. العقد 7: GET /public/displays/{id}/queue + SignalR JoinDisplay + ticket.called.
 * النداء الصوتي (lib/display/announce.ts): زر «تفعيل الصوت» يظهر أول مرة لأن المتصفحات تمنع الصوت قبل أول ضغطة، ثم يعمل ما دامت الصفحة مفتوحة.
 */
import { useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { BrandMark } from "@/components/brand-mark";
import { WaitingLayout } from "./waiting-layout";
import { API_URL, HUB_URL } from "@/lib/config";
import { fmtTime } from "@/lib/format";
import { Announcer } from "@/lib/display/announce";

type Board = { doctor_name: string; now_serving: string | null; next: string[] };
type Q = { clinic_name: string; doctor_name: string; now_serving: string | null; next: string[]; boards: Board[] };
type CheckinToken = { enabled: boolean; qr_payload: string | null; refresh_after_seconds: number; scope?: string };
const KEY = "rahma.display";

/** رمز QR المتغير لتثبيت الحضور الذاتي (العقد 5.x). يُجدَّد حسب refresh_after_seconds، ويُخفى إذا أوقفه الفرع. */
function useCheckinToken(cfg: { id: string; key: string } | null) {
  const [t, setT] = useState<CheckinToken | null>(null);
  useEffect(() => {
    if (!cfg) return;
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      let next = 15;
      try {
        const r = await fetch(`${API_URL}/public/displays/${cfg.id}/checkin-token`, { headers: { "X-Display-Key": cfg.key }, cache: "no-store" });
        if (r.ok) { const d = (await r.json()) as CheckinToken; if (!stop) setT(d); next = Math.max(5, d.refresh_after_seconds || 15); }
        else if (!stop) setT(null);
      } catch { if (!stop) setT(null); }
      if (!stop) timer = setTimeout(load, next * 1000);
    };
    void load();
    return () => { stop = true; clearTimeout(timer); };
  }, [cfg]);
  return t;
}

export function DisplayScreen() {
  const [cfg, setCfg] = useState<{ id: string; key: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Q | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [called, setCalled] = useState<{ ticket_number: string; doctor_name: string; room?: string | null } | null>(null);
  const [now, setNow] = useState(new Date());
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const checkin = useCheckinToken(cfg);
  const announcer = useRef(new Announcer());
  // null = نفحص؛ false = يحتاج ضغطة «تفعيل الصوت» (سياسة المتصفحات)؛ true = مفعّل حتى إغلاق الصفحة
  const [sound, setSound] = useState<boolean | null>(null);
  useEffect(() => { void announcer.current.probe().then(setSound); }, []);

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const id = p.get("display_id"), key = p.get("key");
    if (id && key) {
      try { localStorage.setItem(KEY, JSON.stringify({ id, key })); } catch { /* */ }
      // نحذف المفتاح من شريط العنوان بعد حفظه حتى لا يظهر على الشاشة العامة أو في السجل
      try { history.replaceState(null, "", location.pathname); } catch { /* */ }
      setCfg({ id, key }); setReady(true); return;
    }
    try { const s = localStorage.getItem(KEY); if (s) setCfg(JSON.parse(s)); } catch { /* */ }
    setReady(true);
  }, []);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (!cfg) return;
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch(`${API_URL}/public/displays/${cfg.id}/queue`, { headers: { "X-Display-Key": cfg.key } });
        if (r.status === 401) { setErr("مفتاح الشاشة غير صحيح. أنشئ مفتاحاً جديداً من الإدارة ← الأجهزة."); return; }
        if (!r.ok) throw new Error();
        setData(await r.json()); setErr(null);
      } catch { setErr("تعذر الاتصال بالخادم. تُعاد المحاولة تلقائياً."); }
    };
    void load();
    const poll = setInterval(load, 20_000);
    const conn = new signalR.HubConnectionBuilder().withUrl(HUB_URL).withAutomaticReconnect([0, 2000, 5000, 10000, 30000]).build();
    const join = async () => { try { await conn.invoke("JoinDisplay", cfg.id, cfg.key); } catch { /* */ } };
    conn.on("ticket.called", (p: { ticket_number: string; doctor_name: string; room?: string | null }) => {
      setCalled(p); void load();
      // نغمة ثم نطق الرقم بالعربية مرتين (صوت المتصفح العربي، أو الملفات المسجلة، أو النغمة فقط)
      void announcer.current.announce(p.ticket_number, p.doctor_name, p.room);
      clearTimeout(timer.current); timer.current = setTimeout(() => setCalled(null), 15_000);
    });
    conn.on("queue.updated", () => void load());
    // المرحلة 3: المحتوى كاملاً يصل مع الحدث (إلغاء، حضور، تغيير موعد)
    conn.on("display.updated", (p: Q) => { setData(p); setErr(null); });
    conn.onreconnected(() => { void join(); void load(); });
    (async () => { try { await conn.start(); if (!stop) await join(); } catch { /* polling يكفي */ } })();
    return () => { stop = true; clearInterval(poll); void conn.stop(); };
  }, [cfg]);

  if (!ready) return <main className="min-h-dvh bg-nav-medical" />;
  if (!cfg) return (
    <main className="grid min-h-dvh place-items-center bg-nav-medical p-8 text-center text-white">
      <div className="flex max-w-lg flex-col items-center gap-4"><BrandMark size={84} tone="onDark" paper="rgb(var(--nav-medical))" /><h1 className="text-2xl font-bold">شاشة الانتظار غير مُعدة</h1>
        <p className="leading-8 text-on-nav-2">سجّل الشاشة من الإدارة ← الأجهزة (نوع «شاشة انتظار»)، ثم افتح الرابط:<br /><span className="num rounded bg-white/10 px-2" dir="ltr">/display?display_id=…&key=…</span></p></div>
    </main>
  );
  const boards = data?.boards?.length ? data.boards : data ? [{ doctor_name: data.doctor_name, now_serving: data.now_serving, next: data.next }] : [];
  return (
    <WaitingLayout boards={boards} clinic={data?.clinic_name ?? "شاشة الانتظار"} time={fmtTime(now)} error={err} checkin={checkin} called={called} needsSound={sound === false} onEnableSound={async () => { await announcer.current.unlock(); setSound(true); }} />
  );
}

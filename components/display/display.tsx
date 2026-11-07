"use client";
/**
 * شاشة الانتظار العامة 1280×720 — Public.dc.html. بدون أسماء مرضى. العقد 7: GET /public/displays/{id}/queue + SignalR JoinDisplay + ticket.called.
 * النداء الصوتي (lib/display/announce.ts): زر «تفعيل الصوت» يظهر أول مرة لأن المتصفحات تمنع الصوت قبل أول ضغطة، ثم يعمل ما دامت الصفحة مفتوحة.
 */
import { useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { BrandMark } from "@/components/brand-mark";
import { QrCode } from "@/components/qr";
import { Icon } from "@/components/icon";
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
    <main className="scale-display flex min-h-dvh flex-col bg-nav-medical text-white">
      <header className="flex items-center gap-4 px-10 py-4">
        <BrandMark size={80} tone="onDark" paper="rgb(var(--nav-medical))" />
        <div className="flex flex-1 flex-col"><span className="text-heading font-bold">مجمع الرحمة الطبي</span><span className="text-small text-on-nav-3">{data?.clinic_name ?? "…"}</span></div>
        <span className="num text-heading font-bold">{fmtTime(now)}</span>
      </header>
      {err && <div className="mx-10 rounded-2xl bg-warn/25 px-6 py-4 text-small text-on-nav-warn">{err}</div>}
      <div className="flex min-h-0 flex-1 gap-6 px-10 pb-5 pt-1">
      <div className="grid min-w-0 flex-1 gap-6" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(boards.length, 1), 3)}, minmax(0, 1fr))` }}>
        {boards.map((b) => (
          <section key={b.doctor_name} className="glass-dark flex flex-col gap-3.5 rounded-panel p-5">
            <span className="flex items-center gap-3 text-body font-semibold text-on-nav-2"><Icon name="stethoscope" size={34} />{b.doctor_name}</span>
            <div className="flex flex-col items-center gap-2 rounded-panel bg-white py-5 text-nav-medical">
              <span className="text-body font-semibold">الرقم الحالي</span>
              <span className="num text-display leading-none">{b.now_serving ?? "—"}</span>
            </div>
            <span className="text-body text-on-nav-3">التالي</span>
            <div className="flex flex-wrap gap-3">{b.next.slice(0, 5).map((n) => <span key={n} className="num rounded-2xl bg-white/10 px-6 py-3 text-heading font-bold">{n}</span>)}{!b.next.length && <span className="text-body text-on-nav-3">لا يوجد</span>}</div>
          </section>
        ))}
      </div>
      {checkin?.enabled && checkin.qr_payload && (
        <aside className="glass-dark flex w-[340px] shrink-0 flex-col items-center justify-center gap-3 rounded-panel p-5 text-center" aria-label="تثبيت الحضور من الهاتف">
          <span className="text-[28px] font-bold leading-tight">ثبّت حضورك من هاتفك</span>
          <span className="w-[min(33vh,280px)] rounded-2xl bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"><QrCode value={checkin.qr_payload} size={280} /></span>
          <span className="text-[24px] font-semibold leading-snug text-on-nav-2">حجوزاتي ← أنا في المجمع ← امسح الرمز</span>
        </aside>
      )}
      </div>
      {called && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60" role="alert">
          <div className="flex flex-col items-center gap-4 rounded-[40px] bg-white px-24 py-14 text-center text-nav-medical shadow-float">
            <Icon name="megaphone" size={80} className="text-nav-active" />
            <span className="num text-[180px] font-bold leading-none">{called.ticket_number}</span>
            <span className="text-heading font-bold">تفضل للدخول · {called.doctor_name}</span>
            {called.room && <span className="text-body">{called.room}</span>}
          </div>
        </div>
      )}
      {sound === false && (
        <button onClick={async () => { await announcer.current.unlock(); setSound(true); }}
          className="fixed bottom-6 start-6 z-40 flex items-center gap-3 rounded-full bg-white px-8 py-4 text-heading font-bold text-nav-medical shadow-float animate-pulse">
          <Icon name="volume-2" size={36} />تفعيل الصوت
        </button>
      )}
      <footer className="px-10 pb-5 text-center text-small text-on-nav-3">حفاظاً على الخصوصية لا تُعرض أسماء المرضى</footer>
    </main>
  );
}

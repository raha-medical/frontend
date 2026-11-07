"use client";
/** تطبيق المريض — Patient App.dc.html (هاتف 360×760). العقد: مصادقة المريض، 5 الحجز، 6 الدفع الإلكتروني، 7 طابوري، 11 الزيارات، 18 الإشعارات. */
import { isNotifMuted, notifChime, primeAudioOnGesture, setNotifMuted, startTurnAlarm } from "@/lib/patient/alert-sound";
import { useCallback, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "@/components/toast";
import { Alert, Badge, Button, CopyId, DateField, DoctorPhoto, Empty, ErrorState, Field, ISelect, Spinner } from "@/components/ui";
import { patientApi, patientStore } from "@/lib/api/staff";
import type { PatientRef, PatientSessionUser } from "@/lib/api/types";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { fmtDate, fmtDateTime, fmtDayMonth, fmtIqd, fmtTime, fmtTimeRange } from "@/lib/format";
import { addDays, todayBaghdad, weekdayAr } from "@/lib/date";
import { uuidv7 } from "@/lib/id";
import { BrandScene } from "@/components/brand-scene";
import { LiveConnection } from "@/lib/realtime/live";
import { CancelDialog, RescheduleDialog } from "@/components/booking/policy-dialogs";
import { SelfCheckInDialog } from "./self-checkin";
import { DoctorCancelOptions, SupportCenter } from "./support";
import { AssistantButton } from "./assistant";
import { MedicalFile } from "./file";
import { DirectionsButton, LocationPrompt, fmtDistance, useGeo, useNearest } from "./location";
import { Back, BranchClinics, type PDoctor } from "./clinics";
import { type OPay, QrToggle, payOnline, pub } from "./shared";
import type { PBooking, PBranch } from "./types";

type Tab = "home" | "bookings" | "queue" | "records" | "notifications" | "account";
const TAB_TITLE: Record<Tab, string> = { home: "الرئيسية", bookings: "حجوزاتي", queue: "طابوري", records: "ملفي الطبي", notifications: "الإشعارات", account: "حسابي" };

/**
 * الجلسة المحفوظة في المتصفح. تُقرأ بعد التحميل فقط: الخادم لا يملك localStorage، فقراءتها أثناء أول رسم
 * تجعل ما يرسمه الخادم («تطبيق المرضى» وشاشة الدخول) يختلف عما يرسمه المتصفح (اسم المريض) = Hydration mismatch.
 */
function useSession() {
  const [state, setState] = useState<{ ready: boolean; s: ReturnType<typeof patientStore.get> }>({ ready: false, s: null });
  useEffect(() => {
    setState({ ready: true, s: patientStore.get() });
    return patientStore.subscribe((s) => setState({ ready: true, s }));
  }, []);
  return state;
}

export function PatientApp() {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  return <QueryClientProvider client={qc}><Shell /></QueryClientProvider>;
}

/** تحديث مباشر لحساب المريض (مجموعة patient_account): طابوري وحجوزاتي (العقد 7.y). */
function usePatientLive(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const live = new LiveConnection(() => patientApi.getFreshAccessToken());
    const refresh = () => { void qc.invalidateQueries({ queryKey: ["p", "tickets"] }); void qc.invalidateQueries({ queryKey: ["p", "bookings"] }); void qc.invalidateQueries({ queryKey: ["p", "notifs"] }); void qc.invalidateQueries({ queryKey: ["p", "file"] }); };
    ["my_queue.updated", "booking.changed", "eta.changed"].forEach((ev) => live.on(ev, refresh));
    // إشعار جديد والتطبيق مفتوح: نغمة قصيرة (تُكتم من حسابي ← الإشعارات) وتنبيه منبثق، والشارة تتحدث مع القائمة.
    // «حان دورك» له شاشة كاملة خاصة (TurnAlert) فلا يُكرر هنا.
    live.on("notification.created", (n?: { type?: string; title?: string; message?: string }) => {
      refresh();
      if (!n?.type || n.type === "queue.called" || n.type === "queue.call_repeat") return;
      notifChime();
      toast.info(n.message ? `${n.title}: ${n.message}` : (n.title ?? "إشعار جديد"));
    });
    live.on("queue.call_alert", () => { void qc.invalidateQueries({ queryKey: ["p", "tickets"] }); });
    live.onReconnected(refresh);
    void live.start();
    // العودة من الخلفية: نعيد القراءة فوراً فيظهر «حان دورك» إن لم يُؤكَّد
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const unprime = primeAudioOnGesture();
    return () => { void live.stop(); document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); unprime(); };
  }, [enabled, qc]);
}

const MEMBER_KEY = "rahma.patient.member";

function Shell() {
  const { ready, s } = useSession();
  const [tab, setTab] = useState<Tab>("home");
  const [accountTab, setAccountTab] = useState<"family" | "support">("family");
  // رابط من إشعار (أو /patient?tab=bookings&cancel_options={id}): يفتح «حجوزاتي» وخيارات المبلغ مباشرة
  const [focusOptions, setFocusOptions] = useState<string | null>(null);
  useEffect(() => {
    try {
      const p = new URLSearchParams(location.search);
      const t = p.get("tab");
      if (t && (["home", "bookings", "queue", "records", "notifications", "account"] as string[]).includes(t)) setTab(t as Tab);
      const co = p.get("cancel_options");
      if (co) { setTab("bookings"); setFocusOptions(co); }
      if (t || co) history.replaceState(null, "", location.pathname);
    } catch { /* */ }
  }, []);
  const openLink = useCallback((link: { type: string; id: string } | null) => {
    if (!link) return;
    if (link.type === "booking_cancel_options") { setFocusOptions(link.id); setTab("bookings"); }
    else if (link.type === "booking" || link.type === "online_payment") setTab("bookings");
    else if (link.type === "lab_order" || link.type === "radiology_order") setTab("records");
  }, []);
  const [homeKey, setHomeKey] = useState(0);
  const user = s?.user;
  usePatientLive(!!user);
  // الفرد المختار في الحساب: يبقى في كل الشاشات وبعد إعادة الفتح (تفضيل محلي فقط)
  const [memberId, setMemberId] = useState<string | null>(null);
  useEffect(() => { try { setMemberId(localStorage.getItem(MEMBER_KEY)); } catch { /* */ } }, []);
  const member = user?.patients.find((p) => p.patient_id === memberId) ?? user?.patients.find((p) => p.relation === "self") ?? user?.patients[0] ?? null;
  const pickMember = useCallback((id: string) => { setMemberId(id); try { localStorage.setItem(MEMBER_KEY, id); } catch { /* */ } }, []);
  // الدخول شاشة كاملة بلا إطار التطبيق: مشهد الهوية وبطاقة زجاجية للهاتف أولاً
  if (ready && !user) return <div className="scale-patient text-body"><Login /></div>;
  return (
    <div className="scale-patient flex min-h-dvh justify-center bg-bg text-body">
      <div className="relative flex w-full max-w-[440px] flex-col bg-bg sm:my-6 sm:min-h-[760px] sm:rounded-[32px] sm:border sm:border-line sm:shadow-card">
        <header className="glass-bar sticky top-2 z-20 mx-2 mt-2 flex items-center gap-2.5 rounded-2xl px-4 py-3">
          <BrandMark size={34} />
          <span className="flex min-w-0 flex-1 flex-col"><h1 className="truncate text-[17px] font-bold">{user ? TAB_TITLE[tab] : "مجمع الرحمة"}</h1><span className="sub-sm truncate">{user ? member?.full_name ?? user.account.phone_number : "تطبيق المراجعين"}</span></span>
          {user && user.patients.length > 0 && <PatientBell active={tab === "notifications"} onOpen={() => setTab("notifications")} />}
          <ThemeToggle />
        </header>
        <main className="enter flex flex-1 flex-col gap-4 px-4 pb-44 pt-4">
          {!ready || !user ? <Spinner /> : !user.patients.length ? <CreateProfile /> : (
            <>
              {tab === "home" && <Home key={homeKey} user={user} memberId={member?.patient_id ?? null} go={setTab} />}
              {tab === "bookings" && <Bookings user={user} go={setTab} focusOptions={focusOptions} onFocusDone={() => setFocusOptions(null)} />}
              {tab === "queue" && <MyQueue />}
              {tab === "records" && member && <MedicalFile user={user} patientId={member.patient_id} onSwitch={pickMember} />}
              {tab === "notifications" && <Notifications onLink={openLink} />}
              {tab === "account" && <Account user={user} initialTab={accountTab} memberId={member?.patient_id ?? null} onPick={pickMember} onOpenFile={(id) => { pickMember(id); setTab("records"); }} />}
            </>
          )}
        </main>
        {user && user.patients.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[440px] px-2 pb-2">
            <nav className="glass-bar grid grid-cols-5 rounded-2xl px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5" aria-label="التنقل">
              {([["home", "الرئيسية", "house"], ["bookings", "حجوزاتي", "calendar-days"], ["queue", "طابوري", "list-ordered"], ["records", "ملفي", "folder-heart"], ["account", "حسابي", "user-round"]] as const).map(([k, l, i]) => (
                <button key={k} onClick={() => { if (k === "home" && tab === "home") setHomeKey((n) => n + 1); setTab(k); }} aria-current={tab === k ? "page" : undefined} className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl text-[13px] font-semibold ${tab === k ? "text-primary" : "text-ink-3"}`}><Icon name={i} size={21} />{l}</button>
              ))}
            </nav>
          </div>
        )}
        {user && user.patients.length > 0 && <TurnAlert />}
        {user && member && <AssistantButton patientId={member.patient_id} onAction={(a) => { if (a.patient_id) pickMember(a.patient_id); setAccountTab(a.type === "open_support" ? "support" : "family"); setTab(a.type === "open_support" ? "account" : "records"); }} />}
      </div>
    </div>
  );
}

/** جرس الإشعارات: عدد غير المقروء، ويتحدث مباشرة. */
function PatientBell({ active, onOpen }: { active: boolean; onOpen: () => void }) {
  const q = useQuery({ queryKey: ["p", "notifs"], queryFn: () => patientApi.get<{ unread_count: number; items: unknown[] }>("/me/notifications"), refetchInterval: 60_000 });
  const n = q.data?.unread_count ?? 0;
  return (
    <button onClick={onOpen} aria-label={n ? `الإشعارات، ${n} غير مقروءة` : "الإشعارات"} aria-current={active ? "page" : undefined} className="relative grid size-11 place-items-center rounded-full">
      <Icon name="bell" size={21} />
      {n > 0 && <span className="num absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[12px] font-bold text-on-accent">{n > 99 ? "99+" : n}</span>}
    </button>
  );
}

// ------------------------------------------------------------------ الدخول OTP
function Login() {
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [code, setCode] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (step !== "code") return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [step]);
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const norm = phone.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
  async function request() {
    setBusy(true); setErr(null);
    try { const r = await patientApi.post<{ otp_expires_in: number; resend_after: number; sandbox_code: string | null }>("/patient-auth/otp/request", { phone_number: norm }, { auth: false }); setHint(r.sandbox_code); setCode(""); setResendAt(Date.now() + r.resend_after * 1000); setNow(Date.now()); setStep("code"); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }
  async function verify() {
    setBusy(true); setErr(null);
    try {
      const r = await patientApi.post<{ access_token: string; expires_in: number; refresh_token: string; refresh_expires_in: number; account: PatientSessionUser["account"]; patients: PatientRef[] }>("/patient-auth/otp/verify", { phone_number: norm, code }, { auth: false });
      const now = Date.now();
      patientStore.set({ access_token: r.access_token, refresh_token: r.refresh_token, access_expires_at: now + r.expires_in * 1000, refresh_expires_at: now + r.refresh_expires_in * 1000, user: { account: r.account, patients: r.patients } });
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }
  const left = isApiError(err) ? (err.extra?.attempts_left as number | undefined) : undefined;
  // لوحة المفاتيح لا تغطي الحقل: يتوسط الحقل المرئي بعد ظهورها
  const keepVisible = (e: React.FocusEvent) => { const el = e.target; if (el instanceof HTMLInputElement) setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 320); };
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-8">
      <BrandScene className="!fixed inset-0" />
      <div className="absolute end-4 top-4 z-10"><ThemeToggle /></div>
      <section className="glass-login enter relative flex w-full max-w-[420px] flex-col gap-4 rounded-panel p-6" onFocus={keepVisible}>
      <div className="flex flex-col items-center gap-2 text-center">
        <BrandMark size={96} />
        <h1 className="text-2xl font-bold">أهلاً بك في الرحمة</h1><span className="sub">ادخل برقم هاتفك لتحجز موعدك وتتابع دورك ونتائجك. أول دخول ينشئ حسابك تلقائياً.</span>
      </div>
      {step === "phone" ? (
        <>
          <Field label="رقم الهاتف" icon="smartphone" ltr inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07XXXXXXXXX" />
          <Button loading={busy} disabled={norm.length < 10} icon="send" onClick={request}>إرسال رمز التحقق</Button>
          <a href="/" className="sub text-center font-semibold text-primary">تعرّف على خدمات المجمع وأطبائه أولاً</a>
        </>
      ) : (
        <>
          <span className="sub text-center">أرسلنا رمزاً إلى <b className="num" dir="ltr">{norm}</b> <button className="font-semibold text-primary" onClick={() => { setStep("phone"); setCode(""); }}>تغيير</button></span>
          {hint && <SandboxCode code={hint} onUse={() => setCode(hint)} />}
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" dir="ltr" aria-label="رمز التحقق" placeholder="••••••"
            onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6 && !busy) void verify(); }}
            className="num h-16 rounded-2xl border-2 border-primary bg-surface text-center text-3xl font-bold tracking-[.5em] outline-none" />
          <Button loading={busy} disabled={code.length !== 6} icon="log-in" onClick={verify}>تأكيد</Button>
          <button className="sub text-center font-semibold text-primary disabled:text-ink-muted" disabled={busy || wait > 0} onClick={request}>
            {wait > 0 ? <>إعادة إرسال الرمز بعد <span className="num">{wait}</span> ث</> : "لم يصلك الرمز؟ إعادة الإرسال"}
          </button>
        </>
      )}
      {err != null && <Alert tone="danger">{isApiError(err) && err.code === "INVALID_OTP" ? `الرمز غير صحيح${left != null ? ` · المحاولات المتبقية ${left}` : ""}` : errorMessage(err)}</Alert>}
      </section>
    </main>
  );
}

/**
 * لا مزوّد SMS بعد، فالخادم يعيد الرمز في الاستجابة (sandbox_code) ويظهر هنا ليكمل المراجع الدخول.
 * يظهر فقط حين يرسل الخادم الرمز، والخادم يرفض ذلك في الإنتاج. وبلا علامة «تجريبي» للمراجع (UI-46).
 */
function SandboxCode({ code, onUse }: { code: string; onUse: () => void }) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-2xl bg-primary-soft px-4 py-3.5 text-center">
      <span className="text-base text-ink-2">رمز التحقق الخاص بك</span>
      <span className="num text-4xl font-bold tracking-[.3em] text-ink" dir="ltr">{code}</span>
      <button type="button" onClick={onUse} className="flex min-h-11 items-center gap-1.5 rounded-full bg-surface px-4 text-base font-semibold text-primary-strong hover:bg-bg">
        <Icon name="copy" size={15} />إدخال الرمز
      </button>
    </div>
  );
}

function CreateProfile() {
  const [f, setF] = useState({ full_name: "", gender: "male", birth_date: "" });
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3.5 pt-4">
      <span className="text-lg font-bold">أنشئ ملفك</span><span className="sub">لم نجد ملفاً مرتبطاً برقمك. أدخل بياناتك مرة واحدة.</span>
      <Field label="الاسم الكامل" icon="user-round" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">{[["male", "ذكر"], ["female", "أنثى"]].map(([k, l]) => <button key={k} onClick={() => setF({ ...f, gender: k })} className={`h-12 rounded-xl border-[1.5px] text-base font-semibold ${f.gender === k ? "border-primary bg-primary-soft text-primary-strong" : "border-line"}`}>{l}</button>)}</div>
      <DateField label="تاريخ الميلاد" value={f.birth_date} max={todayBaghdad()} startInYears icon="cake" onChange={(v) => setF({ ...f, birth_date: v })} />
      <Button loading={busy} disabled={f.full_name.trim().length < 3 || !f.birth_date} icon="check" onClick={async () => { setBusy(true); try { await addPatient({ ...f, relation: "self" }); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }}>إنشاء الملف</Button>
    </div>
  );
}
async function addPatient(b: { full_name: string; gender: string; birth_date: string; relation: string }) {
  await patientApi.post("/me/patients", { patient_id: uuidv7(), full_name: b.full_name.trim(), gender: b.gender, birth_date: b.birth_date || null, relation: b.relation });
  const r = await patientApi.get<{ items: PatientRef[] }>("/me/patients");
  const s = patientStore.get(); if (s) patientStore.set({ ...s, user: { ...s.user, patients: r.items } });
}

// ------------------------------------------------------------------ الرئيسية والحجز
type Day = { date: string; session_id: string; start: string; end: string; online_remaining: number; next_sequence_number: number; next_estimated_time: string | null; status: string; cancel_reason: string | null };

function Home({ user, memberId, go }: { user: PatientSessionUser; memberId: string | null; go: (t: Tab) => void }) {
  const tickets = useQuery({ queryKey: ["p", "tickets"], queryFn: () => patientApi.get<{ items: MyTicket[] }>("/me/queue-tickets"), refetchInterval: 30_000 });
  const branches = useQuery({ queryKey: ["p", "branches"], queryFn: () => pub<{ items: PBranch[] }>("/public/branches") });
  const [branch, setBranch] = useState<PBranch | null>(null);
  const [doctor, setDoctor] = useState<PDoctor | null>(null);
  const geo = useGeo();
  const near = useNearest(branches.data?.items, geo.pos);
  const banned = user.patients.find((p) => p.is_banned);
  // قائمة العيادات تبقى مركّبة خلف شاشة الحجز، فالرجوع يعيد العيادة والبحث كما كانا
  if (branch) return (
    <>
      {doctor && <BookDoctor user={user} memberId={memberId} doctor={doctor} branch={branch} onBack={() => setDoctor(null)} onDone={() => { setDoctor(null); setBranch(null); go("bookings"); }} />}
      <div className={doctor ? "hidden" : "contents"}><BranchClinics b={branch} onBack={() => setBranch(null)} onPick={setDoctor} /></div>
    </>
  );
  const active = tickets.data?.items.find((t) => ["waiting", "arrived", "called", "in_room"].includes(t.status));
  return (
    <>
      {banned && <Alert tone="danger" icon="ban">ملف {banned.full_name} محظور بسبب تكرار الغياب. ادفع عربون فك الحظر من «حسابي».</Alert>}
      {active && (
        <button onClick={() => go("queue")} className={`flex items-center gap-3 rounded-3xl p-4 text-start text-white ${active.status === "called" ? "bg-warn dark:bg-warn-soft" : "bg-primary dark:bg-primary-soft"} dark:ring-1 dark:ring-white/10`}>
          <span className="num grid size-14 place-items-center rounded-2xl bg-white/20 text-lg font-bold">{active.ticket_number}</span>
          <span className="flex flex-1 flex-col"><span className="font-bold">{active.status === "called" ? "تفضل للدخول الآن" : `عدد من أمامك: ${active.patients_ahead ?? 0}`}</span><span className="text-[15px] text-white/85">{active.doctor_name} · الدخول التقريبي <span className="num">{fmtTime(active.estimated_time)}</span></span></span>
          <Icon name="chevron-left" size={20} />
        </button>
      )}
      <LocationPrompt geo={geo} />
      <span className="text-lg font-bold">احجز موعداً · اختر الفرع</span>
      {geo.choice === "allowed" && geo.locating && <span className="sub">نحدد أقرب فرع لك…</span>}
      {geo.choice === "allowed" && geo.failed && !geo.pos && <span className="sub">تعذر تحديد موقعك الآن. الفروع معروضة بالترتيب العادي.</span>}
      {branches.isPending ? <Spinner /> : branches.isError ? <Alert tone="danger">تعذر تحميل الفروع</Alert> : near.list.map((b) => {
        const km = near.km.get(b.branch_id);
        const nearest = near.nearestId === b.branch_id;
        return (
          <div key={b.branch_id} className={`flex flex-col gap-2 rounded-2xl border bg-surface p-3.5 ${nearest ? "border-primary shadow-glass ring-1 ring-primary/30" : "border-line"}`}>
            <button disabled={b.status !== "open"} onClick={() => setBranch(b)} className="flex items-center gap-3 text-start disabled:opacity-60">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary"><Icon name="building-2" size={22} /></span>
              <span className="flex flex-1 flex-col"><span className="flex flex-wrap items-center gap-1.5 font-bold">{b.name}{nearest && <Badge tone="primary" variant="solid" size="md" icon="map-pin">الأقرب إليك</Badge>}</span><span className="sub-sm">{b.city ? `${b.city} · ` : ""}<span className="num">{b.doctors_count}</span> {b.doctors_count === 1 ? "طبيب" : "أطباء"}{km != null ? <> · <span className="num">{fmtDistance(km)}</span></> : null}</span>{b.status !== "open" && <span className="text-sm text-warn-strong">{b.status_ar}{b.status_reason_ar ? ` · ${b.status_reason_ar}` : ""}</span>}</span>
              <Icon name="chevron-left" size={18} className="shrink-0 text-ink-muted" />
            </button>
            <DirectionsButton compact directions={b.directions} name={b.name} className="self-start" />
          </div>
        );
      })}
    </>
  );
}

function BookDoctor({ user, memberId, doctor, branch, onBack, onDone }: { user: PatientSessionUser; memberId: string | null; doctor: PDoctor; branch: PBranch; onBack: () => void; onDone: () => void }) {
  const from = todayBaghdad();
  const q = useQuery({ queryKey: ["p", "avail", doctor.doctor_id], queryFn: () => pub<{ days: Day[] }>(`/public/doctors/${doctor.doctor_id}/availability?from=${from}&to=${addDays(from, 13)}`) });
  const [day, setDay] = useState<Day | null>(null);
  const [pid, setPid] = useState(memberId ?? user.patients[0].patient_id);
  const [busy, setBusy] = useState(false);
  const [key] = useState(uuidv7);
  const [booking, setBooking] = useState<PBooking | null>(null);
  // أول يوم متاح يُختار تلقائياً، فيرى المراجع دوره ووقته مباشرة
  const days = q.data?.days ?? [];
  const firstOpen = days.find((d) => d.status === "open" && d.online_remaining > 0) ?? null;
  const chosen = day ?? firstOpen;
  const patient = user.patients.find((p) => p.patient_id === pid);
  if (booking) return <PayBooking b={booking} branch={branch} onDone={onDone} />;
  return (
    <>
      <Back onBack={onBack} title="حجز موعد" />
      {/* الطبيب */}
      <section className="flex items-center gap-3.5 rounded-2xl bg-surface p-3.5">
        <DoctorPhoto src={doctor.photo_url} name={doctor.full_name} textClass="text-2xl" className="size-[72px] shrink-0 rounded-2xl" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[17px] font-bold">{doctor.full_name}</span>
          <span className="sub-sm truncate">{doctor.specialty} · {doctor.clinic_name}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            {doctor.new_visit_price != null && <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[13px] font-semibold text-primary-strong">الكشفية <span className="num">{fmtIqd(doctor.new_visit_price)}</span></span>}
            <span className="rounded-full bg-bg px-2.5 py-0.5 text-[13px] text-ink-2">{branch.name}</span>
          </span>
        </span>
      </section>

      {/* لمن الحجز */}
      {user.patients.length > 1 && (
        <section className="flex flex-col gap-2">
          <span className="px-1 font-bold">لمن الحجز؟</span>
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4" role="radiogroup" aria-label="لمن الحجز">
            {user.patients.map((p) => {
              const on = pid === p.patient_id;
              return (
                <button key={p.patient_id} role="radio" aria-checked={on} onClick={() => setPid(p.patient_id)}
                  className={`flex min-h-12 shrink-0 items-center gap-2 rounded-full border py-1 pe-3.5 ps-1 text-[15px] font-semibold ${on ? "border-primary bg-primary text-on-accent" : "border-line bg-surface"}`}>
                  <span className={`grid size-9 place-items-center rounded-full text-sm font-bold ${on ? "bg-white/20" : "bg-primary-soft text-primary-strong"}`}>{p.full_name.trim().charAt(0)}</span>
                  {p.full_name.split(" ").slice(0, 2).join(" ")}
                </button>
              );
            })}
          </div>
          {patient?.is_banned && <Alert tone="warn" icon="ban">الحجز موقوف لهذا الملف بسبب تكرار الغياب. ادفع عربون فك الإيقاف من «حسابي» أولاً.</Alert>}
        </section>
      )}

      {/* اختيار اليوم: شريط أفقي لأسبوعين */}
      <section className="flex flex-col gap-2">
        <span className="flex items-end justify-between px-1">
          <span className="font-bold">اختر اليوم</span>
          <span className="sub-sm">الأسبوعان القادمان</span>
        </span>
        {q.isPending ? <Spinner /> : q.isError ? <ErrorState hint={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : !days.length ? <Empty icon="calendar-off" title="لا توجد أيام عمل قريبة لهذا الطبيب" /> : (
          <div className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" aria-label="أيام الحجز">
            {days.map((d) => {
              const ok = d.status === "open" && d.online_remaining > 0;
              const on = chosen?.session_id === d.session_id;
              const state = d.status === "cancelled" ? "ملغى" : d.status === "closed" ? "مغلق" : d.status === "full" || !d.online_remaining ? "ممتلئ" : null;
              const few = ok && d.online_remaining <= 3;
              return (
                <button key={d.session_id} role="radio" aria-checked={on} disabled={!ok} onClick={() => setDay(d)}
                  aria-label={`${weekdayAr(d.date)} ${fmtDayMonth(d.date)} · ${state ?? `متبقي ${d.online_remaining}`}`}
                  className={`flex w-[84px] shrink-0 snap-start flex-col items-center gap-0.5 rounded-2xl border-[1.5px] px-1 py-2.5 transition-colors disabled:cursor-not-allowed ${on ? "border-primary bg-primary text-on-accent" : ok ? "border-line bg-surface hover:border-primary" : "border-transparent bg-bg text-ink-muted"}`}>
                  <span className={`text-[13px] font-semibold ${on ? "" : "text-ink-2"}`}>{d.date === from ? "اليوم" : weekdayAr(d.date)}</span>
                  <span className="num text-[24px] font-bold leading-none">{Number(d.date.slice(8, 10))}</span>
                  <span className={`whitespace-nowrap text-[12px] ${on ? "opacity-90" : "text-ink-muted"}`}>{fmtDayMonth(d.date).split(" ").slice(1).join(" ")}</span>
                  <span className={`mt-1 flex items-center gap-1 text-[12px] font-semibold ${on ? "" : state ? "text-ink-muted" : few ? "text-warn-strong" : "text-success-strong"}`}>
                    {!state && <span className={`size-1.5 rounded-full ${on ? "bg-current" : few ? "bg-warn" : "bg-success"}`} aria-hidden />}
                    {state ?? <><span className="num">{d.online_remaining}</span> متبقي</>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ملخص اليوم المختار والتأكيد */}
      {chosen && (
        <section className="flex flex-col gap-3 rounded-2xl border border-primary bg-surface p-4">
          <span className="flex items-center gap-2 font-bold"><Icon name="calendar-check" size={18} className="text-primary" />{chosen.date === from ? "اليوم" : weekdayAr(chosen.date)} <span className="num">{fmtDayMonth(chosen.date)}</span></span>
          <dl className="flex flex-col divide-y divide-line rounded-xl bg-bg px-3">
            {([["clock", "الدوام", fmtTimeRange(chosen.start, chosen.end)], ["ticket", "دورك المتوقع", `#${chosen.next_sequence_number}`], ["timer", "الدخول التقريبي", fmtTime(chosen.next_estimated_time)]] as const).map(([icon, label, value]) => (
              <div key={label} className="flex min-h-11 items-center gap-2.5 py-2">
                <Icon name={icon} size={17} className="shrink-0 text-primary" /><dt className="flex-1 text-ink-2">{label}</dt><dd className="num font-bold">{value}</dd>
              </div>
            ))}
          </dl>
          {user.patients.length > 1 && patient && <span className="sub-sm flex items-center gap-1.5"><Icon name="user-round" size={14} />الحجز باسم <b>{patient.full_name}</b></span>}
          <Button loading={busy} disabled={!!patient?.is_banned} icon="calendar-check" onClick={async () => {
            setBusy(true);
            try { const nb = await patientApi.post<PBooking>("/bookings", { booking_id: key, patient_id: pid, session_id: chosen.session_id, visit_kind: "auto" }, { idempotencyKey: key }); setBooking(nb); nb.warnings?.forEach((w) => toast.warn(w.message)); }
            catch (e) { toast.error(isApiError(e) && e.code === "PATIENT_BANNED" ? "الملف محظور. ادفع عربون فك الحظر أولاً." : errorMessage(e)); } finally { setBusy(false); }
          }}>تأكيد الحجز</Button>
          <span className="sub-sm text-center">الدفع اختياري بعد الحجز: إلكترونياً الآن، أو في الاستقبال عند وصولك.</span>
        </section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ الدفع الإلكتروني (بوابة تجريبية)
function PayBooking({ b, branch, onDone }: { b: PBooking; branch: PBranch; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [res, setRes] = useState<OPay | null>(null);
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col items-center gap-2 rounded-3xl bg-success-soft p-5 text-center text-success-strong"><Icon name="circle-check" size={40} /><h2 className="text-lg font-bold">تم الحجز</h2>
        <span className="text-base">{b.doctor_name} · <span className="num">{fmtDate(b.date)}</span> · دورك <b className="num">#{b.sequence_number}</b></span></div>
      {res?.status === "succeeded" ? <Alert tone="success">تم الدفع · وصل {res.receipt ? <CopyId value={res.receipt.receipt_number} label="نسخ رقم الوصل" /> : null}</Alert> : (
        <>
          {res && res.status !== "closed" && <Alert tone={res.status === "cancelled" ? "info" : res.status === "pending" ? "warn" : "danger"}>{res.status === "cancelled" ? "أُلغيت عملية الدفع. يمكنك المحاولة مرة أخرى." : res.status === "pending" ? "لم يكتمل الدفع بعد. يمكنك الدفع من «حجوزاتي»." : "لم يتم الدفع. حاول مرة أخرى أو ادفع في الاستقبال."}</Alert>}
          <span className="text-base font-semibold">الدفع (اختياري)</span>
          {b.payment_options.includes("pay_full_online") && <Button loading={busy === "full"} icon="credit-card" onClick={async () => { setBusy("full"); try { setRes(await payOnline({ purpose: "booking_full", patient_id: b.patient_id, booking_id: b.booking_id, label: `كشفية ${b.doctor_name}` })); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); } }}>دفع الكشفية كاملة · <span className="num">{fmtIqd(b.price)}</span></Button>}
          {b.payment_options.includes("pay_deposit_online") && <Button variant="ghost" loading={busy === "dep"} icon="piggy-bank" onClick={async () => { setBusy("dep"); try { setRes(await payOnline({ purpose: "booking_deposit", patient_id: b.patient_id, booking_id: b.booking_id, label: `عربون حجز ${b.doctor_name}` })); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); } }}>دفع عربون فقط</Button>}
        </>
      )}
      <DirectionsButton directions={branch.directions} name={branch.name} />
      <Button variant="ghost" icon="calendar-days" onClick={onDone}>{res?.status === "succeeded" ? "حجوزاتي" : "الدفع في الاستقبال"}</Button>
    </div>
  );
}

// ------------------------------------------------------------------ حجوزاتي
type Scope = "upcoming" | "past" | "cancelled";
const SCOPES: [Scope, string][] = [["upcoming", "القادمة"], ["past", "السابقة"], ["cancelled", "الملغاة"]];
const BOOKING_STATUS: Record<string, string> = { booked: "محجوز", cancelled: "ملغى", checked_in: "حضر", completed: "مكتمل", no_show: "غياب" };
const BOOKING_PAY: Record<string, string> = { paid: "مدفوع", deposit_paid: "مدفوع جزئياً (عربون)", unpaid: "غير مدفوع", credited: "رصيد في المحفظة", refunded: "مُسترجع" };

function Bookings({ user, go, focusOptions, onFocusDone }: { user: PatientSessionUser; go: (t: Tab) => void; focusOptions?: string | null; onFocusDone?: () => void }) {
  const [scope, setScope] = useState<Scope>("upcoming");
  const qc = useQueryClient();
  const [cancel, setCancel] = useState<PBooking | null>(null);
  const [resched, setResched] = useState<PBooking | null>(null);
  const [checkin, setCheckin] = useState<PBooking | null>(null);
  const [options, setOptions] = useState<PBooking | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["p", "bookings"] }); void qc.invalidateQueries({ queryKey: ["p", "tickets"] }); };
  const today = todayBaghdad();
  // الخادم يقسم إلى قادمة وسابقة فقط، و«الملغاة» تُجمع من القسمين
  const q = useQuery({
    queryKey: ["p", "bookings", scope],
    queryFn: async () => {
      const fetchScope = (x: "upcoming" | "past") => patientApi.get<{ items: PBooking[] }>("/bookings/my", { scope: x }).then((r) => r.items);
      if (scope !== "cancelled") return (await fetchScope(scope)).filter((b) => b.status !== "cancelled" || (scope === "upcoming" && b.cancel_options_pending));
      return (await Promise.all([fetchScope("upcoming"), fetchScope("past")])).flat().filter((b) => b.status === "cancelled");
    },
  });
  const branches = useQuery({ queryKey: ["p", "branches"], queryFn: () => pub<{ items: PBranch[] }>("/public/branches") });
  return (
    <>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1" role="tablist">{SCOPES.map(([k, l]) => <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)} className={`h-11 rounded-xl text-base font-semibold ${scope === k ? "bg-primary text-on-accent" : "text-ink-2"}`}>{l}</button>)}</div>
      {q.isPending ? <Spinner /> : q.isError ? <ErrorState hint={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : !q.data.length ? (
        <Empty icon="calendar-days" title={scope === "upcoming" ? "لا توجد حجوزات قادمة" : scope === "past" ? "لا توجد حجوزات سابقة" : "لا توجد حجوزات ملغاة"}
          action={<Button size="md" icon="calendar-plus" className="mt-2" onClick={() => go("home")}>احجز موعداً</Button>} />
      ) : q.data.map((b) => (
        <div key={b.booking_id} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <DoctorPhoto src={b.doctor_photo_url ?? null} name={b.doctor_name} textClass="text-xl" className="size-14 shrink-0 rounded-2xl" />
            <span className="flex min-w-0 flex-1 flex-col"><span className="font-bold">{b.doctor_name}</span><span className="sub-sm">{b.clinic_name ?? b.branch_name}</span><span className="sub-sm">{b.patient_name}{b.branch_name && b.clinic_name ? ` · ${b.branch_name}` : ""}</span></span>
            <span className="flex shrink-0 flex-col items-center rounded-chip bg-primary-soft px-2.5 py-1 text-primary-strong"><span className="text-[13px]">الدور</span><span className="num text-base font-bold">{b.ticket_number ?? `#${b.sequence_number}`}</span></span>
          </div>
          <span className="text-[15px]"><span className="num">{fmtDate(b.date)}</span>{b.estimated_time && <> · الدخول التقريبي <span className="num">{fmtTime(b.estimated_time)}</span></>}</span>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className={`rounded-full px-2.5 py-1 ${b.status === "cancelled" ? "bg-bg text-ink-3" : "bg-info-soft text-info-strong"}`}>{BOOKING_STATUS[b.status] ?? "—"}</span>
            <span className={`rounded-full px-2.5 py-1 ${b.payment_status === "paid" ? "bg-success-soft text-success-strong" : b.payment_status === "deposit_paid" ? "bg-info-soft text-info-strong" : b.payment_status === "unpaid" ? "bg-warn-soft text-warn-strong" : "bg-bg text-ink-2"}`}>{b.status === "cancelled" && b.payment_status === "deposit_paid" ? BOOKING_PAY.credited : BOOKING_PAY[b.payment_status] ?? "—"}</span>
            {b.check_in_method && <span className="rounded-full bg-success-soft px-2.5 py-1 text-success-strong">{b.check_in_method === "self_qr" ? "ثُبت حضورك من التطبيق" : "ثُبت حضورك في الاستقبال"}</span>}
            {(b.reschedule_count ?? 0) > 0 && <span className="rounded-full bg-bg px-2.5 py-1 text-ink-2">غُيّر الموعد <span className="num">{b.reschedule_count}</span></span>}
            {b.cancel_reason && <span className="text-danger-strong">{b.cancel_reason}</span>}
            {b.cancel_resolution && <span className="rounded-full bg-bg px-2.5 py-1 text-ink-2">{{ credit: "المبلغ رصيد في محفظتك", rebooked: "أُعيد حجزك على أقرب موعد", refunded: "استُرجع المبلغ إلى وسيلة الدفع" }[b.cancel_resolution] ?? "—"}</span>}
          </div>
          {b.cancel_options_pending && <Button size="md" icon="wallet" onClick={() => setOptions(b)}>أُلغي موعدك من الطبيب: اختر ما تريد بمبلغك</Button>}
          {b.status === "cancelled" && b.cancelled_by !== "patient" && b.payment_status === "unpaid" && !b.cancel_options_pending && b.date >= today &&
            <Button size="md" variant="ghost" icon="calendar-plus" onClick={() => go("home")}>ألغى الطبيب موعدك: احجز موعداً جديداً</Button>}
          {scope === "upcoming" && (b.status === "booked" || b.status === "checked_in") && <DirectionsButton compact directions={branches.data?.items.find((x) => x.branch_id === b.branch_id)?.directions} name={b.branch_name ?? undefined} className="self-start" />}
          {scope === "upcoming" && b.status === "booked" && b.date === today && <Button size="md" icon="scan-qr-code" onClick={() => setCheckin(b)}>أنا في المجمع، تأكيد حضوري</Button>}
          {scope === "upcoming" && b.status === "booked" && <QrToggle value={`booking:${b.booking_id}`} label={b.ticket_number ?? String(b.sequence_number)} hint="اعرض الرمز في الاستقبال لتثبيت حضورك" />}
          {scope === "upcoming" && b.status === "booked" && b.payment_status === "deposit_paid" && <span className="sub flex items-start gap-1.5"><Icon name="info" size={17} className="mt-0.5 shrink-0 text-primary" />العربون مدفوع، والمتبقي يُدفع في الاستقبال.</span>}
          {scope === "upcoming" && b.status === "booked" && (
            <div className="flex flex-wrap gap-2">
              {b.payment_status === "unpaid" && b.payment_options.includes("pay_full_online") && <Button size="md" className="flex-1" icon="credit-card" onClick={async () => { try { const r = await payOnline({ purpose: "booking_full", patient_id: b.patient_id, booking_id: b.booking_id, label: `كشفية ${b.doctor_name}` }); toast[r.status === "succeeded" ? "success" : "warn"](r.status === "succeeded" ? "تم الدفع" : "لم يكتمل الدفع"); void qc.invalidateQueries({ queryKey: ["p", "bookings"] }); } catch (e) { toast.error(errorMessage(e)); } }}>ادفع <span className="num">{fmtIqd(b.price)}</span></Button>}
              <Button size="md" variant="ghost" className="flex-1" icon="calendar-clock" onClick={() => setResched(b)}>تغيير الموعد</Button>
              <Button size="md" variant="ghost" className="flex-1" icon="calendar-x" onClick={() => setCancel(b)}>إلغاء</Button>
            </div>
          )}
        </div>
      ))}
      {cancel && <CancelDialog client={patientApi} mode="patient" bookingId={cancel.booking_id} onClose={() => setCancel(null)} onDone={() => { setCancel(null); refresh(); }} />}
      {resched && <RescheduleDialog client={patientApi} mode="patient" booking={resched} onClose={() => setResched(null)} onDone={() => { setResched(null); refresh(); }} />}
      {options && <DoctorCancelOptions bookingId={options.booking_id} onClose={() => setOptions(null)} onDone={() => { setOptions(null); refresh(); }} />}
      {focusOptions && !options && <DoctorCancelOptions bookingId={focusOptions} onClose={() => onFocusDone?.()} onDone={() => { onFocusDone?.(); refresh(); }} />}
      {checkin && <SelfCheckInDialog bookingId={checkin.booking_id} who={user.patients.length > 1 ? checkin.patient_name : undefined} onClose={() => setCheckin(null)} onDone={refresh} onOpenQueue={() => { setCheckin(null); go("queue"); }} />}
    </>
  );
}

// ------------------------------------------------------------------ طابوري اليوم
type MyTicket = { ticket_id: string; patient_name: string; ticket_number: string; status: string; queue_position: number | null; patients_ahead: number | null; estimated_time: string | null; doctor_name: string; clinic_name: string; floor: number | null; called_at: string | null; call_acknowledged_at: string | null; on_the_way_at: string | null };
function MyQueue() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["p", "tickets"], queryFn: () => patientApi.get<{ items: MyTicket[] }>("/me/queue-tickets"), refetchInterval: 15_000 });
  if (q.isPending) return <Spinner />;
  if (!q.data?.items.length) return <Empty icon="ticket" title="لا يوجد دور لك اليوم" hint="يظهر هنا رقمك ومن أمامك بعد تثبيت حضورك من «حجوزاتي» أو في الاستقبال." />;
  return (<>{q.data.items.map((t) => {
    const called = t.status === "called";
    return (
      <div key={t.ticket_id} className={`flex flex-col items-center gap-3 rounded-3xl p-6 text-center ${called ? "bg-warn text-white dark:bg-warn-soft dark:ring-1 dark:ring-warn/50" : "bg-surface"}`}>
        <span className="sub-sm" style={called ? { color: "inherit" } : undefined}>{t.patient_name} · {t.doctor_name}</span>
        <span className="num text-6xl font-bold">{t.ticket_number}</span>
        {called ? <>
          <span className="text-xl font-bold">تفضل للدخول</span><span className="text-base">{t.clinic_name}{t.floor != null ? ` · الطابق ${t.floor}` : ""}</span>
          {!t.call_acknowledged_at ? <button onClick={async () => { try { await patientApi.post(`/me/queue-tickets/${t.ticket_id}/acknowledge-call`); void qc.invalidateQueries({ queryKey: ["p", "tickets"] }); } catch (e) { toast.error(errorMessage(e)); } }} className="h-14 w-full rounded-full bg-white text-lg font-bold text-warn-strong">أنا قادم</button>
            : <span className="flex items-center gap-1.5 rounded-full bg-white/25 px-4 py-2 text-base"><Icon name="circle-check" size={16} />أُبلغ الطبيب أنك قادم</span>}
        </> : t.status === "in_room" ? <span className="text-lg font-bold text-primary">أنت في غرفة الطبيب</span> : t.status === "completed" ? <span className="text-success-strong">انتهت زيارتك</span> : <>
          <span className="text-lg">عدد من أمامك: <b className="num">{t.patients_ahead ?? 0}</b></span>
          <span className="sub">الدخول التقريبي <b className="num">{fmtTime(t.estimated_time)}</b> · {t.clinic_name}{t.floor != null ? ` · الطابق ${t.floor}` : ""}</span>
        </>}
      </div>
    );
  })}</>);
}

/**
 * «حان دورك»: شاشة كاملة فوق التطبيق لأي تذكرة مستدعاة لم يؤكدها المراجع (رقم الدور، الطبيب، العيادة)،
 * مع نغمة متكررة واهتزاز حتى «تم، أنا قادم» (POST /me/queue-tickets/{id}/acknowledge-call)، فيرى الاستقبال «أكّد أنه قادم».
 * تظهر فور فتح التطبيق أو عودته من الخلفية ما دام الاستدعاء قائماً.
 */
function TurnAlert() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["p", "tickets"], queryFn: () => patientApi.get<{ items: MyTicket[] }>("/me/queue-tickets"), refetchInterval: 30_000 });
  const t = q.data?.items.find((x) => x.status === "called" && !x.call_acknowledged_at) ?? null;
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!t) return;
    const stop = startTurnAlarm();
    return stop;
  }, [t?.ticket_id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t) return null;
  const ack = async () => {
    setBusy(true);
    try {
      await patientApi.post(`/me/queue-tickets/${t.ticket_id}/acknowledge-call`, undefined, { idempotencyKey: false });
      toast.success("أُبلغ الاستقبال أنك قادم");
    } catch (e) { toast.error(errorMessage(e)); }
    finally { setBusy(false); void qc.invalidateQueries({ queryKey: ["p", "tickets"] }); void qc.invalidateQueries({ queryKey: ["p", "notifs"] }); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-warn p-6 text-white" role="alertdialog" aria-modal="true" aria-labelledby="turn-title">
      <div className="flex w-full max-w-[400px] flex-col items-center gap-4 text-center">
        <span className="grid size-24 animate-pulse place-items-center rounded-full bg-white/20"><Icon name="bell-ring" size={52} /></span>
        <span id="turn-title" className="text-3xl font-bold">حان دورك</span>
        <span className="sub-sm text-white/90">{t.patient_name}</span>
        <span className="num text-7xl font-bold leading-none">{t.ticket_number}</span>
        <span className="text-xl font-bold">{t.doctor_name}</span>
        <span className="text-lg">{t.clinic_name}{t.floor != null ? ` · الطابق ${t.floor}` : ""}</span>
        <button onClick={ack} disabled={busy} className="mt-4 flex h-16 w-full items-center justify-center gap-2 rounded-full bg-white text-xl font-bold text-warn-strong disabled:opacity-60">
          <Icon name={busy ? "loader-circle" : "footprints"} size={24} className={busy ? "animate-spin" : ""} />تم، أنا قادم
        </button>
      </div>
    </div>
  );
}

/** «كتم صوت الإشعارات» على هذا الجهاز (لا يكتم تنبيه «حان دورك»). */
function MuteNotifs() {
  const [muted, setMuted] = useState(false);
  useEffect(() => { setMuted(isNotifMuted()); }, []);
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface p-3.5">
      <Icon name={muted ? "bell" : "volume-2"} size={20} className="text-primary" />
      <span className="flex flex-1 flex-col"><span className="font-bold">كتم صوت الإشعارات</span><span className="sub-sm">على هذا الجهاز فقط. تنبيه «حان دورك» يبقى بصوت.</span></span>
      <span className="relative inline-flex items-center">
        <input type="checkbox" role="switch" className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0" checked={muted} aria-label="كتم صوت الإشعارات"
          onChange={(e) => { setMuted(e.target.checked); setNotifMuted(e.target.checked); if (!e.target.checked) notifChime(); }} />
        <span className="h-6 w-11 rounded-full bg-line-strong transition-colors duration-base peer-checked:bg-primary peer-focus-visible:ring-4 peer-focus-visible:ring-primary/25" />
        <span className="absolute start-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-base peer-checked:-translate-x-5" />
      </span>
    </label>
  );
}

// ------------------------------------------------------------------ الإشعارات والحساب
function Notifications({ onLink }: { onLink?: (link: { type: string; id: string } | null) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["p", "notifs"], queryFn: () => patientApi.get<{ items: { notification_id: string; type: string; title: string; message: string; link: { type: string; id: string } | null; is_read: boolean; created_at: string }[]; unread_count: number }>("/me/notifications") });
  const read = async (id: string) => { try { await patientApi.post(`/me/notifications/${id}/read`, undefined, { idempotencyKey: false }); void qc.invalidateQueries({ queryKey: ["p", "notifs"] }); } catch { /* يبقى غير مقروء */ } };
  if (q.isPending) return <Spinner />;
  return (<>
    {(q.data?.unread_count ?? 0) > 0 && <button onClick={async () => { await patientApi.post("/me/notifications/read-all"); void qc.invalidateQueries({ queryKey: ["p", "notifs"] }); }} className="self-start text-base font-semibold text-primary">تعليم الكل كمقروء</button>}
    {!q.data?.items.length ? <Empty icon="bell" title="لا توجد إشعارات" /> : q.data.items.map((n) => (
      <div key={n.notification_id} onClick={() => { if (!n.is_read) void read(n.notification_id); }} className={`flex gap-3 rounded-2xl border p-3.5 ${n.is_read ? "border-line bg-surface" : "border-primary/40 bg-primary-soft/40"}`}>
        <Icon name="bell" size={18} className="mt-0.5 text-primary" />
        <span className="flex flex-1 flex-col"><span className="text-base font-bold">{n.title}</span><span className="text-[15px] text-ink-2">{n.message}</span><span className="num text-[13px] text-ink-muted">{fmtDateTime(n.created_at)}</span>
          {n.type === "fast_forward.offer" && n.link?.type === "fast_forward_offer" && <OfferReply offerId={n.link.id} />}
          {n.link?.type === "booking_cancel_options" && <Button size="md" className="mt-2 self-start" icon="wallet" onClick={(e) => { e.stopPropagation(); if (!n.is_read) void read(n.notification_id); onLink?.(n.link); }}>افتح «حجوزاتي» واختر</Button>}
          {n.type === "booking.cancelled" && n.link?.type === "booking" && <Button size="md" variant="ghost" className="mt-2 self-start" icon="calendar-plus" onClick={(e) => { e.stopPropagation(); if (!n.is_read) void read(n.notification_id); onLink?.(n.link); }}>افتح «حجوزاتي»</Button>}
        </span>
      </div>
    ))}
  </>);
}

/** الرد على عرض الحضور المبكر (العقد 7: POST /fast-forward-offers/{id}/respond). الحجز يستنتجه السيرفر من الحساب. */
function OfferReply({ offerId }: { offerId: string }) {
  const qc = useQueryClient();
  const [eta, setEta] = useState(20);
  const [res, setRes] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const REASON: Record<string, string> = { OFFER_TAKEN: "سبقك مريض آخر لهذا الوقت", OFFER_EXPIRED: "انتهت صلاحية العرض", BOOKING_NOT_ACTIVE: "الحجز لم يعد قائماً" };
  async function answer(a: "come_now" | "keep_original") {
    setBusy(true);
    try {
      const r = await patientApi.post<{ accepted: boolean; new_estimated_time: string | null; reason: string | null }>(`/fast-forward-offers/${offerId}/respond`, { answer: a, eta_minutes: a === "come_now" ? eta : undefined });
      setRes(a === "keep_original" ? "سنبقي موعدك كما هو" : r.accepted ? `تم. موعدك الجديد تقريباً ${fmtTime(r.new_estimated_time)}` : REASON[r.reason ?? ""] ?? "تعذر قبول العرض");
      void qc.invalidateQueries({ queryKey: ["p", "tickets"] });
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  if (res) return <span className="mt-1.5 text-[15px] font-semibold text-primary">{res}</span>;
  return (
    <span className="mt-2 flex flex-wrap items-center gap-2">
      <ISelect aria-label="أصل خلال" size="sm" className="min-w-[170px]" searchable={false} value={String(eta)} onChange={(v) => v && setEta(Number(v))}
        options={[10, 20, 30, 45, 60].map((m) => ({ value: String(m), label: `أصل خلال ${m} دقيقة` }))} />
      <button disabled={busy} onClick={() => void answer("come_now")} className="h-9 rounded-full bg-primary px-4 text-[15px] font-bold text-on-accent">سأحضر الآن</button>
      <button disabled={busy} onClick={() => void answer("keep_original")} className="h-9 rounded-full border border-line-strong px-4 text-[15px] font-semibold">ألتزم بموعدي</button>
    </span>
  );
}

type WalletData = { total_balance: number; patients: { patient_id: string; full_name: string; balance: number; entries: { entry_id: string; amount: number; kind_ar: string; created_at: string }[] }[] };

/** المحفظة: الرصيد واضح ومصدر كل حركة (UI-40). */
function Wallet() {
  const q = useQuery({ queryKey: ["p", "wallet"], queryFn: () => patientApi.get<WalletData>("/me/wallet") });
  if (q.isPending) return <Spinner />;
  if (q.isError) return <ErrorState hint={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  const moves = q.data.patients.filter((p) => p.entries.length);
  return (
    <>
      <div className="flex flex-col gap-1 rounded-2xl bg-primary-soft p-5 text-primary-strong">
        <span className="text-base font-semibold">رصيدك في المحفظة</span>
        <span className="num text-[32px] font-bold leading-tight">{fmtIqd(q.data.total_balance)}</span>
        <span className="text-[15px]">يُستخدم تلقائياً عند الدفع في الاستقبال.</span>
      </div>
      {!moves.length ? <Empty icon="wallet" title="لا توجد حركات في المحفظة" hint="تظهر هنا المبالغ المسترجعة والعربون." /> : moves.map((p) => (
        <section key={p.patient_id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-bold">{p.full_name}</h3><span className="num font-bold">{fmtIqd(p.balance)}</span></div>
          {p.entries.map((e) => (
            <div key={e.entry_id} className="flex items-center justify-between gap-3 border-t border-line pt-2 text-[15px]">
              <span className="flex min-w-0 flex-col"><span>{e.kind_ar}</span><span className="num text-[13px] text-ink-muted">{fmtDateTime(e.created_at)}</span></span>
              <span className={`num shrink-0 font-bold ${e.amount >= 0 ? "text-success-strong" : "text-danger-strong"}`}>{e.amount >= 0 ? "+" : "−"}{fmtIqd(Math.abs(e.amount))}</span>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

const REL_AR: Record<string, string> = { self: "أنا", child: "ابن/ابنة", spouse: "زوج/زوجة", parent: "أب/أم", other: "آخر" };
type AccountTab = "family" | "wallet" | "notifs" | "support";
const ACCOUNT_TABS: { key: AccountTab; label: string; icon: string }[] = [
  { key: "family", label: "الملفات", icon: "users-round" }, { key: "wallet", label: "المحفظة", icon: "wallet" },
  { key: "notifs", label: "الإشعارات", icon: "bell" }, { key: "support", label: "الدعم", icon: "message-square" },
];

/** العمر بالسنوات من تاريخ الميلاد (أو بالأشهر للرضيع). الرقم منفصل عن الوحدة ليُعرض بخط الأرقام دون أن ينقلب الترتيب. */
function ageAr(birth: string | null): { n: number | null; unit: string } | null {
  if (!birth) return null;
  const b = new Date(birth + "T00:00:00"), now = new Date();
  const months = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth() - (now.getDate() < b.getDate() ? 1 : 0);
  if (months < 0) return null;
  if (months <= 1) return { n: null, unit: "رضيع" };
  if (months < 24) return { n: months, unit: months <= 10 ? "أشهر" : "شهراً" };
  const y = Math.floor(months / 12);
  return { n: y, unit: y <= 10 ? "سنوات" : "سنة" };
}

/** الحرف الأول من الاسم في دائرة بلون الجنس. */
function Avatar({ p, size = 44 }: { p: Pick<PatientRef, "full_name" | "gender">; size?: number }) {
  const tone = p.gender === "female" ? "bg-info-soft text-info-strong" : "bg-primary-soft text-primary-strong";
  return <span style={{ width: size, height: size }} className={`grid shrink-0 place-items-center rounded-full text-[17px] font-bold ${tone}`} aria-hidden>{p.full_name.trim().charAt(0)}</span>;
}

function Account({ user, initialTab = "family", memberId, onPick, onOpenFile }: {
  user: PatientSessionUser; initialTab?: AccountTab; memberId: string | null; onPick: (id: string) => void; onOpenFile: (id: string) => void;
}) {
  const [tab, setTab] = useState<AccountTab>(initialTab);
  const owner = user.patients.find((p) => p.relation === "self") ?? user.patients[0];
  return (
    <>
      {/* بطاقة الحساب: صاحب الحساب وهاتفه وعدد الملفات */}
      <section className="flex items-center gap-3.5 rounded-2xl bg-surface p-4">
        {owner ? <Avatar p={owner} size={56} /> : <span className="grid size-14 place-items-center rounded-full bg-primary-soft text-primary"><Icon name="user-round" size={24} /></span>}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[18px] font-bold">{owner?.full_name ?? "حسابي"}</span>
          <span className="num flex items-center gap-1.5 text-[15px] text-ink-2" dir="ltr"><Icon name="phone" size={14} className="shrink-0 text-ink-muted" />{user.account.phone_number}</span>
          <span className="mt-1 self-start rounded-full bg-primary-soft px-2.5 py-0.5 text-[13px] font-semibold text-primary-strong">
            {user.patients.length === 1 ? "ملف واحد في الحساب" : <><span className="num">{user.patients.length}</span> ملفات في الحساب</>}
          </span>
        </span>
      </section>

      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-surface p-1" role="tablist" aria-label="أقسام الحساب">
        {ACCOUNT_TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-xl text-[14px] font-semibold transition-colors ${tab === t.key ? "bg-primary text-on-accent" : "text-ink-2 hover:bg-bg"}`}>
            <Icon name={t.icon} size={19} />{t.label}
          </button>
        ))}
      </div>

      {tab === "wallet" ? <Wallet /> : tab === "support" ? <SupportCenter user={user} /> : tab === "notifs" ? <><MuteNotifs /><Notifications /></>
        : <Family user={user} memberId={memberId} onPick={onPick} onOpenFile={onOpenFile} />}

      <Logout />
    </>
  );
}

/** ملفات الحساب: كل فرد ملف طبي مستقل برقمه. الفرد «الحالي» هو من تُعرض حجوزاته وملفه في باقي الشاشات. */
function Family({ user, memberId, onPick, onOpenFile }: { user: PatientSessionUser; memberId: string | null; onPick: (id: string) => void; onOpenFile: (id: string) => void }) {
  const [add, setAdd] = useState(false);
  const many = user.patients.length > 1;
  // صاحب الحساب أولاً ثم بقية الأفراد بترتيب الإضافة
  const list = [...user.patients].sort((a, b) => Number(b.relation === "self") - Number(a.relation === "self"));
  const current = memberId ?? list[0]?.patient_id;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-2 px-1">
        <span className="flex flex-col">
          <h2 className="text-[17px] font-bold">ملفات الحساب</h2>
          <span className="sub-sm">{many ? "اختر الفرد الحالي لتظهر حجوزاته وملفه في باقي الشاشات." : "يمكنك إضافة أفراد عائلتك، ولكل فرد ملف مستقل."}</span>
        </span>
        {!add && <button onClick={() => setAdd(true)} className="flex min-h-10 shrink-0 items-center gap-1 rounded-full bg-primary-soft px-3 text-[14px] font-semibold text-primary-strong"><Icon name="plus" size={16} />إضافة</button>}
      </div>

      {add && <AddMember onDone={() => setAdd(false)} />}

      <ul className="flex flex-col gap-2.5">
        {list.map((p) => {
          const on = many && p.patient_id === current;
          const age = ageAr(p.birth_date);
          return (
            <li key={p.patient_id} className={`flex flex-col rounded-2xl border bg-surface ${on ? "border-primary shadow-[0_0_0_1px_rgb(var(--primary))]" : "border-line"}`}>
              <div className="flex items-center gap-3 p-3.5">
                <Avatar p={p} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-bold">{p.full_name}</span>
                    {on && <span className="rounded-full bg-primary px-2 py-0.5 text-[12px] font-semibold text-on-accent">الحالي</span>}
                    {p.is_banned && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[12px] font-semibold text-danger-strong">موقوف عن الحجز</span>}
                  </span>
                  <span className="sub-sm">
                    {REL_AR[p.relation] ?? "—"}
                    {age && <> · {age.n != null && <span className="num">{age.n}</span>} {age.unit}</>}
                  </span>
                  <span className="sub-sm flex items-center gap-1">رقم الملف <CopyId value={p.file_number} label="نسخ رقم الملف" /></span>
                </span>
              </div>
              {p.is_banned && (
                <div className="flex flex-col gap-2 px-3.5 pb-3">
                  <span className="sub-sm">الحجز موقوف بسبب تكرار الغياب. ادفع عربوناً ليُفك الإيقاف فوراً، ويبقى العربون رصيداً لك.</span>
                  <Button size="md" icon="credit-card" onClick={() => void unban(p.patient_id)}>دفع عربون فك الإيقاف</Button>
                </div>
              )}
              <div className="grid grid-cols-2 border-t border-line">
                <button onClick={() => onOpenFile(p.patient_id)} className="flex min-h-12 items-center justify-center gap-1.5 text-[15px] font-semibold text-primary-strong"><Icon name="folder-open" size={17} />فتح الملف</button>
                {many && !on
                  ? <button onClick={() => { onPick(p.patient_id); toast.success(`${p.full_name.split(" ")[0]} هو الفرد الحالي`); }} className="flex min-h-12 items-center justify-center gap-1.5 border-s border-line text-[15px] font-semibold text-ink-2"><Icon name="user-check" size={17} />اجعله الحالي</button>
                  : <span className="flex min-h-12 items-center justify-center gap-1.5 border-s border-line text-[14px] text-ink-muted"><Icon name="circle-check" size={16} />{many ? "الفرد الحالي" : "صاحب الحساب"}</span>}
              </div>
            </li>
          );
        })}
      </ul>

      {!add && (
        <button onClick={() => setAdd(true)} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-line-strong text-[15px] font-semibold text-ink-2 hover:border-primary hover:text-primary-strong">
          <Icon name="user-round-plus" size={19} />إضافة فرد من العائلة
        </button>
      )}
    </section>
  );
}

async function unban(patientId: string) {
  try {
    const r = await payOnline({ purpose: "unban_deposit", patient_id: patientId, label: "عربون فك الإيقاف" });
    if (r.status !== "succeeded") return;
    toast.success("فُك الإيقاف");
    const l = await patientApi.get<{ items: PatientRef[] }>("/me/patients");
    const s = patientStore.get(); if (s) patientStore.set({ ...s, user: { ...s.user, patients: l.items } });
  } catch (e) { toast.error(errorMessage(e)); }
}

function AddMember({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ full_name: "", gender: "male", birth_date: "", relation: "child" });
  const [busy, setBusy] = useState(false);
  const chip = (on: boolean) => `h-11 rounded-xl border text-[15px] font-semibold ${on ? "border-primary bg-primary-soft text-primary-strong" : "border-line"}`;
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">فرد جديد في الحساب</h3>
        <button onClick={onDone} aria-label="إلغاء" className="grid size-10 place-items-center rounded-full text-ink-muted hover:bg-bg"><Icon name="x" size={18} /></button>
      </div>
      <Field label="الاسم الكامل" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
      <span className="flex flex-col gap-1.5"><span className="text-[14px] font-semibold text-ink-2">الصلة</span>
        <span className="grid grid-cols-4 gap-1.5">{["child", "spouse", "parent", "other"].map((r) => <button key={r} onClick={() => setF({ ...f, relation: r })} className={chip(f.relation === r)}>{REL_AR[r]}</button>)}</span>
      </span>
      <span className="flex flex-col gap-1.5"><span className="text-[14px] font-semibold text-ink-2">الجنس</span>
        <span className="grid grid-cols-2 gap-1.5">{[["male", "ذكر"], ["female", "أنثى"]].map(([k, l]) => <button key={k} onClick={() => setF({ ...f, gender: k })} className={chip(f.gender === k)}>{l}</button>)}</span>
      </span>
      <DateField aria-label="تاريخ الميلاد" size="md" value={f.birth_date} max={todayBaghdad()} startInYears icon="cake" onChange={(v) => setF({ ...f, birth_date: v })} />
      <Button loading={busy} disabled={f.full_name.trim().length < 3 || !f.birth_date} icon="check"
        onClick={async () => { setBusy(true); try { await addPatient(f); toast.success("أُضيف الملف"); onDone(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }}>إضافة الملف</Button>
    </div>
  );
}

/** تسجيل الخروج أسفل الصفحة بعيداً عن الأزرار المتكررة، وبتأكيد حتى لا يُضغط خطأً. */
function Logout() {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const out = async () => { setBusy(true); try { await patientApi.post("/patient-auth/logout"); } catch { /* الجلسة تُمسح محلياً على أي حال */ } patientStore.clear(); };
  return (
    <section className="mt-2 flex flex-col gap-2 border-t border-line pt-4">
      {!ask ? (
        <button onClick={() => setAsk(true)} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-[15px] font-semibold text-danger-strong hover:border-danger">
          <Icon name="log-out" size={18} />تسجيل الخروج
        </button>
      ) : (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-danger bg-surface p-4">
          <span className="font-semibold">تسجيل الخروج من هذا الجهاز؟</span>
          <span className="sub-sm">تبقى حجوزاتك وملفاتك كما هي، وتدخل مرة أخرى برقم هاتفك ورمز التحقق.</span>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => setAsk(false)}>إلغاء</Button>
            <button disabled={busy} onClick={() => void out()} className="flex min-h-12 items-center justify-center gap-1.5 rounded-full bg-danger text-[15px] font-bold text-on-accent disabled:opacity-60"><Icon name={busy ? "loader-circle" : "log-out"} size={17} className={busy ? "animate-spin" : ""} />خروج</button>
          </div>
        </div>
      )}
    </section>
  );
}


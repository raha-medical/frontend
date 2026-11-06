"use client";
/** تطبيق المريض — Patient App.dc.html (هاتف 360×760). العقد: مصادقة المريض، 5 الحجز، 6 الدفع الإلكتروني، 7 طابوري، 11 الزيارات، 18 الإشعارات. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "@/components/toast";
import { Alert, Badge, Button, DateField, DoctorPhoto, Empty, Field, ISelect, Spinner } from "@/components/ui";
import { patientApi, patientStore } from "@/lib/api/staff";
import type { PatientRef, PatientSessionUser } from "@/lib/api/types";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { fmtDate, fmtDateTime, fmtDayMonth, fmtNum, fmtTime, fmtTimeRange, fmtTimesInText } from "@/lib/format";
import { addDays, todayBaghdad, weekdayAr } from "@/lib/date";
import { uuidv7 } from "@/lib/id";
import { MOCK_IMAGES } from "@/lib/mock-images";
import { LiveConnection } from "@/lib/realtime/live";
import { CancelDialog, RescheduleDialog } from "@/components/booking/policy-dialogs";
import { SelfCheckInDialog } from "./self-checkin";
import { DoctorCancelOptions, SupportCenter } from "./support";
import { AssistantButton } from "./assistant";
import { MedicalFile } from "./file";
import { DirectionsButton, LocationPrompt, fmtDistance, useGeo, useNearest } from "./location";
import { type OPay, payOnline, pub } from "./shared";
import { Splash } from "./splash";
import type { PBooking, PBranch } from "./types";

type Tab = "home" | "bookings" | "queue" | "records" | "notifications" | "account";

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
    const live = new LiveConnection(() => patientApi.getAccessToken());
    const refresh = () => { void qc.invalidateQueries({ queryKey: ["p", "tickets"] }); void qc.invalidateQueries({ queryKey: ["p", "bookings"] }); void qc.invalidateQueries({ queryKey: ["p", "notifs"] }); void qc.invalidateQueries({ queryKey: ["p", "file"] }); };
    ["my_queue.updated", "booking.changed", "eta.changed", "notification.created"].forEach((ev) => live.on(ev, refresh));
    live.onReconnected(refresh);
    void live.start();
    return () => { void live.stop(); };
  }, [enabled, qc]);
}

const MEMBER_KEY = "rahma.patient.member";

function Shell() {
  const { ready, s } = useSession();
  const [tab, setTab] = useState<Tab>("home");
  const [accountTab, setAccountTab] = useState<"family" | "support">("family");
  const user = s?.user;
  usePatientLive(!!user);
  // الفرد المختار في الحساب: يبقى في كل الشاشات وبعد إعادة الفتح (تفضيل محلي فقط)
  const [memberId, setMemberId] = useState<string | null>(null);
  useEffect(() => { try { setMemberId(localStorage.getItem(MEMBER_KEY)); } catch { /* */ } }, []);
  const member = user?.patients.find((p) => p.patient_id === memberId) ?? user?.patients.find((p) => p.relation === "self") ?? user?.patients[0] ?? null;
  const pickMember = useCallback((id: string) => { setMemberId(id); try { localStorage.setItem(MEMBER_KEY, id); } catch { /* */ } }, []);
  // Splash ترحيبية سريعة عند بدء التطبيق لصاحب جلسة محفوظة فقط، فمن يدخل الآن برمز التحقق ليس زائراً عائداً
  const [splash, setSplash] = useState(true);
  const endSplash = useCallback(() => setSplash(false), []);
  useEffect(() => { if (ready && !user) setSplash(false); }, [ready, user]);
  return (
    <div className="scale-patient flex min-h-dvh justify-center bg-bg text-body">
      {ready && !!user && splash && <Splash name={member?.full_name ?? null} onDone={endSplash} />}
      <div className="relative flex w-full max-w-[440px] flex-col bg-bg sm:my-6 sm:min-h-[760px] sm:rounded-[32px] sm:border sm:border-line sm:shadow-card">
        <header className="glass-bar sticky top-2 z-20 mx-2 mt-2 flex items-center gap-2.5 rounded-2xl px-4 py-3">
          <BrandMark size={34} />
          <span className="flex flex-1 flex-col"><span className="text-[17px] font-bold">مجمع الرحمة</span><span className="sub-sm">{user ? member?.full_name ?? user.account.phone_number : "تطبيق المرضى"}</span></span>
          {user && user.patients.length > 0 && <PatientBell active={tab === "notifications"} onOpen={() => setTab("notifications")} />}
          <ThemeToggle />
        </header>
        <main className="enter flex flex-1 flex-col gap-4 px-4 pb-44 pt-4">
          {!ready ? <Spinner /> : !user ? <Login /> : !user.patients.length ? <CreateProfile /> : (
            <>
              {tab === "home" && <Home user={user} memberId={member?.patient_id ?? null} go={setTab} />}
              {tab === "bookings" && <Bookings user={user} go={setTab} />}
              {tab === "queue" && <MyQueue />}
              {tab === "records" && member && <MedicalFile user={user} patientId={member.patient_id} onSwitch={pickMember} />}
              {tab === "notifications" && <Notifications />}
              {tab === "account" && <Account user={user} initialTab={accountTab} />}
            </>
          )}
        </main>
        {user && user.patients.length > 0 && (
          <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[440px] px-2 pb-2">
            <nav className="glass-bar grid grid-cols-5 rounded-2xl px-1 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5" aria-label="التنقل">
              {([["home", "الرئيسية", "house"], ["bookings", "حجوزاتي", "calendar-days"], ["queue", "طابوري", "ticket"], ["records", "ملفي", "folder-heart"], ["account", "حسابي", "user-round"]] as const).map(([k, l, i]) => (
                <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined} className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl text-[13px] font-semibold ${tab === k ? "text-primary" : "text-ink-3"}`}><Icon name={i} size={21} />{l}</button>
              ))}
            </nav>
          </div>
        )}
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
  return (
    <div className="flex flex-col gap-4 pt-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="grid place-items-center rounded-full bg-primary-soft/60 p-4"><BrandMark size={120} /></span>
        <span className="text-2xl font-bold">أهلاً بك في الرحمة</span><span className="sub">ادخل برقم هاتفك لتحجز موعدك وتتابع دورك ونتائجك. أول دخول ينشئ حسابك تلقائياً.</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={MOCK_IMAGES.patientWelcome.src} alt={MOCK_IMAGES.patientWelcome.alt} decoding="async" sizes="320px" className="mt-1 aspect-[16/10] w-full max-w-[320px] rounded-3xl bg-primary-soft object-cover" />
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
    </div>
  );
}

/**
 * صندوق الوضع التجريبي (Sandbox): لا مزوّد SMS بعد، فالخادم يعيد الرمز في الاستجابة (sandbox_code)
 * ويظهر هنا ليكمل المريض الدخول. يظهر فقط حين يرسل الخادم الرمز، والخادم يرفض ذلك في الإنتاج.
 */
function SandboxCode({ code, onUse }: { code: string; onUse: () => void }) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-warn bg-warn-soft px-4 py-3.5 text-center">
      <span className="flex items-center gap-1.5 text-sm font-bold text-warn-strong"><Icon name="flask-round" size={15} />الوضع التجريبي (Sandbox) · لا تُرسل رسائل SMS حالياً</span>
      <span className="text-base text-ink-2">رمز التحقق الخاص بك:</span>
      <span className="num text-4xl font-bold tracking-[.3em] text-ink" dir="ltr">{code}</span>
      <button type="button" onClick={onUse} className="flex items-center gap-1.5 rounded-full bg-surface px-4 py-1.5 text-base font-semibold text-primary hover:bg-primary-soft">
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
type PDoctor = { doctor_id: string; full_name: string; specialty: string; job_title: string | null; clinic_name: string; photo_url: string | null; new_visit_price: number | null; follow_up_price: number | null };
type Day = { date: string; session_id: string; start: string; end: string; online_remaining: number; next_sequence_number: number; next_estimated_time: string | null; status: string; cancel_reason: string | null };

function Home({ user, memberId, go }: { user: PatientSessionUser; memberId: string | null; go: (t: Tab) => void }) {
  const tickets = useQuery({ queryKey: ["p", "tickets"], queryFn: () => patientApi.get<{ items: MyTicket[] }>("/me/queue-tickets"), refetchInterval: 30_000 });
  const branches = useQuery({ queryKey: ["p", "branches"], queryFn: () => pub<{ items: PBranch[] }>("/public/branches") });
  const [branch, setBranch] = useState<PBranch | null>(null);
  const [doctor, setDoctor] = useState<PDoctor | null>(null);
  const geo = useGeo();
  const near = useNearest(branches.data?.items, geo.pos);
  const banned = user.patients.find((p) => p.is_banned);
  if (doctor && branch) return <BookDoctor user={user} memberId={memberId} doctor={doctor} branch={branch} onBack={() => setDoctor(null)} onDone={() => { setDoctor(null); setBranch(null); go("bookings"); }} />;
  if (branch) return <BranchDoctors b={branch} onBack={() => setBranch(null)} onPick={setDoctor} />;
  const active = tickets.data?.items.find((t) => ["waiting", "arrived", "called", "in_room"].includes(t.status));
  return (
    <>
      {banned && <Alert tone="danger" icon="ban">ملف {banned.full_name} محظور بسبب تكرار الغياب. ادفع عربون فك الحظر من «حسابي».</Alert>}
      {active && (
        <button onClick={() => go("queue")} className={`flex items-center gap-3 rounded-3xl p-4 text-start text-white ${active.status === "called" ? "bg-warn dark:bg-warn-soft" : "bg-primary dark:bg-primary-soft"} dark:ring-1 dark:ring-white/10`}>
          <span className="num grid size-14 place-items-center rounded-2xl bg-white/20 text-lg font-bold">{active.ticket_number}</span>
          <span className="flex flex-1 flex-col"><span className="font-bold">{active.status === "called" ? "تفضل للدخول الآن" : `أمامك ${active.patients_ahead ?? 0} مريض`}</span><span className="text-[15px] text-white/85">{active.doctor_name} · الدخول التقريبي <span className="num">{fmtTime(active.estimated_time)}</span></span></span>
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

function Back({ onBack, title }: { onBack: () => void; title: string }) {
  return <div className="flex items-center gap-2"><button onClick={onBack} aria-label="رجوع" className="grid size-10 place-items-center rounded-full bg-surface"><Icon name="arrow-right" size={18} /></button><span className="text-lg font-bold">{title}</span></div>;
}

function BranchDoctors({ b, onBack, onPick }: { b: PBranch; onBack: () => void; onPick: (d: PDoctor) => void }) {
  const [spec, setSpec] = useState("");
  const q = useQuery({ queryKey: ["p", "docs", b.branch_id], queryFn: () => pub<{ items: PDoctor[] }>(`/public/branches/${b.branch_id}/doctors`) });
  const specs = useMemo(() => [...new Set((q.data?.items ?? []).map((d) => d.specialty))], [q.data]);
  return (
    <>
      <Back onBack={onBack} title={b.name} />
      {(b.address || b.working_hours || b.latitude != null) && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 text-[15px]">
          {b.address && <span className="flex items-center gap-1.5"><Icon name="map-pin" size={14} className="text-primary" />{b.address}</span>}
          {b.working_hours && <span className="flex items-center gap-1.5"><Icon name="clock" size={14} className="text-primary" />{fmtTimesInText(b.working_hours)}</span>}
          <DirectionsButton compact directions={b.directions} name={b.name} className="ms-auto" />
        </div>
      )}
      {specs.length > 1 && <ISelect aria-label="الاختصاص" size="md" placeholder="كل الاختصاصات" value={spec} onChange={setSpec} clearable options={specs.map((s) => ({ value: s, label: s, icon: "stethoscope" }))} />}
      {q.isPending ? <Spinner /> : !q.data?.items.length ? <Empty icon="stethoscope" title="لا يوجد أطباء متاحون" /> : q.data.items.filter((d) => !spec || d.specialty === spec).map((d) => (
        <button key={d.doctor_id} onClick={() => onPick(d)} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <DoctorPhoto src={d.photo_url} name={d.full_name} textClass="text-2xl" className="size-16 rounded-2xl" />
          <span className="flex flex-1 flex-col"><span className="font-bold">{d.full_name}</span><span className="sub-sm">{d.specialty}{d.job_title ? ` · ${d.job_title}` : ""}</span><span className="sub-sm">{d.clinic_name}</span></span>
          {d.new_visit_price != null && <span className="flex shrink-0 flex-col items-end text-primary"><span className="num text-base font-bold">{fmtNum(d.new_visit_price)}</span><span className="text-[13px]">د.ع</span></span>}
        </button>
      ))}
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
  if (booking) return <PayBooking b={booking} branch={branch} onDone={onDone} />;
  return (
    <>
      <Back onBack={onBack} title={doctor.full_name} />
      <span className="sub">{doctor.specialty} · {doctor.clinic_name}{doctor.new_visit_price != null ? <> · كشف <span className="num">{fmtNum(doctor.new_visit_price)}</span> د.ع</> : null}</span>
      {user.patients.length > 1 && <div className="flex gap-1.5 overflow-x-auto">{user.patients.map((p) => <button key={p.patient_id} onClick={() => setPid(p.patient_id)} className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-semibold ${pid === p.patient_id ? "border-primary bg-primary text-on-accent" : "border-line bg-surface"}`}>{p.full_name}</button>)}</div>}
      <span className="font-bold">اختر اليوم</span>
      {q.isPending ? <Spinner /> : !q.data?.days.length ? <Empty icon="calendar-off" title="لا توجد أيام متاحة" /> : (
        <div className="grid grid-cols-3 gap-2">{q.data.days.map((d) => {
          const ok = d.status === "open" && d.online_remaining > 0;
          return (
            <button key={d.session_id} disabled={!ok} onClick={() => setDay(d)} className={`flex flex-col items-center gap-0.5 rounded-2xl border-[1.5px] p-2.5 disabled:opacity-45 ${day?.session_id === d.session_id ? "border-primary bg-primary-soft" : "border-line bg-surface"}`}>
              <span className="text-sm font-semibold">{d.date === from ? "اليوم" : weekdayAr(d.date)}</span><span className="num text-base font-bold">{fmtDayMonth(d.date)}</span>
              <span className="num text-[13px] text-ink-2">{fmtTimeRange(d.start, d.end)}</span>
              <span className={`text-[14px] ${ok ? "text-success-strong" : "text-danger-strong"}`}>{d.status === "full" || !d.online_remaining ? "ممتلئ" : d.status === "cancelled" ? "ملغى" : d.status === "closed" ? "مغلق" : `متبقي ${d.online_remaining}`}</span>
            </button>
          );
        })}</div>
      )}
      {day && (
        <div className="flex flex-col gap-2 rounded-2xl bg-surface p-4">
          <span className="text-base">دورك المتوقع <b className="num">#{day.next_sequence_number}</b> · الدخول التقريبي <b className="num">{fmtTime(day.next_estimated_time)}</b></span>
          <Button loading={busy} icon="calendar-check" onClick={async () => {
            setBusy(true);
            try { const nb = await patientApi.post<PBooking>("/bookings", { booking_id: key, patient_id: pid, session_id: day.session_id, visit_kind: "auto" }, { idempotencyKey: key }); setBooking(nb); nb.warnings?.forEach((w) => toast.warn(w.message)); }
            catch (e) { toast.error(isApiError(e) && e.code === "PATIENT_BANNED" ? "الملف محظور. ادفع عربون فك الحظر أولاً." : errorMessage(e)); } finally { setBusy(false); }
          }}>تأكيد الحجز</Button>
        </div>
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
      <div className="flex flex-col items-center gap-2 rounded-3xl bg-success-soft p-5 text-center text-success-strong"><Icon name="circle-check" size={40} /><span className="text-lg font-bold">تم الحجز</span>
        <span className="text-base">{b.doctor_name} · <span className="num">{fmtDate(b.date)}</span> · دورك <b className="num">#{b.sequence_number}</b></span></div>
      {res ? <Alert tone={res.status === "succeeded" ? "success" : "danger"}>{res.status === "succeeded" ? <>تم الدفع · إيصال <b className="num">{res.receipt?.receipt_number}</b></> : res.status === "pending" ? "لم يكتمل الدفع بعد. يمكنك الدفع من «حجوزاتي»." : "فشل الدفع. حاول مرة أخرى أو ادفع في الاستقبال."}</Alert> : (
        <>
          <span className="text-base font-semibold">الدفع (اختياري)</span>
          {b.payment_options.includes("pay_full_online") && <Button loading={busy === "full"} icon="credit-card" onClick={async () => { setBusy("full"); try { setRes(await payOnline({ purpose: "booking_full", patient_id: b.patient_id, booking_id: b.booking_id })); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); } }}>دفع الكشفية كاملة · <span className="num">{fmtNum(b.price)}</span></Button>}
          {b.payment_options.includes("pay_deposit_online") && <Button variant="ghost" loading={busy === "dep"} icon="piggy-bank" onClick={async () => { setBusy("dep"); try { setRes(await payOnline({ purpose: "booking_deposit", patient_id: b.patient_id, booking_id: b.booking_id })); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); } }}>دفع عربون فقط</Button>}
        </>
      )}
      <DirectionsButton directions={branch.directions} name={branch.name} />
      <Button variant="ghost" icon="calendar-days" onClick={onDone}>{res ? "حجوزاتي" : "الدفع في الاستقبال"}</Button>
    </div>
  );
}

// ------------------------------------------------------------------ حجوزاتي
function Bookings({ user, go }: { user: PatientSessionUser; go: (t: Tab) => void }) {
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");
  const qc = useQueryClient();
  const [cancel, setCancel] = useState<PBooking | null>(null);
  const [resched, setResched] = useState<PBooking | null>(null);
  const [checkin, setCheckin] = useState<PBooking | null>(null);
  const [options, setOptions] = useState<PBooking | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["p", "bookings"] }); void qc.invalidateQueries({ queryKey: ["p", "tickets"] }); };
  const today = todayBaghdad();
  const q = useQuery({ queryKey: ["p", "bookings", scope], queryFn: () => patientApi.get<{ items: PBooking[] }>("/bookings/my", { scope }) });
  const branches = useQuery({ queryKey: ["p", "branches"], queryFn: () => pub<{ items: PBranch[] }>("/public/branches") });
  return (
    <>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1">{(["upcoming", "past"] as const).map((s) => <button key={s} onClick={() => setScope(s)} className={`h-10 rounded-xl text-base font-semibold ${scope === s ? "bg-primary text-on-accent" : "text-ink-2"}`}>{s === "upcoming" ? "القادمة" : "السابقة"}</button>)}</div>
      {q.isPending ? <Spinner /> : !q.data?.items.length ? <Empty icon="calendar-days" title="لا توجد حجوزات" /> : q.data.items.map((b) => (
        <div key={b.booking_id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2"><span className="flex flex-1 flex-col"><span className="font-bold">{b.doctor_name}</span><span className="sub-sm">{b.patient_name}{b.branch_name ? ` · ${b.branch_name}` : ""}</span></span><span className="num rounded-chip bg-primary-soft px-2 py-1 text-base font-bold text-primary-strong">#{b.sequence_number}</span></div>
          <span className="text-[15px]"><span className="num">{fmtDate(b.date)}</span> · الدخول التقريبي <span className="num">{fmtTime(b.estimated_time)}</span></span>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className={`rounded-full px-2.5 py-1 ${b.status === "cancelled" ? "bg-bg text-ink-3" : "bg-info-soft text-info-strong"}`}>{{ booked: "محجوز", cancelled: "ملغى", checked_in: "حضر", completed: "مكتمل", no_show: "غياب" }[b.status] ?? b.status}</span>
            <span className={`rounded-full px-2.5 py-1 ${b.payment_status === "paid" ? "bg-success-soft text-success-strong" : b.payment_status === "deposit_paid" ? "bg-info-soft text-info-strong" : "bg-warn-soft text-warn-strong"}`}>{{ paid: "مدفوع", deposit_paid: "عربون مدفوع", unpaid: "غير مدفوع", credited: "رصيد في المحفظة", refunded: "مُسترجع" }[b.payment_status] ?? b.payment_status}</span>
            {b.check_in_method && <span className="rounded-full bg-success-soft px-2.5 py-1 text-success-strong">{b.check_in_method === "self_qr" ? "ثُبت حضورك من التطبيق" : "ثُبت حضورك في الاستقبال"}</span>}
            {(b.reschedule_count ?? 0) > 0 && <span className="rounded-full bg-bg px-2.5 py-1 text-ink-2">غُيّر الموعد <span className="num">{b.reschedule_count}</span></span>}
            {b.cancel_reason && <span className="text-danger-strong">{b.cancel_reason}</span>}
            {b.cancel_resolution && <span className="rounded-full bg-bg px-2.5 py-1 text-ink-2">{{ credit: "المبلغ رصيد في محفظتك", rebooked: "أُعيد حجزك على أقرب موعد", refunded: "استُرجع المبلغ إلى وسيلة الدفع" }[b.cancel_resolution] ?? b.cancel_resolution}</span>}
          </div>
          {b.cancel_options_pending && <Button size="md" icon="wallet" onClick={() => setOptions(b)}>ألغى الطبيب موعدك: اختر ما تريد بمبلغك</Button>}
          {scope === "upcoming" && (b.status === "booked" || b.status === "checked_in") && <DirectionsButton compact directions={branches.data?.items.find((x) => x.branch_id === b.branch_id)?.directions} name={b.branch_name ?? undefined} className="self-start" />}
          {scope === "upcoming" && b.status === "booked" && b.date === today && <Button size="md" icon="scan-qr-code" onClick={() => setCheckin(b)}>أنا في المجمع، تأكيد حضوري</Button>}
          {scope === "upcoming" && b.status === "booked" && b.date !== today && <span className="sub flex items-start gap-1.5"><Icon name="scan-qr-code" size={17} className="mt-0.5 shrink-0 text-primary" />يوم موعدك امسح الرمز على شاشة الانتظار لتأكيد حضورك.</span>}
          {scope === "upcoming" && b.status === "booked" && (
            <div className="flex flex-wrap gap-2">
              {b.payment_status === "unpaid" && b.payment_options.includes("pay_full_online") && <Button size="md" className="flex-1" icon="credit-card" onClick={async () => { try { const r = await payOnline({ purpose: "booking_full", patient_id: b.patient_id, booking_id: b.booking_id }); toast[r.status === "succeeded" ? "success" : "warn"](r.status === "succeeded" ? "تم الدفع" : "لم يكتمل الدفع"); void qc.invalidateQueries({ queryKey: ["p", "bookings"] }); } catch (e) { toast.error(errorMessage(e)); } }}>ادفع <span className="num">{fmtNum(b.price)}</span> د.ع</Button>}
              <Button size="md" variant="ghost" className="flex-1" icon="calendar-clock" onClick={() => setResched(b)}>تغيير الموعد</Button>
              <Button size="md" variant="ghost" className="flex-1" icon="calendar-x" onClick={() => setCancel(b)}>إلغاء</Button>
            </div>
          )}
        </div>
      ))}
      {cancel && <CancelDialog client={patientApi} mode="patient" bookingId={cancel.booking_id} onClose={() => setCancel(null)} onDone={() => { setCancel(null); refresh(); }} />}
      {resched && <RescheduleDialog client={patientApi} mode="patient" booking={resched} onClose={() => setResched(null)} onDone={() => { setResched(null); refresh(); }} />}
      {options && <DoctorCancelOptions bookingId={options.booking_id} onClose={() => setOptions(null)} onDone={() => { setOptions(null); refresh(); }} />}
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
          <span className="text-lg">أمامك <b className="num">{t.patients_ahead ?? 0}</b> مريض</span>
          <span className="sub">الدخول التقريبي <b className="num">{fmtTime(t.estimated_time)}</b> · {t.clinic_name}{t.floor != null ? ` · الطابق ${t.floor}` : ""}</span>
        </>}
      </div>
    );
  })}</>);
}

// ------------------------------------------------------------------ الإشعارات والحساب
function Notifications() {
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

function Account({ user, initialTab = "family" }: { user: PatientSessionUser; initialTab?: "family" | "notifs" | "support" }) {
  const [add, setAdd] = useState(false);
  const [f, setF] = useState({ full_name: "", gender: "male", birth_date: "", relation: "child" });
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"family" | "notifs" | "support">(initialTab);
  const REL: Record<string, string> = { self: "أنا", child: "ابن/ابنة", spouse: "زوج/زوجة", parent: "أب/أم", other: "آخر" };
  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl bg-surface p-4"><span className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary"><Icon name="user-round" size={22} /></span><span className="flex flex-1 flex-col"><span className="font-bold">حسابي</span><span className="num text-base text-ink-2" dir="ltr">{user.account.phone_number}</span></span>
        <button onClick={async () => { try { await patientApi.post("/patient-auth/logout"); } catch { /* */ } patientStore.clear(); }} className="flex min-h-11 items-center gap-1 px-2 text-base font-semibold text-danger"><Icon name="log-out" size={16} />خروج</button></div>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">{(["family", "notifs", "support"] as const).map((s) => <button key={s} onClick={() => setTab(s)} className={`h-10 rounded-xl text-base font-semibold ${tab === s ? "bg-primary text-on-accent" : "text-ink-2"}`}>{s === "family" ? "العائلة" : s === "notifs" ? "الإشعارات" : "الدعم"}</button>)}</div>
      {tab === "support" ? <SupportCenter user={user} /> : tab === "notifs" ? <Notifications /> : <>
        {user.patients.map((p) => (
          <div key={p.patient_id} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3.5">
            <div className="flex items-center gap-2"><span className="flex flex-1 flex-col"><span className="font-bold">{p.full_name}</span><span className="sub-sm"><span className="num">{p.file_number}</span> · {REL[p.relation] ?? p.relation}</span></span>{p.is_banned && <span className="rounded-full bg-danger-soft px-2.5 py-1 text-sm text-danger-strong">محظور</span>}</div>
            {p.is_banned && <Button size="md" icon="credit-card" onClick={async () => { try { const r = await payOnline({ purpose: "unban_deposit", patient_id: p.patient_id }); if (r.status === "succeeded") { toast.success("فُك الحظر"); const l = await patientApi.get<{ items: PatientRef[] }>("/me/patients"); const s = patientStore.get(); if (s) patientStore.set({ ...s, user: { ...s.user, patients: l.items } }); } } catch (e) { toast.error(errorMessage(e)); } }}>دفع عربون فك الحظر</Button>}
          </div>
        ))}
        {!add ? <Button variant="ghost" icon="user-round-plus" onClick={() => setAdd(true)}>إضافة فرد من العائلة</Button> : (
          <div className="flex flex-col gap-2.5 rounded-2xl bg-surface p-4">
            <Field label="الاسم الكامل" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
            <div className="grid grid-cols-4 gap-1">{["child", "spouse", "parent", "other"].map((r) => <button key={r} onClick={() => setF({ ...f, relation: r })} className={`h-10 rounded-xl border text-sm font-semibold ${f.relation === r ? "border-primary bg-primary-soft text-primary-strong" : "border-line"}`}>{REL[r]}</button>)}</div>
            <div className="grid grid-cols-2 gap-2">{[["male", "ذكر"], ["female", "أنثى"]].map(([k, l]) => <button key={k} onClick={() => setF({ ...f, gender: k })} className={`h-10 rounded-xl border text-base ${f.gender === k ? "border-primary bg-primary-soft" : "border-line"}`}>{l}</button>)}</div>
            <DateField aria-label="تاريخ الميلاد" size="md" value={f.birth_date} max={todayBaghdad()} startInYears icon="cake" onChange={(v) => setF({ ...f, birth_date: v })} />
            <Button loading={busy} disabled={f.full_name.trim().length < 3 || !f.birth_date} icon="check" onClick={async () => { setBusy(true); try { await addPatient(f); setAdd(false); toast.success("أُضيف"); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }}>إضافة</Button>
          </div>
        )}
      </>}
    </>
  );
}


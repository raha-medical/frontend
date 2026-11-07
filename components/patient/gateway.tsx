"use client";
/**
 * الدفع الإلكتروني (القسم 3.5): اختيار الطريقة ← إنشاء المعاملة ← صفحة البوابة ← التحقق OTP ← العودة ← استعلام الخادم ← النتيجة.
 * في الوضع التجريبي (mock) صفحة البوابة داخل التطبيق وتستدعي /mock-gateway بتوكن المريض. مع بوابة حقيقية (live)
 * يُفتح redirect_url الذي تعيده البوابة، والنتيجة دائماً من POST /online-payments/{id}/verify.
 * علامة «تجريبي» لا تظهر للمراجع (UI-46)، وهذه الصفحات للعرض التجريبي فقط ولا يُخزَّن فيها الرمز السري ولا CVV.
 */
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Icon } from "@/components/icon";
import { QrCode } from "@/components/qr";
import { Alert, Button, CopyId, DetailField, Field, Spinner } from "@/components/ui";
import { useScrollLock } from "@/components/ui/overlay";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { patientApi } from "@/lib/api/staff";
import { fmtDateTime, fmtIqd } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import type { OPay } from "./shared";

type Code = "zaincash" | "qicard";
type Provider = { code: Code; name_ar: string; mode: string };
type Page = {
  reference: string; provider: string; merchant_name: string; amount: number; status: string; step: "credentials" | "otp" | "processing" | "done";
  account_masked: string | null; failure_code: string | null; secret_attempts_left: number; otp_attempts_left: number; otp_length: number;
  otp_expires_at: string | null; otp_resend_at: string | null; otp_resends_left: number; expires_at: string;
  /** البوابة التجريبية فقط: الرمز ونص رسالة SMS التي «أرسلتها» البوابة، لعرضها كإشعار رسالة على الشاشة. */
  sandbox_otp?: string | null; sandbox_sms?: string | null; otp_sent_at?: string | null;
};
/** `label` وصف يظهر في الوصل فقط ولا يُرسل للخادم. */
export type PayBody = { purpose: string; patient_id: string; booking_id?: string; invoice_id?: string; invoice_item_id?: string; label?: string };
type Op = OPay & { provider_reference?: string; failure_code?: string | null; provider?: string; purpose?: string };
type Stuck = { online_payment_id: string; provider_reference: string; provider: string; amount: number };

/** شعارات الشركتين المعتمدة تُوضع هنا. عند غياب الملف يظهر اسم البوابة نصاً. */
const BRAND: Record<Code, { name: string; logo: string; bg: string; hint: string }> = {
  zaincash: { name: "زين كاش", logo: "/gateways/zaincash.png", bg: "bg-gw-zaincash", hint: "ادفع من محفظتك الإلكترونية" },
  qicard: { name: "كي كارد", logo: "/gateways/qicard.png", bg: "bg-gw-qicard", hint: "ادفع ببطاقتك المصرفية" },
};

const PURPOSE_AR: Record<string, string> = {
  booking_full: "دفع الحجز كاملاً", booking_deposit: "عربون الحجز", unban_deposit: "عربون فك إيقاف الحجز", invoice: "دفع فاتورة",
};

const FAIL_AR: Record<string, string> = {
  INSUFFICIENT_FUNDS: "الرصيد غير كافٍ", CARD_DECLINED: "رفض المصرف البطاقة", CARD_EXPIRED: "البطاقة منتهية الصلاحية",
  WRONG_PIN_LIMIT: "تجاوزت محاولات الرمز السري", WRONG_CARD_DATA_LIMIT: "تجاوزت محاولات بيانات البطاقة", OTP_ATTEMPTS_EXCEEDED: "تجاوزت محاولات رمز التحقق",
  CANCELLED_BY_USER: "ألغيت عملية الدفع", TIMEOUT: "انتهت مهلة المعاملة",
};

/** يفتح رحلة الدفع ويعيد حالة الدفعة النهائية كما يراها الخادم بعد الاستعلام (أو null إن أُغلقت قبل إنشاء معاملة). */
export function openGateway(body: PayBody): Promise<OPay | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.className = "gw-host";
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (r: OPay | null) => { resolve(r); setTimeout(() => { root.unmount(); host.remove(); }, 0); };
    root.render(<GatewayFlow body={body} onDone={done} />);
  });
}

function Logo({ code, size = 48 }: { code: Code; size?: number }) {
  const [missing, setMissing] = useState(false);
  const b = BRAND[code];
  if (missing) return <span className={`grid place-items-center rounded-xl px-3 font-bold text-white ${b.bg}`} style={{ height: size }}>{b.name}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={b.logo} alt={b.name} style={{ height: size }} className="w-auto rounded-xl object-contain" onError={() => setMissing(true)} />;
}

function GatewayFlow({ body, onDone }: { body: PayBody; onDone: (r: OPay | null) => void }) {
  const { label, ...request } = body;
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [result, setResult] = useState<Op | null>(null);
  const [stuck, setStuck] = useState<Stuck | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  useScrollLock(true);

  useEffect(() => { patientApi.get<Provider[]>("/online-payments/providers").then(setProviders, setErr); }, []);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e); } finally { setBusy(false); } };
  /** العودة للتطبيق: الخادم يستعلم من البوابة، وهو وحده يقرر النتيجة. */
  const verify = async (id: string) => setResult(await patientApi.post<OPay>(`/online-payments/${id}/verify`, {}));

  async function choose(p: Provider) {
    setBusy(true); setErr(null);
    try {
      const id = uuidv7();
      const created = await patientApi.post<OPay & { provider_reference: string }>("/online-payments", { online_payment_id: id, provider: p.code, ...request }, { idempotencyKey: id });
      setOp({ ...created, provider: p.code });
      if (p.mode === "mock") setPage(await patientApi.get<Page>(`/mock-gateway/${created.provider_reference}`));
      else if (created.redirect_url) window.open(created.redirect_url, "_blank", "noopener");
    } catch (e) {
      // معاملة سابقة لم تكتمل: لا طريق مغلق، يكملها المراجع أو يلغيها الآن
      if (isApiError(e) && e.code === "PAYMENT_PENDING" && typeof e.extra?.provider_reference === "string") {
        setStuck({ online_payment_id: String(e.extra.online_payment_id), provider_reference: e.extra.provider_reference, provider: String(e.extra.provider), amount: Number(e.extra.amount) });
      } else setErr(e);
    } finally { setBusy(false); }
  }

  const resume = () => run(async () => {
    if (!stuck) return;
    const next = await patientApi.get<Page>(`/mock-gateway/${stuck.provider_reference}`);
    setOp({ online_payment_id: stuck.online_payment_id, amount: stuck.amount, status: "pending", redirect_url: null, receipt: null, provider: stuck.provider, provider_reference: stuck.provider_reference });
    setStuck(null);
    setPage(next);
    if (next.status !== "pending") await verify(stuck.online_payment_id);
  });
  const dropStuck = () => run(async () => {
    if (!stuck) return;
    // قد تكون دُفعت في البوابة قبل الإلغاء: عندها يرى المراجع وصله بدل العودة بلا إخبار
    try { await patientApi.post(`/mock-gateway/${stuck.provider_reference}/cancel`, {}); } catch { /* يقرر الاستعلام */ }
    const r = await patientApi.post<Op>(`/online-payments/${stuck.online_payment_id}/verify`, {});
    if (r.status === "succeeded") { setOp({ ...r, provider: stuck.provider }); setResult(r); }
    setStuck(null);
  });

  async function step(path: string, payload: object = {}) {
    if (!op?.provider_reference) return;
    const ref = op.provider_reference;
    setBusy(true); setErr(null);
    try {
      const next = await patientApi.post<Page>(`/mock-gateway/${ref}/${path}`, payload);
      setPage(next);
      if (next.status !== "pending") await verify(op.online_payment_id);
    } catch (e) {
      setErr(e);
      if (isApiError(e) && (e.code === "GATEWAY_TIMEOUT" || e.code === "TRANSACTION_EXPIRED" || e.code === "TRANSACTION_CLOSED")) {
        try { await verify(op.online_payment_id); } catch { /* تبقى الرسالة */ }
      }
    } finally { setBusy(false); }
  }

  const close = () => onDone(result ?? op);
  const code = (page?.provider ?? op?.provider ?? stuck?.provider) as Code | undefined;
  const brand = code ? BRAND[code] : null;
  const showHeader = !!page && !result;

  return (
    <div className="scale-patient fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-bg text-body text-ink" role="dialog" aria-modal="true" aria-label={brand?.name ?? "الدفع الإلكتروني"}>
      <header className={`gw-noprint flex shrink-0 items-center gap-3 px-4 py-3 ${showHeader && brand ? `${brand.bg} text-white` : "border-b border-line bg-surface"}`}>
        {showHeader && code ? <Logo code={code} size={40} /> : <Icon name="lock-keyhole" size={20} className="text-primary" />}
        <span className="flex-1 text-[17px] font-bold">{result ? "نتيجة الدفع" : brand && page ? brand.name : "الدفع الإلكتروني"}</span>
        <button type="button" onClick={close} aria-label="إغلاق" className="grid size-11 place-items-center rounded-full hover:bg-black/10"><Icon name="x" size={21} /></button>
      </header>

      <main className={`mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-4 p-4 pb-[max(env(safe-area-inset-bottom),24px)] ${code ? `gw-${code}` : ""}`}>
        {result ? <ResultView r={{ ...result, provider_reference: result.provider_reference ?? op?.provider_reference, purpose: result.purpose ?? request.purpose }} code={code} label={label} note={err != null ? errorMessage(err) : undefined} onClose={close} /> : stuck ? (
          <div className="flex flex-col gap-3">
            <Alert tone="warn" icon="clock">لديك عملية دفع لم تكتمل عبر {BRAND[stuck.provider as Code]?.name ?? "البوابة"} بمبلغ <span className="num font-bold">{fmtIqd(stuck.amount)}</span>. أكملها أو ألغها لتبدأ من جديد.</Alert>
            <Button loading={busy} icon="play" onClick={resume}>متابعة الدفع</Button>
            <Button variant="ghost" loading={busy} icon="circle-x" onClick={dropStuck}>إلغاء العملية</Button>
          </div>
        ) : !op ? (
          // 1. اختيار طريقة الدفع
          !providers ? (err ? <Alert tone="danger">{errorMessage(err)}</Alert> : <Spinner />) : providers.length === 0 ? <Alert tone="warn">الدفع الإلكتروني غير متاح حالياً. ادفع في الاستقبال.</Alert> : (
            <div className="flex flex-col gap-3">
              <h1 className="text-heading">اختر طريقة الدفع</h1>
              {providers.map((p) => (
                <button key={p.code} type="button" disabled={busy} onClick={() => choose(p)}
                  className="flex min-h-[84px] items-center gap-3.5 rounded-2xl border-[1.5px] border-line bg-surface p-3.5 text-start transition-colors duration-base hover:border-primary disabled:opacity-60">
                  <Logo code={p.code} size={52} />
                  <span className="flex min-w-0 flex-1 flex-col"><span className="font-bold">{BRAND[p.code]?.name ?? p.name_ar}</span><span className="sub">{BRAND[p.code]?.hint}</span></span>
                  <Icon name={busy ? "loader-circle" : "chevron-left"} size={20} className={busy ? "animate-spin text-ink-muted" : "text-ink-muted"} />
                </button>
              ))}
              {err != null && <Alert tone="danger">{errorMessage(err)}</Alert>}
            </div>
          )
        ) : !page ? (
          <div className="flex flex-col gap-3">
            <Alert tone="info">أكمل الدفع في صفحة البوابة ثم ارجع هنا.</Alert>
            <Button loading={busy} onClick={() => run(() => verify(op.online_payment_id))}>تحقق من حالة الدفع</Button>
          </div>
        ) : (
          <>
            <section className="flex flex-col gap-1 rounded-2xl bg-surface p-4">
              <span className="sub">الدفع إلى {page.merchant_name}</span>
              <span className="num text-[30px] font-bold leading-tight">{fmtIqd(page.amount)}</span>
              <span className="sub-sm flex flex-wrap items-center gap-1">المرجع <CopyId value={page.reference} label="نسخ المرجع" /></span>
            </section>
            <Steps step={page.step === "credentials" ? 1 : 2} />
            {page.step === "credentials" ? <Credentials page={page} busy={busy} onSubmit={(v) => step("credentials", v)} />
              : page.step === "otp" ? <Otp page={page} busy={busy} onSubmit={(otp) => step("otp", { otp })} onResend={() => step("otp/resend")} />
              : (
                <div className="flex flex-col gap-3">
                  <Alert tone="warn">البوابة لم تؤكد العملية بعد. لن يُعتبر الحجز مدفوعاً حتى يؤكد الاستعلام.</Alert>
                  <Button loading={busy} onClick={() => run(() => verify(op.online_payment_id))}>تحقق من حالة الدفع</Button>
                </div>
              )}
            {err != null && <Alert tone="danger">{errorMessage(err)}</Alert>}
            {page.status === "pending" && page.step !== "processing" && (
              <button type="button" disabled={busy} onClick={() => step("cancel")} className="min-h-11 text-center text-base font-semibold text-danger-strong disabled:opacity-50">إلغاء الدفع</button>
            )}
            <span className="sub mt-auto flex items-center justify-center gap-1.5 pt-2 text-center"><Icon name="shield-check" size={16} className="shrink-0 text-primary" />لا تشارك الرمز السري أو رمز التحقق مع أي شخص</span>
          </>
        )}
      </main>
    </div>
  );
}

function Steps({ step }: { step: 1 | 2 }) {
  return (
    <ol className="flex items-center gap-2" aria-label="خطوات الدفع">
      {["البيانات", "التحقق"].map((l, i) => {
        const on = i + 1 <= step;
        return <li key={l} className="flex flex-1 items-center gap-2"><span className={`num grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold ${on ? "bg-primary text-on-accent" : "bg-line text-ink-2"}`}>{i + 1}</span><span className={`text-sm font-semibold ${on ? "text-ink" : "text-ink-muted"}`}>{l}</span>{i === 0 && <span className={`h-[2px] flex-1 ${step === 2 ? "bg-primary" : "bg-line"}`} />}</li>;
      })}
    </ol>
  );
}

function Credentials({ page, busy, onSubmit }: { page: Page; busy: boolean; onSubmit: (v: object) => void }) {
  const [wallet, setWallet] = useState(""), [pin, setPin] = useState("");
  const [card, setCard] = useState(""), [expiry, setExpiry] = useState(""), [cvv, setCvv] = useState("");
  const digits = (v: string, n: number) => v.replace(/\D/g, "").slice(0, n);
  const zc = page.provider === "zaincash";
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); onSubmit(zc ? { wallet_number: wallet, pin } : { card_number: card, expiry, cvv }); }}>
      {zc ? <>
        <Field label="رقم المحفظة" icon="smartphone" ltr inputMode="numeric" autoComplete="tel" placeholder="07XXXXXXXXX" value={wallet} onChange={(e) => setWallet(digits(e.target.value, 13))} />
        <Field label="الرمز السري (PIN)" icon="lock" ltr secret inputMode="numeric" autoComplete="off" placeholder="••••" value={pin} onChange={(e) => setPin(digits(e.target.value, 4))} />
      </> : <>
        <Field label="رقم البطاقة" icon="credit-card" ltr inputMode="numeric" autoComplete="cc-number" placeholder="XXXX XXXX XXXX XXXX" value={card} onChange={(e) => setCard(digits(e.target.value, 16).replace(/(\d{4})(?=\d)/g, "$1 "))} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="تاريخ الانتهاء" ltr inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={expiry} onChange={(e) => { const d = digits(e.target.value, 4); setExpiry(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d); }} />
          <Field label="CVV" ltr secret inputMode="numeric" autoComplete="cc-csc" placeholder="•••" value={cvv} onChange={(e) => setCvv(digits(e.target.value, 3))} />
        </div>
      </>}
      {page.secret_attempts_left < 3 && <span className="sub-sm">المحاولات المتبقية <span className="num">{page.secret_attempts_left}</span></span>}
      <Button type="submit" loading={busy} disabled={zc ? wallet.length < 11 || pin.length !== 4 : card.replace(/\s/g, "").length !== 16 || expiry.length !== 5 || cvv.length !== 3}>متابعة</Button>
    </form>
  );
}

function Otp({ page, busy, onSubmit, onResend }: { page: Page; busy: boolean; onSubmit: (otp: string) => void; onResend: () => void }) {
  const [otp, setOtp] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  // رمز جديد (إعادة إرسال) يمسح ما كُتب
  useEffect(() => { setOtp(""); }, [page.otp_sent_at]);
  const resendIn = page.otp_resend_at ? Math.max(0, Math.ceil((Date.parse(page.otp_resend_at) - now) / 1000)) : 0;
  const expiresIn = page.otp_expires_at ? Math.max(0, Math.ceil((Date.parse(page.otp_expires_at) - now) / 1000)) : 0;
  const fill = (code: string) => { setOtp(code); input.current?.focus(); };
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); onSubmit(otp); setOtp(""); }}>
      {page.sandbox_otp && page.sandbox_sms && <SmsNotice key={page.otp_sent_at ?? page.sandbox_otp} page={page} onFill={fill} />}
      <span className="sub">أُرسل رمز تحقق من {page.otp_length} أرقام برسالة SMS إلى صاحب {page.provider === "zaincash" ? "المحفظة" : "البطاقة"} <span className="num" dir="ltr">{page.account_masked}</span></span>
      <Field ref={input} label="رمز التحقق (OTP)" icon="message-square" ltr inputMode="numeric" autoComplete="one-time-code" placeholder={"•".repeat(page.otp_length)} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, page.otp_length))} />
      <span className={`sub-sm flex flex-wrap items-center gap-1.5 ${expiresIn === 0 ? "text-danger-strong" : expiresIn <= 30 ? "text-warn-strong" : ""}`}>
        <Icon name="timer" size={15} className="shrink-0" />
        {expiresIn > 0 ? <>الرمز صالح لمدة <span className="num" dir="ltr">{Math.floor(expiresIn / 60)}:{String(expiresIn % 60).padStart(2, "0")}</span></> : "انتهت صلاحية الرمز، اطلب رمزاً جديداً"}
        {page.otp_attempts_left < 3 && <> · المحاولات المتبقية <span className="num">{page.otp_attempts_left}</span></>}
      </span>
      <Button type="submit" loading={busy} disabled={otp.length !== page.otp_length || expiresIn === 0}>تأكيد الدفع</Button>
      <Button type="button" variant="ghost" size="md" disabled={busy || resendIn > 0 || page.otp_resends_left === 0} onClick={onResend}>
        {resendIn > 0 ? <>إعادة إرسال الرمز بعد <span className="num">{resendIn}</span> ث</> : page.otp_resends_left === 0 ? "استنفدت مرات إعادة الإرسال" : "إعادة إرسال الرمز"}
      </Button>
    </form>
  );
}

/**
 * رسالة SMS المحاكاة (البوابة التجريبية): تصل بعد لحظات كما تصل رسالة الهاتف، من اسم البوابة، وفيها الرمز.
 * المراجع ينسخ الرمز أو يعبئه بضغطة. البوابة الحقيقية لا تعيد الرمز أبداً، فلا تظهر هذه الرسالة معها.
 */
function SmsNotice({ page, onFill }: { page: Page; onFill: (code: string) => void }) {
  const [arrived, setArrived] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { const t = setTimeout(() => setArrived(true), 1800); return () => clearTimeout(t); }, []);
  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 1800); return () => clearTimeout(t); }, [copied]);
  const code = page.sandbox_otp!;
  const sender = page.provider === "zaincash" ? "ZainCash" : "QiCard";
  async function copy() {
    try { await navigator.clipboard.writeText(code); }
    catch {
      // المتصفح منع الحافظة: نسخ احتياطي عبر حقل مؤقت
      const t = document.createElement("textarea");
      t.value = code; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
    }
    setCopied(true);
  }
  if (!arrived) return (
    <div className="flex items-center gap-2 rounded-2xl border border-dashed border-line bg-surface px-3.5 py-3 text-sm text-ink-2" role="status">
      <Icon name="loader-circle" size={16} className="shrink-0 animate-spin text-ink-muted" />جاري إرسال رمز التحقق إلى هاتفك…
    </div>
  );
  if (hidden) return (
    <button type="button" onClick={() => setHidden(false)} className="flex min-h-11 items-center gap-2 self-start rounded-full bg-surface px-3.5 text-sm font-semibold text-primary-strong">
      <Icon name="message-square" size={16} />عرض رسالة الرمز
    </button>
  );
  return (
    <div className="gw-sms flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-3.5 shadow-lg" role="status" aria-live="polite">
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-on-accent"><Icon name="message-square" size={18} /></span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="font-bold" dir="ltr">{sender}</span>
          <span className="sub-sm">رسالة نصية · الآن</span>
        </span>
        <button type="button" onClick={() => setHidden(true)} aria-label="إخفاء الرسالة" className="grid size-9 place-items-center rounded-full text-ink-muted hover:bg-bg"><Icon name="x" size={17} /></button>
      </div>
      <p className="text-[15px] leading-relaxed">{page.sandbox_sms}</p>
      <div className="flex items-center gap-2">
        <span className="num flex-1 rounded-xl bg-bg px-3 py-2 text-center text-[22px] font-bold tracking-[0.35em]" dir="ltr">{code}</span>
        <Button type="button" size="md" variant="soft" icon={copied ? "check" : "copy"} onClick={copy}>{copied ? "نُسخ" : "نسخ"}</Button>
        <Button type="button" size="md" icon="clipboard-check" onClick={() => onFill(code)}>تعبئة</Button>
      </div>
    </div>
  );
}

function ResultView({ r, code, label, note, onClose }: { r: Op; code?: Code; label?: string; note?: string; onClose: () => void }) {
  const [at] = useState(() => new Date().toISOString());
  const back = <Button className="gw-noprint" variant="ghost" onClick={onClose}>رجوع إلى التطبيق</Button>;
  if (r.status === "succeeded") return (
    <div className="flex flex-col gap-3">
      <article className="gw-receipt flex flex-col items-center gap-3 rounded-2xl bg-surface p-5 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-success-soft text-success"><Icon name="circle-check" size={30} /></span>
        <h1 className="text-heading">تم الدفع بنجاح</h1>
        <span className="num text-[30px] font-bold leading-tight">{fmtIqd(r.amount)}</span>
        <dl className="grid w-full gap-x-6 gap-y-3 text-start sm:grid-cols-2">
          <DetailField label="الوصف" value={label} full />
          <DetailField label="رقم الوصل" value={r.receipt ? <CopyId value={r.receipt.receipt_number} label="نسخ رقم الوصل" /> : null} />
          <DetailField label="التاريخ" value={fmtDateTime(at)} />
          <DetailField label="طريقة الدفع" value={code ? BRAND[code].name : null} />
          <DetailField label="نوع الدفع" value={PURPOSE_AR[r.purpose ?? ""] ?? null} />
          <DetailField label="مرجع العملية" value={r.provider_reference ? <CopyId value={r.provider_reference} label="نسخ المرجع" /> : null} />
        </dl>
        {r.purpose === "booking_deposit" && <Alert tone="info" icon="info">دُفع العربون. المتبقي من الكشفية يُدفع في الاستقبال عند وصولك، ويُطرح العربون منه تلقائياً.</Alert>}
        {r.receipt && <QrCode value={r.receipt.qr_code} size={168} label={r.receipt.receipt_number} />}
        <span className="sub-sm">وصل إلكتروني · امسح الرمز للتحقق</span>
      </article>
      {r.receipt && <Button className="gw-noprint" variant="soft" icon="download" onClick={() => window.print()}>حفظ الوصل</Button>}
      {back}
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      {r.status === "pending" ? <Alert tone="warn">{note ?? "العملية قيد المعالجة لدى البوابة. سنحدّث حالة الحجز عند التأكيد."}</Alert>
        : <Alert tone="danger">{r.status === "cancelled" ? "أُلغيت عملية الدفع" : r.status === "expired" ? "انتهت مهلة المعاملة ولم يُخصم أي مبلغ" : `لم يتم الدفع${r.failure_code ? `: ${FAIL_AR[r.failure_code] ?? "تعذرت العملية"}` : ""}`}</Alert>}
      {back}
    </div>
  );
}

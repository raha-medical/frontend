"use client";
/**
 * الدفع الإلكتروني (القسم 3.5): اختيار الطريقة ← إنشاء المعاملة ← صفحة البوابة ← التحقق OTP ← العودة ← استعلام الخادم ← النتيجة.
 * في الوضع التجريبي (mock) صفحة البوابة داخل التطبيق وتستدعي /mock-gateway بتوكن المريض. مع بوابة حقيقية (live)
 * يُفتح redirect_url الذي تعيده البوابة، والنتيجة دائماً من POST /online-payments/{id}/verify. الشكل النهائي لجلسة التصميم.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { Icon } from "@/components/icon";
import { QrCode } from "@/components/qr";
import { Alert, Button, Field, Spinner } from "@/components/ui";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { patientApi } from "@/lib/api/staff";
import { fmtNum } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import type { OPay } from "./shared";

type Provider = { code: "zaincash" | "qicard"; name_ar: string; mode: string };
type Page = {
  reference: string; provider: string; merchant_name: string; amount: number; status: string; step: "credentials" | "otp" | "processing" | "done";
  account_masked: string | null; failure_code: string | null; secret_attempts_left: number; otp_attempts_left: number; otp_length: number;
  otp_expires_at: string | null; otp_resend_at: string | null; otp_resends_left: number; expires_at: string;
};
export type PayBody = { purpose: string; patient_id: string; booking_id?: string; invoice_id?: string; invoice_item_id?: string };

const FAIL_AR: Record<string, string> = {
  INSUFFICIENT_FUNDS: "الرصيد غير كافٍ", CARD_DECLINED: "رفض المصرف البطاقة", CARD_EXPIRED: "البطاقة منتهية الصلاحية",
  WRONG_PIN_LIMIT: "تجاوزت محاولات الرمز السري", WRONG_CARD_DATA_LIMIT: "تجاوزت محاولات بيانات البطاقة", OTP_ATTEMPTS_EXCEEDED: "تجاوزت محاولات رمز التحقق",
  CANCELLED_BY_USER: "ألغيت عملية الدفع", TIMEOUT: "انتهت مهلة المعاملة",
};

/** يفتح رحلة الدفع ويعيد حالة الدفعة النهائية كما يراها الخادم بعد الاستعلام (أو null إن أُغلقت قبل إنشاء معاملة). */
export function openGateway(body: PayBody): Promise<OPay | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (r: OPay | null) => { resolve(r); setTimeout(() => { root.unmount(); host.remove(); }, 0); };
    root.render(<GatewayFlow body={body} onDone={done} />);
  });
}

function GatewayFlow({ body, onDone }: { body: PayBody; onDone: (r: OPay | null) => void }) {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [op, setOp] = useState<(OPay & { provider_reference?: string; failure_code?: string | null; provider?: string }) | null>(null);
  const [page, setPage] = useState<Page | null>(null);
  const [result, setResult] = useState<(OPay & { failure_code?: string | null }) | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { patientApi.get<Provider[]>("/online-payments/providers").then(setProviders, setErr); }, []);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e); } finally { setBusy(false); } };
  /** العودة للتطبيق: الخادم يستعلم من البوابة، وهو وحده يقرر النتيجة. */
  const verify = async (id: string) => setResult(await patientApi.post<OPay>(`/online-payments/${id}/verify`, {}));

  async function choose(p: Provider) {
    await run(async () => {
      const id = uuidv7();
      const created = await patientApi.post<OPay & { provider_reference: string }>("/online-payments", { online_payment_id: id, provider: p.code, ...body }, { idempotencyKey: id });
      setOp({ ...created, provider: p.code });
      if (p.mode === "mock") setPage(await patientApi.get<Page>(`/mock-gateway/${created.provider_reference}`));
      else if (created.redirect_url) window.open(created.redirect_url, "_blank", "noopener");
    });
  }

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
  const title = page ? (page.provider === "zaincash" ? "زين كاش" : "كي كارد") : "الدفع الإلكتروني";

  return createPortal(
    <div className="scale-patient fixed inset-0 z-[70] flex items-end justify-center bg-black/45" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex max-h-[92dvh] w-full max-w-[440px] flex-col gap-3 overflow-auto rounded-t-3xl bg-surface p-5 pb-[max(env(safe-area-inset-bottom),20px)]">
        <div className="flex items-center gap-2">
          <Icon name={page?.provider === "qicard" ? "credit-card" : "wallet"} size={20} className="text-primary" />
          <span className="flex-1 text-lg font-bold">{title}</span>
          {op && <span className="num text-base font-bold">{fmtNum(op.amount)} د.ع</span>}
        </div>

        {result ? <ResultView r={result} /> : !op ? (
          // 1. اختيار طريقة الدفع
          !providers ? (err ? <Alert tone="danger">{errorMessage(err)}</Alert> : <Spinner />) : providers.length === 0 ? <Alert tone="warn">الدفع الإلكتروني غير متاح حالياً. ادفع في الاستقبال.</Alert> : (
            <div className="flex flex-col gap-2">
              <span className="sub">اختر طريقة الدفع</span>
              {providers.map((p) => <Button key={p.code} variant="ghost" loading={busy} icon={p.code === "qicard" ? "credit-card" : "wallet"} onClick={() => choose(p)}>{p.name_ar}</Button>)}
            </div>
          )
        ) : !page ? (
          <div className="flex flex-col gap-2">
            <Alert tone="info">أكمل الدفع في صفحة البوابة ثم ارجع هنا.</Alert>
            <Button loading={busy} onClick={() => run(() => verify(op.online_payment_id))}>تحقق من حالة الدفع</Button>
          </div>
        ) : page.step === "credentials" ? (
          <Credentials page={page} busy={busy} onSubmit={(v) => step("credentials", v)} />
        ) : page.step === "otp" ? (
          <Otp page={page} busy={busy} onSubmit={(otp) => step("otp", { otp })} onResend={() => step("otp/resend")} />
        ) : (
          <div className="flex flex-col gap-2">
            <Alert tone="warn">البوابة لم تؤكد العملية بعد. لن يُعتبر الحجز مدفوعاً حتى يؤكد الاستعلام.</Alert>
            <Button loading={busy} onClick={() => run(() => verify(op.online_payment_id))}>تحقق من حالة الدفع</Button>
          </div>
        )}

        {err != null && !result && <Alert tone="danger">{errorMessage(err)}</Alert>}
        {page && page.status === "pending" && page.step !== "processing" && !result && (
          <Button variant="ghost" loading={busy} onClick={() => step("cancel")}>إلغاء الدفع</Button>
        )}
        <Button variant="ghost" onClick={close}>{result ? "رجوع إلى التطبيق" : "إغلاق"}</Button>
      </div>
    </div>, document.body);
}

function Credentials({ page, busy, onSubmit }: { page: Page; busy: boolean; onSubmit: (v: object) => void }) {
  const [wallet, setWallet] = useState(""), [pin, setPin] = useState("");
  const [card, setCard] = useState(""), [expiry, setExpiry] = useState(""), [cvv, setCvv] = useState("");
  const digits = (v: string, n: number) => v.replace(/\D/g, "").slice(0, n);
  const zc = page.provider === "zaincash";
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); onSubmit(zc ? { wallet_number: wallet, pin } : { card_number: card, expiry, cvv }); }}>
      <span className="sub">{page.merchant_name} · المرجع <span className="num" dir="ltr">{page.reference}</span></span>
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
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const resendIn = page.otp_resend_at ? Math.max(0, Math.ceil((Date.parse(page.otp_resend_at) - now) / 1000)) : 0;
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); onSubmit(otp); setOtp(""); }}>
      <span className="sub">أُرسل رمز تحقق من {page.otp_length} أرقام برسالة SMS إلى صاحب {page.provider === "zaincash" ? "المحفظة" : "البطاقة"} <span className="num" dir="ltr">{page.account_masked}</span></span>
      <Field label="رمز التحقق (OTP)" icon="message-square" ltr inputMode="numeric" autoComplete="one-time-code" placeholder={"•".repeat(page.otp_length)} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, page.otp_length))} />
      <Button type="submit" loading={busy} disabled={otp.length !== page.otp_length}>تأكيد الدفع</Button>
      <Button type="button" variant="ghost" size="md" disabled={busy || resendIn > 0 || page.otp_resends_left === 0} onClick={onResend}>
        {resendIn > 0 ? <>إعادة إرسال الرمز بعد <span className="num">{resendIn}</span> ث</> : "إعادة إرسال الرمز"}
      </Button>
    </form>
  );
}

function ResultView({ r }: { r: OPay & { failure_code?: string | null } }) {
  if (r.status === "succeeded") return (
    <div className="flex flex-col items-center gap-2">
      <Alert tone="success" icon="circle-check">تم الدفع بنجاح</Alert>
      {r.receipt && <QrCode value={r.receipt.qr_code} size={180} label={r.receipt.receipt_number} />}
      <span className="sub-sm">وصل إلكتروني · امسح الرمز للتحقق</span>
    </div>
  );
  if (r.status === "pending") return <Alert tone="warn">العملية قيد المعالجة لدى البوابة. سنحدّث حالة الحجز عند التأكيد.</Alert>;
  return <Alert tone="danger">{r.status === "cancelled" ? "أُلغيت عملية الدفع" : r.status === "expired" ? "انتهت مهلة المعاملة ولم يُخصم أي مبلغ" : `لم يتم الدفع${r.failure_code ? `: ${FAIL_AR[r.failure_code] ?? r.failure_code}` : ""}`}</Alert>;
}

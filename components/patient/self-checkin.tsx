"use client";
/** تثبيت الحضور الذاتي بمسح QR شاشة الانتظار (المواصفة 3.1، العقد 5.x).
 *  المسح بمكتبة jsQR فوق getUserMedia لأن BarcodeDetector غير موجود في iPhone.
 *  الكاميرا الحية تحتاج HTTPS. بدونها أو عند رفض الإذن: التقاط صورة بكاميرا الهاتف (لا يحتاج HTTPS) أو لصق الرمز. */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icon";
import { Alert, Button, Field, Modal, Spinner } from "@/components/ui";
import { patientApi } from "@/lib/api/staff";
import type { SelfCheckInResult } from "@/lib/api/booking";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { fmtIqd, fmtTime } from "@/lib/format";

type JsQr = typeof import("jsqr").default;
let jsqrPromise: Promise<JsQr> | null = null;
const loadJsQr = () => (jsqrPromise ??= import("jsqr").then((m) => m.default));

/** يقرأ QR من لوحة رسم. يُصغّر الصورة الكبيرة لأن jsQR بطيء عليها. */
function decodeFrom(src: CanvasImageSource, w: number, h: number, canvas: HTMLCanvasElement, jsQR: JsQr): string | null {
  const scale = Math.min(1, 900 / Math.max(w, h));
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" })?.data || null;
}

const camMessage = (e: unknown) => {
  const n = (e as { name?: string })?.name;
  if (n === "NotAllowedError" || n === "SecurityError") return "رُفض إذن الكاميرا. اسمح للمتصفح باستخدام الكاميرا من إعدادات الموقع، أو التقط صورة للرمز من الزر أدناه.";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "لا توجد كاميرا متاحة على هذا الجهاز. التقط صورة للرمز أو ألصقه أدناه.";
  if (n === "NotReadableError") return "الكاميرا مستخدمة في تطبيق آخر. أغلقه ثم أعد المحاولة، أو التقط صورة للرمز.";
  return "تعذر فتح الكاميرا. التقط صورة للرمز أو ألصقه أدناه.";
};

/** ماسح الكاميرا الحية (jsQR). يتوقف ويطفئ الكاميرا عند أول قراءة أو عند الإخفاء. */
function LiveScanner({ onCode, paused }: { onCode: (text: string) => void; paused: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const cb = useRef(onCode); cb.current = onCode;
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    if (paused) return;
    let stream: MediaStream | null = null, stop = false, timer: ReturnType<typeof setTimeout>;
    setErr(null); setStarting(true);
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setErr("الكاميرا المباشرة تحتاج فتح التطبيق عبر رابط آمن (HTTPS). التقط صورة للرمز من الزر أدناه.");
        setStarting(false); return;
      }
      try {
        const [jsQR, s] = await Promise.all([loadJsQr(), navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })]);
        stream = s;
        if (stop) { s.getTracks().forEach((t) => t.stop()); return; }
        const v = video.current;
        if (!v) return;
        v.srcObject = s;
        await v.play();
        setStarting(false);
        const canvas = document.createElement("canvas");
        const tick = () => {
          if (stop) return;
          if (v.readyState >= 2 && v.videoWidth) {
            const text = decodeFrom(v, v.videoWidth, v.videoHeight, canvas, jsQR);
            if (text) { stop = true; cb.current(text); return; }
          }
          timer = setTimeout(tick, 220);
        };
        tick();
      } catch (e) { if (!stop) { setErr(camMessage(e)); setStarting(false); } }
    })();
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [paused]);

  if (err) return <Alert tone="warn" icon="camera">{err}</Alert>;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video ref={video} muted playsInline aria-label="معاينة الكاميرا لمسح الرمز" className="aspect-square w-full object-cover" />
      <span aria-hidden className="pointer-events-none absolute inset-[14%] rounded-3xl border-4 border-white/80" />
      {starting && <span className="absolute inset-0 grid place-items-center text-sm text-white">جارٍ فتح الكاميرا…</span>}
    </div>
  );
}

function selfCheckInError(e: unknown): string {
  if (!isApiError(e)) return errorMessage(e);
  const x = e.extra ?? {};
  switch (e.code) {
    case "CHECKIN_WRONG_CLINIC": return `هذا الرمز لعيادة أخرى. حجزك في ${x.clinic_name ?? "عيادة أخرى"}${x.floor != null ? `، الطابق ${x.floor}` : ""}. امسح الرمز على شاشة عيادتك.`;
    default: return errorMessage(e);
  }
}

export function SelfCheckInDialog({ bookingId, who, onClose, onDone, onOpenQueue }: { bookingId: string; who?: string; onClose: () => void; onDone: () => void; onOpenQueue: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<SelfCheckInResult | null>(null);
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  /** التدقيق 1.2: المريض ينتظر نتائج الطبيب نفسه أو له عودة مجانية → يختار «عودة بالنتائج» (افتراضي) أو «زيارة جديدة». */
  const [choice, setChoice] = useState<{ token: string; pending: string[] } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const submit = useCallback(async (text: string, visitMode?: "return" | "new") => {
    setBusy(true); setErr(null); setChoice(null);
    try { setRes(await patientApi.post<SelfCheckInResult>(`/bookings/${bookingId}/self-check-in`, { token: text.trim(), visit_mode: visitMode }, { idempotencyKey: false })); onDone(); }
    catch (e) {
      if (isApiError(e) && e.code === "RETURN_OR_NEW_REQUIRED") {
        const p = e.extra?.pending_services_ar;
        setChoice({ token: text, pending: Array.isArray(p) ? p.filter((v): v is string => typeof v === "string") : [] });
      } else setErr(selfCheckInError(e));
    } finally { setBusy(false); }
  }, [bookingId, onDone]);

  async function readPhoto(f: File | undefined) {
    if (!f) return;
    setPhotoBusy(true); setErr(null);
    try {
      const [jsQR, bmp] = await Promise.all([loadJsQr(), createImageBitmap(f)]);
      const text = decodeFrom(bmp, bmp.width, bmp.height, document.createElement("canvas"), jsQR);
      bmp.close();
      if (text) await submit(text); else setErr("لم نجد رمزاً واضحاً في الصورة. قرّب الهاتف من الشاشة وأعد التصوير.");
    } catch { setErr("تعذر قراءة الصورة. أعد المحاولة."); }
    finally { setPhotoBusy(false); if (file.current) file.current.value = ""; }
  }

  const body = res ? (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-success-soft text-success-strong"><Icon name="circle-check" size={30} /></span>
      <span className="text-lg font-bold">{res.already_checked_in ? "حضورك مثبت مسبقاً" : "تم تثبيت حضورك"}</span>
      <span className="num text-6xl font-bold text-primary-strong">{res.ticket_number}</span>
      <div className="grid w-full grid-cols-2 gap-2 text-sm">
        {res.queue_position != null && <span className="flex flex-col rounded-xl bg-bg p-2.5"><span className="text-ink-2">ترتيبك</span><b className="num text-lg">{res.queue_position}</b></span>}
        {res.estimated_time && <span className="flex flex-col rounded-xl bg-bg p-2.5"><span className="text-ink-2">الدخول التقريبي</span><b className="num text-lg">{fmtTime(res.estimated_time)}</b></span>}
      </div>
      <span className="text-sm">{res.doctor_name} · {res.clinic_name}{res.floor != null ? ` · الطابق ${res.floor}` : ""}</span>
      {res.amount_due > 0
        ? <Alert tone="warn" icon="banknote">المبلغ المستحق <b className="num">{fmtIqd(res.amount_due)}</b>. ادفعه في الاستقبال قبل دخولك للطبيب.</Alert>
        : <Alert tone="success">لا يوجد مبلغ مستحق.</Alert>}
      <Button className="w-full" icon="ticket" onClick={onOpenQueue}>متابعة طابوري</Button>
    </div>
  ) : choice ? (
    <div className="flex flex-col gap-3">
      <Alert tone="info" icon="flask-conical">{choice.pending.length ? `أنت بانتظار نتائج ${choice.pending.join(" و")} لهذا الطبيب.` : "لك عودة مجانية بالنتائج عند هذا الطبيب."} هل جئت بالنتائج أم لزيارة جديدة؟</Alert>
      <Button className="w-full" icon="undo-2" loading={busy} onClick={() => void submit(choice.token, "return")}>عودة بالنتائج (بلا رسوم)</Button>
      <Button className="w-full" variant="soft" icon="user-plus" disabled={busy} onClick={() => void submit(choice.token, "new")}>زيارة جديدة</Button>
    </div>
  ) : (
    <>
      <span className="sub">وجّه الكاميرا نحو الرمز الظاهر على شاشة الانتظار داخل العيادة. الرمز يتغير كل دقيقة تقريباً.</span>
      {busy ? <Spinner label="جارٍ تثبيت الحضور…" /> : <LiveScanner onCode={(t) => void submit(t)} paused={!!err} />}
      {err && (
        <>
          <Alert tone="danger">{err}</Alert>
          <Button size="md" variant="soft" icon="scan-qr-code" onClick={() => setErr(null)}>إعادة المسح</Button>
        </>
      )}
      <input ref={file} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void readPhoto(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-2">
        <Button size="md" variant="ghost" className="flex-1" icon="camera" loading={photoBusy} onClick={() => file.current?.click()}>التقاط صورة للرمز</Button>
        <Button size="md" variant="ghost" className="flex-1" icon="pencil" onClick={() => setShowManual((s) => !s)}>إدخال الرمز</Button>
      </div>
      {showManual && (
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) void submit(manual); }}>
          <div className="min-w-0 flex-1"><Field label="الرمز" ltr value={manual} onChange={(e) => setManual(e.target.value)} placeholder="alrahma://checkin?t=…" autoComplete="off" /></div>
          <Button size="md" icon="check" disabled={!manual.trim()}>تأكيد</Button>
        </form>
      )}
      <span className="sub-sm flex items-start gap-1.5"><Icon name="info" size={14} className="mt-0.5 shrink-0" />لا تملك كاميرا؟ راجع موظف الاستقبال وسيثبت حضورك.</span>
    </>
  );

  return createPortal(
    <div className="scale-patient">
      <Modal open onClose={onClose} title={who ? `تأكيد حضور ${who}` : "تأكيد حضوري"} icon="scan-qr-code" width={420}>{body}</Modal>
    </div>, document.body);
}

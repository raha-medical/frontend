"use client";
/**
 * المساعد الذكي (4.5، العقد 22.4): زر عائم ونافذة محادثة، كتابة وصوت. المفتاح والمنطق في السيرفر فقط،
 * وشرط الدفع والربط بالحساب يُفحصان هناك. السجل يبقى في ذاكرة الصفحة ولا يُحفظ.
 * الصوت: SpeechRecognition من المتصفح إن توفر، وإلا تسجيل يُرسل للسيرفر حين يدعمه المزود، وإلا الكتابة فقط.
 * القراءة بصوت عالٍ: speechSynthesis في الجهاز، بزر تشغيل وإيقاف.
 * المرحلة 2: التنبيه أعلى المحادثة قبل أول رسالة، واقتراح الحجز ببطاقة وزر «تأكيد الحجز» يستدعي POST /bookings نفسه
 * (المساعد لا يحجز أبداً)، وأزرار تفتح النتائج والوصفات والفواتير في التطبيق (القيم لا تمر عبر المساعد)،
 * والحد اليومي، ورسائل لطيفة عند الحد والتعطل، والزر يختفي إذا أوقف المدير المساعد.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Spinner } from "@/components/ui";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { patientApi } from "@/lib/api/staff";
import { fmtNum } from "@/lib/format";

type Status = { enabled: boolean; provider: string; is_sandbox: boolean; audio_input: boolean; daily_limit: number; remaining_today: number; disclaimer_ar: string };
export type AssistantAction = { type: "open_results" | "open_prescriptions" | "open_invoices" | "open_support"; label_ar: string; patient_id: string | null };
type Proposal = {
  booking_id: string; patient_id: string; patient_first_name: string; session_id: string; doctor_id: string; doctor_name: string; specialty: string;
  clinic_name: string; branch_name: string; date: string; date_ar: string; start: string; end: string; estimated_time_ar: string | null;
  new_visit_price: number | null; follow_up_price: number | null; visit_kind: string;
};
type Reply = { reply: string; kind: string; provider: string; is_sandbox: boolean; tools_used: string[]; daily_limit: number; remaining_today: number; disclaimer_ar: string; proposal: Proposal | null; actions: AssistantAction[] };
type Booked = { ticket_number: string | null; date: string; estimated_time: string | null };
type Msg = { role: "user" | "assistant"; text: string; kind?: string; proposal?: Proposal | null; actions?: AssistantAction[] };

const SUGGEST = ["أحتاج طبيب للمفاصل", "أقرب موعد لطبيب أطفال", "شنو سياسة الاسترجاع؟", "دفعت لو بعد؟", "شكد باقي على موعدي؟", "نتيجة تحليلي طلعت؟"];
const STATUS_KEY = ["p", "assistant-status"] as const;
const DISCLAIMER = "المساعد يساعدك بالمواعيد والحجز ومعلومات المجمع. ما يشخص ولا يصف علاج أو جرعة، ولأي استفسار طبي راجع طبيبك. بالحالات الطارئة اتصل بالإسعاف 122.";

/* eslint-disable @typescript-eslint/no-explicit-any */
const speechCtor = (): any => (typeof window === "undefined" ? null : (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null);
const canRecord = () => typeof window !== "undefined" && typeof (window as any).MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ar";
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("ar"));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

const toBase64 = (b: Blob) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onerror = () => no(r.error); r.onload = () => ok(String(r.result).split(",")[1] ?? ""); r.readAsDataURL(b); });

const useAssistantStatus = () => useQuery({ queryKey: STATUS_KEY, queryFn: () => patientApi.get<Status>("/assistant/status"), staleTime: 60_000 });

export function AssistantButton({ patientId, onAction }: { patientId: string; onAction?: (a: AssistantAction) => void }) {
  const [open, setOpen] = useState(false);
  const status = useAssistantStatus();
  // المدير أوقف المساعد: لا زر (التطبيق يعمل طبيعياً)
  if (status.data && !status.data.enabled && !open) return null;
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-[92px] z-30 mx-auto flex w-full max-w-[440px] justify-end px-4">
        <button onClick={() => setOpen(true)} aria-label="افتح المساعد الذكي" className="glass lift pointer-events-auto grid size-14 place-items-center rounded-full text-primary shadow-float">
          <span className="relative grid place-items-center"><Icon name="sparkles" size={26} /><span className="absolute -inset-3 animate-ping rounded-full border border-primary/30 [animation-duration:3s] motion-reduce:hidden" /></span>
        </button>
      </div>
      {open && <AssistantSheet patientId={patientId} onClose={() => setOpen(false)} onAction={(a) => { setOpen(false); onAction?.(a); }} />}
    </>
  );
}

/** بطاقة اقتراح الحجز: لا شيء محجوز حتى يضغط المراجع «تأكيد الحجز»، فيُرسل التطبيق نفسه POST /bookings. */
function ProposalCard({ p }: { p: Proposal }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Booked | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function confirm() {
    setBusy(true); setErr(null);
    try {
      const b = await patientApi.post<Booked & { warnings?: { message: string }[] }>("/bookings",
        { booking_id: p.booking_id, patient_id: p.patient_id, session_id: p.session_id, visit_kind: p.visit_kind }, { idempotencyKey: p.booking_id });
      setDone(b); b.warnings?.forEach((w) => toast.warn(w.message));
      void qc.invalidateQueries({ queryKey: ["p", "bookings"] }); void qc.invalidateQueries({ queryKey: ["p", "tickets"] });
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-primary/40 bg-primary-soft/40 p-3.5" aria-label="اقتراح حجز">
      <span className="flex items-center gap-1.5 font-bold"><Icon name="calendar-days" size={18} />اقتراح حجز</span>
      <span className="text-base">{p.doctor_name} <span className="sub-sm">({p.specialty})</span></span>
      <span className="sub-sm">{p.branch_name} · {p.clinic_name}</span>
      <span className="text-base">{p.date_ar}{p.estimated_time_ar ? ` · الوقت المتوقع ${p.estimated_time_ar}` : ` · ${p.start}–${p.end}`}</span>
      <span className="sub-sm">للمراجع: {p.patient_first_name}{p.new_visit_price != null && <> · الكشفية <span className="num">{fmtNum(p.new_visit_price)}</span> د.ع{p.follow_up_price != null && <> (المراجعة <span className="num">{fmtNum(p.follow_up_price)}</span>)</>}</>}</span>
      {done
        ? <Alert tone="success">تم الحجز{done.ticket_number ? ` برقم ${done.ticket_number}` : ""}. تلگاه بحجوزاتي.</Alert>
        : <Button size="md" icon="check" loading={busy} onClick={() => void confirm()}>تأكيد الحجز</Button>}
      {err && <Alert tone="danger">{err}</Alert>}
    </div>
  );
}

function AssistantSheet({ patientId, onClose, onAction }: { patientId: string; onClose: () => void; onAction: (a: AssistantAction) => void }) {
  const qc = useQueryClient();
  const status = useAssistantStatus();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [talk, setTalk] = useState(false);
  const [listening, setListening] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const msgsRef = useRef<Msg[]>([]);
  msgsRef.current = msgs;
  const talkRef = useRef(false);
  talkRef.current = talk;

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => () => { recRef.current?.stop(); if (typeof window !== "undefined") window.speechSynthesis?.cancel(); }, []);

  const send = useCallback(async (message: string, audio?: { mime_type: string; base64: string }) => {
    const clean = message.trim();
    if ((!clean && !audio) || busy) return;
    const history = msgsRef.current.map(({ role, text: t }) => ({ role, text: t })).slice(-20);
    setErr(null); setText(""); setBusy(true);
    setMsgs((m) => [...m, { role: "user", text: clean || "رسالة صوتية" }]);
    try {
      const r = await patientApi.post<Reply>("/assistant/chat", { message: clean || null, history, patient_id: patientId, audio: audio ?? null }, { idempotencyKey: false });
      setMsgs((m) => [...m, { role: "assistant", text: r.reply, kind: r.kind, proposal: r.proposal, actions: r.actions }]);
      setLeft(r.remaining_today);
      if (talkRef.current) speak(r.reply);
    } catch (e) {
      // رسائل لطيفة: الحد اليومي، والتعطل المؤقت، والإيقاف من الإدارة. التطبيق يبقى يعمل طبيعياً
      if (isApiError(e) && e.code === "RATE_LIMITED") { setLeft(0); setErr("وصلت حد رسائل المساعد لليوم. يرجع يشتغل باچر، والتطبيق كله يشتغل طبيعي."); }
      else if (isApiError(e) && e.code === "ASSISTANT_UNAVAILABLE") setErr("المساعد متعطل مؤقتاً. حاول بعد شوية، وتگدر تحجز وتشوف مواعيدك من التطبيق طبيعي.");
      else if (isApiError(e) && e.code === "ASSISTANT_DISABLED") { setErr("المساعد موقوف حالياً. تگدر تستخدم التطبيق طبيعي."); void qc.invalidateQueries({ queryKey: STATUS_KEY }); }
      else setErr(errorMessage(e));
    } finally { setBusy(false); }
  }, [busy, patientId, qc]);
  const remaining = left ?? status.data?.remaining_today ?? null;

  const SR = speechCtor();
  const audioInput = !!status.data?.audio_input && canRecord();
  const voiceOk = !!SR || audioInput;

  async function listen() {
    if (listening) { recRef.current?.stop(); return; }
    setErr(null);
    if (SR) {
      const r = new SR();
      r.lang = "ar-IQ"; r.interimResults = false; r.maxAlternatives = 1;
      r.onresult = (e: any) => { const said = e.results?.[0]?.[0]?.transcript as string | undefined; if (said) void send(said); };
      r.onerror = (e: any) => setErr(e.error === "not-allowed" ? "اسمح باستخدام الميكروفون من إعدادات المتصفح، أو اكتب رسالتك." : "لم أسمعك جيداً، حاول مرة أخرى أو اكتب رسالتك.");
      r.onend = () => { setListening(false); recRef.current = null; };
      recRef.current = r; setListening(true); r.start();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); setListening(false); recRef.current = null;
        const blob = new Blob(chunks, { type: rec.mimeType.split(";")[0] || "audio/webm" });
        void send("", { mime_type: blob.type, base64: await toBase64(blob) });
      };
      recRef.current = rec; setListening(true); rec.start();
    } catch { setErr("اسمح باستخدام الميكروفون من إعدادات المتصفح، أو اكتب رسالتك."); }
  }

  const speechOutOk = typeof window !== "undefined" && !!window.speechSynthesis;
  return createPortal(
    <div className="scale-patient fixed inset-0 z-[60] flex items-end justify-center bg-black/45" role="dialog" aria-modal="true" aria-label="المساعد الذكي" onClick={onClose} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="enter flex h-[85dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-t-3xl bg-surface" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="grid size-10 place-items-center rounded-full bg-primary-soft text-primary"><Icon name="sparkles" size={20} /></span>
          <span className="flex flex-1 flex-col"><span className="font-bold">مساعد الرحمة</span>{remaining != null && <span className="sub-sm">باقي لك اليوم <span className="num">{remaining}</span> رسالة</span>}</span>
          {speechOutOk && <button onClick={() => { setTalk((v) => { if (v) window.speechSynthesis.cancel(); return !v; }); }} aria-pressed={talk} aria-label={talk ? "إيقاف قراءة الردود" : "قراءة الردود بصوت عالٍ"} className={`grid size-11 place-items-center rounded-full ${talk ? "bg-primary text-on-accent" : "bg-bg text-ink-2"}`}><Icon name="volume-2" size={19} /></button>}
          <button onClick={onClose} aria-label="إغلاق" className="grid size-11 place-items-center rounded-full bg-bg"><Icon name="x" size={19} /></button>
        </header>
        {status.data?.is_sandbox && <div className="flex items-center gap-2 border-b border-line bg-warn-soft px-4 py-2 text-[15px] font-semibold text-warn-strong" role="status"><Icon name="flask-round" size={16} />وضع تجريبي: ردود بقواعد بسيطة، وليس ذكاءً اصطناعياً بعد.</div>}
        {/* التنبيه دائماً في الأعلى، قبل أول رسالة */}
        <div className="flex items-start gap-2 border-b border-line bg-bg px-4 py-2 text-[14px] text-ink-2" role="note"><Icon name="shield-check" size={16} className="mt-0.5 shrink-0" />{status.data?.disclaimer_ar ?? DISCLAIMER}</div>
        <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
          {status.isPending ? <Spinner /> : status.isError ? <Alert tone="danger">{errorMessage(status.error)}</Alert> : !status.data.enabled ? <Alert tone="warn">المساعد موقوف حالياً. تگدر تستخدم التطبيق طبيعي.</Alert> : msgs.length === 0 && (
            <>
              <p className="text-base text-ink-2">هلا بيك. أگدر أساعدك تختار التخصص والطبيب وتحجز، وأجاوبك عن مواعيدك وتحاليلك وفواتيرك ومعلومات المجمع. اكتب أو احكي بلغتك.</p>
              <div className="flex flex-wrap gap-2">{SUGGEST.map((s) => <button key={s} onClick={() => void send(s)} className="min-h-11 rounded-full border border-line-strong bg-surface px-3.5 text-[15px] font-semibold">{s}</button>)}</div>
            </>
          )}
          {msgs.map((m, i) => m.kind === "emergency"
            ? <div key={i} role="alert" className="flex flex-col gap-1.5 rounded-2xl border-2 border-danger bg-danger-soft p-3.5 text-danger-strong"><span className="flex items-center gap-1.5 font-bold"><Icon name="siren" size={18} />تنبيه طارئ</span><span className="text-base">{m.text}</span></div>
            : <div key={i} className={`flex max-w-[88%] flex-col gap-2 ${m.role === "user" ? "self-start" : "self-end"}`}>
                <div className={`whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-base ${m.role === "user" ? "bg-primary text-on-accent" : "bg-bg"}`}>{m.text}</div>
                {m.proposal && <ProposalCard p={m.proposal} />}
                {!!m.actions?.length && <div className="flex flex-wrap gap-2">{m.actions.map((a) => <button key={a.type + (a.patient_id ?? "")} onClick={() => onAction(a)} className="min-h-11 rounded-full border border-primary/50 bg-surface px-3.5 text-[15px] font-semibold text-primary">{a.label_ar}</button>)}</div>}
              </div>)}
          {busy && <div className="self-end rounded-2xl bg-bg px-3.5 py-2.5"><Spinner label="يكتب…" /></div>}
          {err && <Alert tone="warn">{err}</Alert>}
        </div>
        <form className="flex items-end gap-2 border-t border-line p-3 pb-[max(env(safe-area-inset-bottom),12px)]" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          {voiceOk
            ? <button type="button" onClick={() => void listen()} aria-pressed={listening} aria-label={listening ? "إيقاف التسجيل" : "تحدث بصوتك"} className={`grid size-12 shrink-0 place-items-center rounded-full ${listening ? "animate-pulse bg-danger text-on-accent" : "bg-bg text-primary"}`}><Icon name="audio-waveform" size={21} /></button>
            : <span className="sr-only">الإدخال الصوتي غير مدعوم في هذا المتصفح، اكتب رسالتك.</span>}
          <textarea value={text} rows={1} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }} aria-label="رسالتك" placeholder={voiceOk ? "اكتب أو تحدث…" : "اكتب رسالتك…"}
            className="min-h-12 flex-1 resize-none rounded-field border-[1.5px] border-line-strong bg-surface px-3 py-2.5 text-body outline-none focus:border-primary" />
          <button type="submit" disabled={busy || !text.trim() || remaining === 0} aria-label="إرسال" className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-on-accent disabled:opacity-50"><Icon name="send" size={20} className="-scale-x-100" /></button>
        </form>
        {!voiceOk && !status.isPending && <span className="sub-sm px-4 pb-2 text-center">الإدخال الصوتي غير مدعوم في هذا المتصفح، اكتب رسالتك.</span>}
      </div>
    </div>, document.body,
  );
}


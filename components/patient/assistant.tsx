"use client";
/**
 * المساعد الذكي (4.5، العقد 22.4): زر عائم ونافذة محادثة، كتابة وصوت. المفتاح والمنطق في السيرفر فقط،
 * وشرط الدفع والربط بالحساب يُفحصان هناك. السجل يبقى في ذاكرة الصفحة ولا يُحفظ.
 * الصوت: SpeechRecognition من المتصفح إن توفر، وإلا تسجيل يُرسل للسيرفر حين يدعمه المزود، وإلا الكتابة فقط.
 * القراءة بصوت عالٍ: speechSynthesis في الجهاز، بزر تشغيل وإيقاف.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icon";
import { Alert, Spinner } from "@/components/ui";
import { errorMessage, isApiError } from "@/lib/api/errors";
import { patientApi } from "@/lib/api/staff";

type Status = { enabled: boolean; provider: string; is_sandbox: boolean; audio_input: boolean; max_messages_per_hour: number; remaining_this_hour: number };
type Reply = { reply: string; kind: string; provider: string; is_sandbox: boolean; tools_used: string[]; remaining_this_hour: number; disclaimer_ar: string };
type Msg = { role: "user" | "assistant"; text: string; kind?: string };

const SUGGEST = ["شكد باقي على موعدي؟", "شنو وصفتي؟", "نتيجة تحليلي طلعت؟", "وين الفروع؟"];

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

export function AssistantButton({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-[92px] z-30 mx-auto flex w-full max-w-[440px] justify-end px-4">
        <button onClick={() => setOpen(true)} aria-label="افتح المساعد الذكي" className="glass lift pointer-events-auto grid size-14 place-items-center rounded-full text-primary shadow-float">
          <span className="relative grid place-items-center"><Icon name="sparkles" size={26} /><span className="absolute -inset-3 animate-ping rounded-full border border-primary/30 [animation-duration:3s] motion-reduce:hidden" /></span>
        </button>
      </div>
      {open && <AssistantSheet patientId={patientId} onClose={() => setOpen(false)} />}
    </>
  );
}

function AssistantSheet({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const status = useQuery({ queryKey: ["p", "assistant-status"], queryFn: () => patientApi.get<Status>("/assistant/status"), staleTime: 60_000 });
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
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
      setMsgs((m) => [...m, { role: "assistant", text: r.reply, kind: r.kind }]);
      setLeft(r.remaining_this_hour); setDisclaimer(r.disclaimer_ar);
      if (talkRef.current) speak(r.reply);
    } catch (e) {
      setErr(isApiError(e) && e.code === "RATE_LIMITED" ? "وصلت حد الرسائل لهذه الساعة. جرّب بعد قليل." : errorMessage(e));
    } finally { setBusy(false); }
  }, [busy, patientId]);

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
          <span className="flex flex-1 flex-col"><span className="font-bold">مساعد الرحمة</span>{left != null && <span className="sub-sm">متبقي لك <span className="num">{left}</span> رسالة هذه الساعة</span>}</span>
          {speechOutOk && <button onClick={() => { setTalk((v) => { if (v) window.speechSynthesis.cancel(); return !v; }); }} aria-pressed={talk} aria-label={talk ? "إيقاف قراءة الردود" : "قراءة الردود بصوت عالٍ"} className={`grid size-11 place-items-center rounded-full ${talk ? "bg-primary text-on-accent" : "bg-bg text-ink-2"}`}><Icon name="volume-2" size={19} /></button>}
          <button onClick={onClose} aria-label="إغلاق" className="grid size-11 place-items-center rounded-full bg-bg"><Icon name="x" size={19} /></button>
        </header>
        {status.data?.is_sandbox && <div className="flex items-center gap-2 border-b border-line bg-warn-soft px-4 py-2 text-[15px] font-semibold text-warn-strong" role="status"><Icon name="flask-round" size={16} />وضع تجريبي: ردود بقواعد بسيطة، وليس ذكاءً اصطناعياً بعد.</div>}
        <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
          {status.isPending ? <Spinner /> : status.isError ? <Alert tone="danger">{errorMessage(status.error)}</Alert> : !status.data.enabled ? <Alert tone="warn">المساعد غير متاح حالياً.</Alert> : msgs.length === 0 && (
            <>
              <p className="text-base text-ink-2">هلا بيك. أگدر أساعدك بمواعيدك، وصفاتك، تحاليلك وأشعتك، ومعلومات الفروع. اكتب أو احكي بالعامية.</p>
              <div className="flex flex-wrap gap-2">{SUGGEST.map((s) => <button key={s} onClick={() => void send(s)} className="min-h-11 rounded-full border border-line-strong bg-surface px-3.5 text-[15px] font-semibold">{s}</button>)}</div>
            </>
          )}
          {msgs.map((m, i) => m.kind === "emergency"
            ? <div key={i} role="alert" className="flex flex-col gap-1.5 rounded-2xl border-2 border-danger bg-danger-soft p-3.5 text-danger-strong"><span className="flex items-center gap-1.5 font-bold"><Icon name="siren" size={18} />تنبيه طارئ</span><span className="text-base">{m.text}</span></div>
            : <div key={i} className={`max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-base ${m.role === "user" ? "self-start bg-primary text-on-accent" : "self-end bg-bg"}`}>{m.text}</div>)}
          {busy && <div className="self-end rounded-2xl bg-bg px-3.5 py-2.5"><Spinner label="يكتب…" /></div>}
          {err && <Alert tone="danger">{err}</Alert>}
          {disclaimer && <span className="sub-sm text-center">{disclaimer}</span>}
        </div>
        <form className="flex items-end gap-2 border-t border-line p-3 pb-[max(env(safe-area-inset-bottom),12px)]" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          {voiceOk
            ? <button type="button" onClick={() => void listen()} aria-pressed={listening} aria-label={listening ? "إيقاف التسجيل" : "تحدث بصوتك"} className={`grid size-12 shrink-0 place-items-center rounded-full ${listening ? "animate-pulse bg-danger text-on-accent" : "bg-bg text-primary"}`}><Icon name="audio-waveform" size={21} /></button>
            : <span className="sr-only">الإدخال الصوتي غير مدعوم في هذا المتصفح، اكتب رسالتك.</span>}
          <textarea value={text} rows={1} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }} aria-label="رسالتك" placeholder={voiceOk ? "اكتب أو تحدث…" : "اكتب رسالتك…"}
            className="min-h-12 flex-1 resize-none rounded-field border-[1.5px] border-line-strong bg-surface px-3 py-2.5 text-body outline-none focus:border-primary" />
          <button type="submit" disabled={busy || !text.trim()} aria-label="إرسال" className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-on-accent disabled:opacity-50"><Icon name="send" size={20} className="-scale-x-100" /></button>
        </form>
        {!voiceOk && !status.isPending && <span className="sub-sm px-4 pb-2 text-center">الإدخال الصوتي غير مدعوم في هذا المتصفح، اكتب رسالتك.</span>}
      </div>
    </div>, document.body,
  );
}


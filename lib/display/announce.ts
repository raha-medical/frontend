/**
 * نداء صوتي لشاشة الانتظار: نغمة ثم نطق «الرقم خمسة عشر، الدكتور سعد» بالعربية.
 * 1) صوت عربي في المتصفح (speechSynthesis) إن وُجد.
 * 2) وإلا ملفات صوتية مسجلة للأرقام في /sounds/ar/ (تُفعّل بوجود manifest.json هناك؛ انظر public/sounds/ar/README.md).
 * 3) وإلا النغمة فقط.
 * المتصفحات تمنع الصوت قبل أول ضغطة: unlock() تُستدعى من زر «تفعيل الصوت»، وبعدها يعمل طوال بقاء الصفحة مفتوحة.
 */

const UNITS = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TENS = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مئة", "مئتان", "ثلاثمئة", "أربعمئة", "خمسمئة", "ستمئة", "سبعمئة", "ثمانمئة", "تسعمئة"];

/** كلمة واحدة مع مفتاح ملفها الصوتي (u1..u19 للآحاد وما دون العشرين، t2..t9 للعشرات، h1..h9 للمئات، wa = «و»). */
export type Word = { text: string; file: string };

/** العدد بالكلمات العربية (0 إلى 999) بصيغة العدّ المذكر: 15 = «خمسة عشر»، 125 = «مئة وخمسة وعشرون». */
export function arabicNumberWords(n: number): Word[] {
  n = Math.max(0, Math.floor(n)) % 1000;
  if (n === 0) return [{ text: "صفر", file: "u0" }];
  const parts: Word[][] = [];
  const h = Math.floor(n / 100), rest = n % 100;
  if (h) parts.push([{ text: HUNDREDS[h], file: `h${h}` }]);
  if (rest) {
    if (rest < 10) parts.push([{ text: UNITS[rest], file: `u${rest}` }]);
    else if (rest === 10) parts.push([{ text: "عشرة", file: "u10" }]);
    else if (rest === 11) parts.push([{ text: "أحد عشر", file: "u11" }]);
    else if (rest === 12) parts.push([{ text: "اثنا عشر", file: "u12" }]);
    else if (rest < 20) parts.push([{ text: `${UNITS[rest - 10]} عشر`, file: `u${rest}` }]);
    else {
      const u = rest % 10, t = Math.floor(rest / 10);
      // العربية: الآحاد قبل العشرات «خمسة وعشرون»
      if (u) parts.push([{ text: UNITS[u], file: `u${u}` }]);
      parts.push([{ text: TENS[t], file: `t${t}` }]);
    }
  }
  const out: Word[] = [];
  parts.forEach((p, i) => { if (i) out.push({ text: "و", file: "wa" }); out.push(...p); });
  return out;
}

/** «A-015» → 15. null إن لم يكن فيه رقم. */
export function ticketNumberValue(ticket: string): number | null {
  const d = ticket.match(/\d+/g)?.join("");
  return d ? Number(d) : null;
}

/** «د. سعد الباطنية» → «الدكتور سعد الباطنية» حتى لا تُنطق «دال». */
export function spokenDoctor(name: string): string {
  return name.replace(/^\s*د\s*\.\s*/, "الدكتور ").replace(/\s+/g, " ").trim();
}

/** النص المنطوق: «الرقم خمسة عشر، الدكتور سعد». */
export function announcementText(ticket: string, doctor: string, room?: string | null): string {
  const v = ticketNumberValue(ticket);
  const words = (n: number) => arabicNumberWords(n).map((w) => w.text).join(" ").replace(/ و /g, " و");
  const num = v === null ? ticket : words(v);
  // الغرفة الرقمية تُنطق «الغرفة واحد» بدل «1»
  const r = room?.trim() ? (/^\d+$/.test(room.trim()) ? `الغرفة ${words(Number(room.trim()))}` : room.trim()) : "";
  return `الرقم ${num}، ${spokenDoctor(doctor)}${r ? `، ${r}` : ""}`;
}

type Manifest = { ext?: string; files: string[] };

export class Announcer {
  private ctx: AudioContext | null = null;
  private manifest: Manifest | null = null;
  private chain: Promise<void> = Promise.resolve();
  unlocked = false;
  private readonly base: string;

  constructor(base = "/sounds/ar") { this.base = base; }

  /** هل يسمح المتصفح بالصوت دون ضغطة (شاشة كشك بإعداد autoplay)؟ */
  async probe(): Promise<boolean> {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === "running") this.unlocked = true;
    } catch { /* لا Web Audio */ }
    void this.loadManifest();
    return this.unlocked;
  }

  /** من زر «تفعيل الصوت» (ضغطة المستخدم): يفتح Web Audio والنطق للصفحة كلها. */
  async unlock(): Promise<void> {
    try {
      this.ctx ??= new AudioContext();
      await this.ctx.resume();
    } catch { /* */ }
    try {
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        speechSynthesis.speak(u);
      }
    } catch { /* */ }
    this.unlocked = true;
    void this.loadManifest();
    await this.chime();
  }

  /** نداء مريض: يُضاف لطابور نداءات الشاشة حتى لا يتداخل نداءان. */
  announce(ticket: string, doctor: string, room?: string | null): Promise<void> {
    this.chain = this.chain.then(() => this.run(ticket, doctor, room)).catch(() => undefined);
    return this.chain;
  }

  private async run(ticket: string, doctor: string, room?: string | null) {
    await this.chime();
    if (!this.unlocked) return;
    const voice = await arabicVoice();
    if (voice) {
      const text = announcementText(ticket, doctor, room);
      await speak(text, voice);
      await sleep(700);
      await speak(text, voice);
      return;
    }
    const m = await this.loadManifest();
    const v = ticketNumberValue(ticket);
    if (!m || v === null) return;
    const files = ["raqm", ...arabicNumberWords(v).map((w) => w.file), "tafaddal"].filter((f) => m.files.includes(f));
    for (let i = 0; i < 2; i++) {
      for (const f of files) await this.playFile(`${this.base}/${f}.${m.ext ?? "mp3"}`);
      await sleep(600);
    }
  }

  private async loadManifest(): Promise<Manifest | null> {
    if (this.manifest) return this.manifest;
    try {
      const r = await fetch(`${this.base}/manifest.json`, { cache: "no-store" });
      if (r.ok) this.manifest = (await r.json()) as Manifest;
    } catch { /* لا ملفات مسجلة */ }
    return this.manifest;
  }

  async chime(): Promise<void> {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state !== "running") await this.ctx.resume().catch(() => undefined);
      if (this.ctx.state !== "running") return;
      const t = this.ctx.currentTime;
      // نغمتان متتاليتان (دينغ دونغ) أوضح من صفارة واحدة
      for (const [freq, at] of [[880, 0], [660, 0.32]] as const) {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.frequency.value = freq; o.type = "sine";
        g.gain.setValueAtTime(0.0001, t + at);
        g.gain.exponentialRampToValueAtTime(0.6, t + at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.45);
        o.connect(g).connect(this.ctx.destination);
        o.start(t + at); o.stop(t + at + 0.5);
      }
      await sleep(900);
    } catch { /* */ }
  }

  private playFile(url: string): Promise<void> {
    return new Promise((resolve) => {
      const a = new Audio(url);
      a.onended = () => resolve();
      a.onerror = () => resolve();
      a.play().catch(() => resolve());
    });
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** أفضل صوت عربي متاح (الطبيعي/الأونلاين أولاً). المتصفح قد يحمّل الأصوات متأخراً، فننتظر حتى ثانية ونصف. */
export async function arabicVoice(): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  let voices = speechSynthesis.getVoices();
  if (!voices.length) {
    await new Promise<void>((r) => {
      const done = () => { speechSynthesis.removeEventListener("voiceschanged", done); r(); };
      speechSynthesis.addEventListener("voiceschanged", done);
      setTimeout(done, 1500);
    });
    voices = speechSynthesis.getVoices();
  }
  const ar = voices.filter((v) => v.lang.toLowerCase().startsWith("ar"));
  if (!ar.length) return null;
  const score = (v: SpeechSynthesisVoice) => (/natural|online|neural|google/i.test(v.name) ? 2 : 0) + (/^ar-(iq|sa)/i.test(v.lang) ? 1 : 0);
  return ar.sort((a, b) => score(b) - score(a))[0];
}

function speak(text: string, voice: SpeechSynthesisVoice): Promise<void> {
  return new Promise((resolve) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice; u.lang = voice.lang; u.rate = 0.85; u.pitch = 1; u.volume = 1;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
      setTimeout(resolve, 12_000); // احتياط إن لم يصل onend
    } catch { resolve(); }
  });
}

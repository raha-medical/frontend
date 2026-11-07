"use client";
/**
 * أصوات تطبيق المراجع (Web Audio، بلا ملفات): نغمة قصيرة للإشعار الجديد، ونغمة «حان دورك» المتكررة مع الاهتزاز.
 * «كتم صوت الإشعارات» تفضيل على هذا الجهاز (localStorage) ويكتم نغمة الإشعارات العادية فقط؛ تنبيه «حان دورك» لا يُكتم
 * لأنه نداء الدخول نفسه.
 */

const MUTE_KEY = "rahma.patient.notif_muted";
let ctx: AudioContext | null = null;

export function isNotifMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; }
}
export function setNotifMuted(v: boolean) {
  try { if (v) localStorage.setItem(MUTE_KEY, "1"); else localStorage.removeItem(MUTE_KEY); } catch { /* */ }
}

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
    return ctx;
  } catch { return null; }
}

/** المتصفح يسمح بالصوت بعد أول لمسة: نفتح السياق عند أي لمسة في التطبيق. */
export function primeAudioOnGesture() {
  const go = () => { audio(); };
  window.addEventListener("pointerdown", go, { passive: true });
  window.addEventListener("keydown", go);
  return () => { window.removeEventListener("pointerdown", go); window.removeEventListener("keydown", go); };
}

function tone(freqs: [number, number][], gain = 0.35) {
  const a = audio();
  if (!a || a.state !== "running") return;
  const t = a.currentTime;
  for (const [freq, at] of freqs) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t + at);
    g.gain.exponentialRampToValueAtTime(gain, t + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.3);
    o.connect(g).connect(a.destination);
    o.start(t + at); o.stop(t + at + 0.32);
  }
}

/** نغمة الإشعار الجديد (تُكتم من الإعدادات). */
export function notifChime() {
  if (isNotifMuted()) return;
  tone([[880, 0], [1175, 0.14]], 0.25);
}

/** نغمة «حان دورك» واهتزاز، تُشغَّل كل ثانيتين حتى يضغط المراجع «تم، أنا قادم». تعيد دالة الإيقاف. */
export function startTurnAlarm(): () => void {
  const ring = () => {
    tone([[988, 0], [784, 0.25], [988, 0.5], [784, 0.75]], 0.5);
    try { navigator.vibrate?.([400, 200, 400]); } catch { /* */ }
  };
  ring();
  const id = setInterval(ring, 2000);
  return () => { clearInterval(id); try { navigator.vibrate?.(0); } catch { /* */ } };
}

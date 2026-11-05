"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, Button, Field, Spinner } from "@/components/ui";
import { errorMessage, fieldErrors } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/store";
import { homeFor } from "@/lib/roles";

/** قوة كلمة المرور (للعرض فقط): القاعدة الملزمة من السيرفر = 10 أحرف على الأقل (WEAK_PASSWORD). */
function strength(p: string) {
  let s = 0;
  if (p.length >= 10) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return p.length < 10 ? Math.min(s, 1) : Math.max(s, 1);
}
const LABELS = ["", "ضعيفة", "مقبولة", "جيدة", "قوية"];

export default function ChangePasswordPage() {
  const router = useRouter();
  const { status, user, changePassword } = useAuth();
  const [cur, setCur] = useState(""); const [next, setNext] = useState(""); const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<unknown>(null);

  useEffect(() => { if (status === "anon") router.replace("/staff/login"); }, [status, router]);
  if (status !== "authed" || !user) return <Spinner />;

  const sc = strength(next);
  const mismatch = again.length > 0 && again !== next;
  const ok = cur.length > 0 && next.length >= 10 && next === again;
  const fe = fieldErrors(err);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setBusy(true);
    try { const u = await changePassword(cur, next); router.replace(homeFor(u)); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      <div className="absolute end-4 top-4"><ThemeToggle label /></div>
      <form onSubmit={submit} className="flex w-full max-w-[420px] flex-col gap-3 rounded-panel bg-surface p-7 shadow-card">
        <h1 className="flex items-center gap-2 text-[19px] font-bold"><Icon name="key-round" size={20} className="text-primary" />تغيير كلمة المرور</h1>
        {user.must_change_password && <Alert tone="info">تدخل بكلمة مرور مؤقتة. غيّرها للمتابعة.</Alert>}
        <Field label="كلمة المرور الحالية" icon="lock-keyhole" secret autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} error={fe.current_password} />
        <Field label="كلمة المرور الجديدة" icon="key-round" secret autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={fe.new_password} />
        <Field label="تأكيد كلمة المرور" icon="key-round" secret autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} error={mismatch ? "غير متطابقة مع كلمة المرور الجديدة" : undefined} />
        <div className="flex flex-col gap-1.5" aria-live="polite">
          <div className="grid grid-cols-4 gap-1">{[1, 2, 3, 4].map((i) => <span key={i} className={`h-[5px] rounded-full ${next && i <= sc ? (sc >= 3 ? "bg-success" : sc === 2 ? "bg-warn" : "bg-danger") : "bg-line"}`} />)}</div>
          <span className={`flex items-center gap-1.5 text-xs font-semibold ${next.length >= 10 ? "text-success-strong" : "text-ink-2"}`}>
            <Icon name={next.length >= 10 ? "circle-check" : "info"} size={14} />
            {next ? `${LABELS[sc]} · ${next.length >= 10 ? "الحد الأدنى 10 أحرف متحقق" : "الحد الأدنى 10 أحرف"}` : "الحد الأدنى 10 أحرف"}
          </span>
        </div>
        {err != null && <Alert tone="danger">{errorMessage(err)}</Alert>}
        <Button type="submit" icon="shield-check" loading={busy} disabled={!ok}>حفظ كلمة المرور</Button>
      </form>
    </main>
  );
}

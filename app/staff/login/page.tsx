"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BrandMark } from "@/components/brand-mark";
import { BrandScene, BrandTile } from "@/components/brand-scene";
import { Icon } from "@/components/icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, Button, Field, Spinner } from "@/components/ui";
import { staffApi } from "@/lib/api/staff";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { Branch, StaffUser } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";
import { landingFor } from "@/lib/roles";

export default function LoginPage() {
  return <Suspense fallback={<Spinner />}><Login /></Suspense>;
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, status, user } = useAuth();
  // من صفحة «كل الأقسام»: ?u= يملأ اسم المستخدم، و?next= الشاشة المطلوبة بعد الدخول (إن كان الدور يسمح بها)
  const next = params.get("next");
  const go = (u: StaffUser) => landingFor(u, next);
  const [username, setUsername] = useState(() => params.get("u") ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [step, setStep] = useState<"credentials" | "branch">("credentials");

  // جلسة قائمة: ندخل مباشرة (إلا إن كنا في اختيار الفرع)
  useEffect(() => {
    if (status !== "authed" || !user || step === "branch") return;
    if (user.must_change_password) router.replace("/staff/change-password");
    else if (!busy) router.replace(go(user));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, user, step, busy, router, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      // الانتقال يتم في useEffect أعلاه فقط: طلبا تنقل متزامنان يلغي أحدهما الآخر فتبقى الصفحة عالقة
      const u = await login(username, password);
      if (!u.must_change_password && u.branch_ids.length > 1) setStep("branch");
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  const code = isApiError(err) ? err.code : null;
  const expired = params.get("expired") === "1";

  return (
    <main className="relative grid min-h-dvh bg-bg md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* الشاشات الكبيرة: جزآن جنباً إلى جنب. الصغيرة: المشهد خلفية والبطاقة في المنتصف */}
      <BrandScene className="!absolute inset-0 md:!relative">
        <div className="hidden md:block"><BrandTile hint="نظام التشغيل الداخلي للاستقبال والأطباء والأقسام والمحاسبة" /></div>
      </BrandScene>
      <div className="absolute end-4 top-4 z-10"><ThemeToggle label /></div>
      <div className="relative flex items-center justify-center p-4 sm:p-8">
        <section className="glass-login flex w-full max-w-[420px] flex-col gap-3.5 rounded-panel p-6 sm:p-8 md:border-line md:bg-surface md:shadow-glass">
          <span className="flex items-center gap-3"><BrandMark size={52} /><span className="flex flex-col"><span className="text-[17px] font-bold">مجمع الرحمة الطبي</span><span className="sub">بوابة الموظفين</span></span></span>
          {step === "credentials" ? (
            <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
              <h1 className="text-[22px] font-bold">تسجيل الدخول</h1>
              {expired && !err && <Alert tone="info">انتهت جلستك. سجّل الدخول من جديد.</Alert>}
              <Field label="اسم المستخدم" icon="at-sign" ltr autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required />
              <Field label="كلمة المرور" icon="lock-keyhole" secret autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={code === "INVALID_CREDENTIALS"} required />
              {err != null && (code === "ACCOUNT_LOCKED"
                ? <Alert tone="warn" icon="timer">{errorMessage(err)}</Alert>
                : <Alert tone="danger">{code === "INVALID_CREDENTIALS" ? (isApiError(err) && err.detail) || errorMessage(err) : errorMessage(err)}</Alert>)}
              <Button type="submit" icon="log-in" loading={busy || status === "authed"} disabled={!username || !password}>دخول</Button>
              <a href="/hub" className="flex items-center justify-center gap-1.5 text-sm font-semibold text-primary hover:underline"><Icon name="layout-grid" size={16} />كل أقسام النظام</a>
            </form>
          ) : (
            <BranchPicker user={user!} onDone={(u) => router.replace(go(u))} />
          )}
        </section>
      </div>
    </main>
  );
}

/** اختيار الفرع (تصميم 02): الموظف المسند لأكثر من فرع. التبديل عبر POST /auth/switch-branch. */
function BranchPicker({ user, onDone }: { user: StaffUser; onDone: (u: StaffUser) => void }) {
  const switchBranch = useAuth((s) => s.switchBranch);
  const [sel, setSel] = useState(user.branch_id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const q = useQuery({ queryKey: ["branches", "mine"], queryFn: () => staffApi.get<{ items: Branch[] }>("/branches") });
  const branches = (q.data?.items ?? []).filter((b) => user.branch_ids.includes(b.branch_id));
  const list: Array<Pick<Branch, "branch_id" | "name" | "status" | "status_ar" | "status_reason_ar">> =
    branches.length ? branches : user.branch_ids.map((id) => ({ branch_id: id, name: id, status: "open" as const, status_ar: "", status_reason_ar: null }));

  async function go() {
    setErr(null); setBusy(true);
    // يبقى الزر في حالة انتظار حتى تصل الشاشة التالية
    try { onDone(sel === user.branch_id ? user : await switchBranch(sel)); }
    catch (e) { setErr(e); setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-[19px] font-bold"><Icon name="building-2" size={20} className="text-primary" />اختر الفرع للعمل عليه</h2>
      <p className="sub">أنت مسند لأكثر من فرع. لا يمكن التبديل مع حساب يومي مفتوح.</p>
      {q.isPending ? <Spinner /> : list.map((b) => {
        const inactive = b.status === "inactive", on = sel === b.branch_id;
        return (
          <button key={b.branch_id} type="button" disabled={inactive} onClick={() => setSel(b.branch_id)}
            className={`flex items-center gap-3 rounded-2xl border-[1.5px] p-3.5 text-start ${on ? "border-primary bg-primary-soft" : "border-line bg-surface"} ${inactive ? "opacity-55" : ""}`}>
            <Icon name={inactive ? "building" : "building-2"} size={20} className={b.status === "open" ? "text-primary" : "text-ink-muted"} />
            <span className="flex flex-1 flex-col">
              <span className="text-[15px] font-bold">{b.name}</span>
              <span className={`text-xs ${b.status === "open" ? "text-success-strong" : b.status === "closed" ? "text-warn-strong" : "text-ink-muted"}`}>
                {b.status_ar}{b.status === "closed" && b.status_reason_ar ? ` · ${b.status_reason_ar}` : ""}
              </span>
            </span>
            {on && <Icon name="circle-check" size={18} className="text-primary" />}
          </button>
        );
      })}
      {err != null && <Alert tone="danger">{errorMessage(err)}</Alert>}
      <Button onClick={go} loading={busy} icon="log-in">متابعة</Button>
    </div>
  );
}

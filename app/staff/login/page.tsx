"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BrandMark } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, Button, Field, Spinner } from "@/components/ui";
import { staffApi } from "@/lib/api/staff";
import { errorMessage, isApiError } from "@/lib/api/errors";
import type { Branch, StaffUser } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/store";
import { landingFor } from "@/lib/roles";
import { MOCK_IMAGES } from "@/lib/mock-images";

const ROLE_CHIPS = [["الاستقبال", "concierge-bell"], ["الأطباء", "stethoscope"], ["المختبر", "microscope"], ["الأشعة", "scan-line"], ["الصيدلية", "pill"], ["المحاسبة", "calculator"]] as const;

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
      const u = await login(username, password);
      if (u.must_change_password) router.replace("/staff/change-password");
      else if (u.branch_ids.length > 1) setStep("branch");
      else router.replace(go(u));
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  const code = isApiError(err) ? err.code : null;
  const expired = params.get("expired") === "1";

  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4 sm:p-8">
      <div className="absolute end-4 top-4"><ThemeToggle label /></div>
      <div className="grid w-full max-w-[880px] overflow-hidden rounded-panel bg-surface shadow-card md:min-h-[560px] md:grid-cols-[minmax(0,1fr)_420px]">
        <section className="relative flex flex-col items-center gap-4 overflow-hidden bg-nav-finance p-8 text-center text-white md:p-9">
          {/* صورة حقيقية (المواصفة 1.3) تحت تدرج من لون القائمة حتى يبقى النص مقروءاً */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={MOCK_IMAGES.staffHero.src} alt={MOCK_IMAGES.staffHero.alt} decoding="async" fetchPriority="high" sizes="(min-width: 768px) 460px, 100vw" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
          <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-nav-finance via-nav-finance/85 to-nav-finance/35" />
          <div className="relative grid aspect-[14/9] w-full max-w-[400px] place-items-center">
            <span className="relative grid place-items-center rounded-full bg-nav-finance/90 p-3 ring-1 ring-white/15 backdrop-blur-sm">
              <BrandMark size={128} tone="onDark" paper="rgb(var(--nav-finance))" />
            </span>
          </div>
          <div className="relative mt-auto flex flex-col items-center gap-3">
            <h1 className="text-[28px] font-bold">مجمع الرحمة الطبي</h1>
            <p className="text-[15px] leading-7 text-on-nav-3">نظام التشغيل الداخلي للاستقبال والأطباء والأقسام والمحاسبة</p>
            <div className="hidden flex-wrap justify-center gap-2 sm:flex">
              {ROLE_CHIPS.map(([ar, icon]) => (
                <span key={ar} className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs text-on-nav-2"><Icon name={icon} size={13} />{ar}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="flex flex-col justify-center gap-3.5 p-7 md:p-9">
          {step === "credentials" ? (
            <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
              <h2 className="text-[22px] font-bold">تسجيل الدخول</h2>
              {expired && !err && <Alert tone="info">انتهت جلستك. سجّل الدخول من جديد.</Alert>}
              <Field label="اسم المستخدم" icon="at-sign" ltr autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="reception_internal_b1" required />
              <Field label="كلمة المرور" icon="lock-keyhole" secret autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} invalid={code === "INVALID_CREDENTIALS"} required />
              {err != null && (code === "ACCOUNT_LOCKED"
                ? <Alert tone="warn" icon="timer">{errorMessage(err)}</Alert>
                : <Alert tone="danger">{code === "INVALID_CREDENTIALS" ? (isApiError(err) && err.detail) || errorMessage(err) : errorMessage(err)}</Alert>)}
              <Button type="submit" icon="log-in" loading={busy} disabled={!username || !password}>دخول</Button>
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
    try { onDone(sel === user.branch_id ? user : await switchBranch(sel)); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-[19px] font-bold"><Icon name="building-2" size={20} className="text-primary" />اختر الفرع للعمل عليه</h2>
      <p className="sub">أنت مسند لأكثر من فرع. لا يمكن التبديل مع وردية مفتوحة.</p>
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

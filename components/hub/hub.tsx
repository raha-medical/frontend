"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Spinner } from "@/components/ui";
import { useAuth } from "@/lib/auth/store";
import type { StaffRole, StaffUser } from "@/lib/api/types";
import { ROLES, SECTION_NAV, SECTION_ROLES, canOpenPath, canOpenSection, roleMeta, visibleNav } from "@/lib/roles";

/**
 * «كل أقسام النظام» (System Hub.dc.html، لكن بروابط حية): بطاقة لكل قسم بشاشاته.
 * القسم المسموح للجلسة الحالية (user.sections والصلاحيات، العقد 1) يُفتح مباشرة، وغيره يمر بالدخول بحساب ذلك القسم ثم يعود للشاشة المطلوبة.
 * الخادم هو الحكم في الصلاحيات (403)، وهذه الصفحة تنقل فقط.
 */

type StaffSection = { kind: "staff"; key: string; title: string; desc: string; icon: string; tone: "medical" | "finance"; device: string; account: StaffRole };
type PublicSection = { kind: "public"; key: string; title: string; desc: string; icon: string; device: string; href: string; note?: string };

const STAFF: StaffSection[] = [
  { kind: "staff", key: "reception", title: "الاستقبال", icon: "concierge-bell", tone: "medical", device: "حاسوب", account: "receptionist",
    desc: "الطابور، الحضور، التحصيل والإيصالات، الطلب المباشر، الاسترجاع، فك الحظر، الحساب اليومي، والمزامنة." },
  { kind: "staff", key: "doctor", title: "الطبيب", icon: "stethoscope", tone: "medical", device: "حاسوب · تابلت", account: "doctor",
    desc: "طابوري، المعاينة والوصفة، طلب التحاليل والأشعة، سجل المريض، والإشعارات." },
  { kind: "staff", key: "lab", title: "المختبر", icon: "microscope", tone: "medical", device: "تابلت", account: "lab_tech",
    desc: "قائمة العمل، سحب العينة وملصقها، إدخال النتائج والقيم الحرجة، الاعتماد والمرفقات." },
  { kind: "staff", key: "radiology", title: "الأشعة والسونار", icon: "scan-line", tone: "medical", device: "تابلت", account: "radiologist",
    desc: "الجدولة، التنفيذ، التقرير والاعتماد، رفع الصور، ومواعيد اليوم." },
  { kind: "staff", key: "pharmacy", title: "الصيدلية", icon: "pill", tone: "medical", device: "تابلت", account: "pharmacist",
    desc: "مسح كود الوصفة، الصرف مرة واحدة، البدائل وأسباب عدم الصرف، وسجل اليوم." },
  { kind: "staff", key: "accountant", title: "المحاسب", icon: "calculator", tone: "finance", device: "حاسوب", account: "accountant",
    desc: "لوحة الفروع، مطابقة الحسابات اليومية، الاسترجاع، الذمم، الإيراد، أرباح الأطباء، الفواتير، المصاريف، والتدقيق." },
  { kind: "staff", key: "admin", title: "الإدارة", icon: "shield-check", tone: "finance", device: "حاسوب", account: "admin",
    desc: "الفروع، المستخدمون والصلاحيات، الأقسام، الأطباء والجداول، الأسعار، الأجهزة، الإعدادات، والنسخ الاحتياطي." },
];

const PUBLIC: PublicSection[] = [
  { kind: "public", key: "patient", title: "تطبيق المريض", icon: "smartphone", device: "هاتف", href: "/patient",
    desc: "الدخول برمز التحقق، الحجز والدفع، الدور الحي، النتائج والوصفات.", note: "رمز الدخول في الوضع التجريبي يظهر في الإدارة ← الرسائل التجريبية" },
  { kind: "public", key: "display", title: "شاشة الانتظار", icon: "monitor", device: "تلفاز", href: "/display",
    desc: "الرقم الحالي والتالي لكل طبيب، بلا أسماء مرضى.", note: "تُفعّل أول مرة برابط المفتاح من الإدارة ← الأجهزة والشاشات" },
  { kind: "public", key: "landing", title: "الموقع التعريفي", icon: "globe", device: "ويب · هاتف", href: "/",
    desc: "هوية المجمع، الفروع والأطباء، ورابط الحجز." },
];

/** أسماء حسابات التطوير المقترحة لكل قسم (تظهر في وضع التطوير فقط، بلا كلمات مرور). */
const DEV_USERS: Partial<Record<StaffRole, string>> = {
  admin: "admin", receptionist: "reception_b1", doctor: "dr_saad", lab_tech: "lab_sara",
  radiologist: "rad_omar", pharmacist: "pharma_noor", accountant: "acc_zaid",
};
const SHOW_DEV_USERS = process.env.NODE_ENV !== "production";

export function SystemHub() {
  const router = useRouter();
  const { status, user, logout } = useAuth();

  async function enterAs(s: StaffSection, href: string) {
    if (user && canOpenPath(user, href)) { router.push(href); return; }
    if (status === "authed") await logout();
    const q = new URLSearchParams({ next: href });
    const u = SHOW_DEV_USERS ? DEV_USERS[s.account] : undefined;
    if (u) q.set("u", u);
    router.push(`/staff/login?${q}`);
  }

  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 pb-20 pt-8 sm:px-7">
        <header className="flex flex-wrap items-center gap-4">
          <BrandMark size={56} />
          <div className="flex min-w-[220px] flex-1 flex-col">
            <h1 className="text-[26px] font-bold leading-tight">أقسام نظام مجمع الرحمة الطبي</h1>
            <p className="sub">لكل دور واجهته حسب صلاحياته. اختر القسم والشاشة.</p>
          </div>
          <ThemeToggle label />
        </header>

        <SessionBar />

        <section className="flex flex-col gap-3" aria-labelledby="staff-h">
          <h2 id="staff-h" className="flex items-center gap-2 text-lg font-bold"><Icon name="users" size={20} className="text-primary" />أقسام الموظفين</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {status === "loading" ? <Spinner /> : STAFF.map((s) => <StaffCard key={s.key} s={s} user={status === "authed" ? user : null} onOpen={enterAs} />)}
          </div>
        </section>

        <section className="flex flex-col gap-3" aria-labelledby="public-h">
          <h2 id="public-h" className="flex items-center gap-2 text-lg font-bold"><Icon name="globe" size={20} className="text-primary" />واجهات المرضى والعامة</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {PUBLIC.map((p) => (
              <a key={p.key} href={p.href} className="group flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card transition hover:border-primary">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-primary-soft text-primary"><Icon name={p.icon} size={22} /></span>
                  <span className="flex flex-1 flex-col"><span className="text-[17px] font-bold">{p.title}</span><span className="text-xs text-ink-muted">{p.device}</span></span>
                  <Icon name="arrow-left" size={18} className="text-ink-muted group-hover:text-primary" />
                </div>
                <p className="text-sm leading-6 text-ink-2">{p.desc}</p>
                {p.note && <p className="flex items-start gap-1.5 text-xs text-ink-muted"><Icon name="info" size={14} className="mt-0.5 shrink-0" />{p.note}</p>}
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function SessionBar() {
  const { status, user, logout } = useAuth();
  if (status === "loading") return null;
  if (status !== "authed" || !user) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm">
        <Icon name="log-in" size={18} className="text-ink-muted" />
        <span className="flex-1">لست مسجلاً الآن. اختر شاشة وسيُطلب منك الدخول بحساب قسمها.</span>
        <Link href="/staff/login" className="font-semibold text-primary hover:underline">تسجيل الدخول</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm">
      <Icon name={roleMeta(user).icon} size={18} className="text-primary" />
      <span className="flex-1">مسجل الآن: <b>{user.full_name}</b> · {roleMeta(user).label}. الأقسام المتاحة لهذا الحساب تُفتح مباشرة، وغيرها يطلب الدخول بحسابها.</span>
      <button onClick={() => void logout()} className="flex items-center gap-1.5 font-semibold text-primary hover:underline"><Icon name="log-out" size={16} />تسجيل الخروج</button>
    </div>
  );
}

function StaffCard({ s, user, onOpen }: { s: StaffSection; user: StaffUser | null; onOpen: (s: StaffSection, href: string) => void }) {
  const role = user?.role ?? null;
  const open = user ? canOpenSection(user, s.key) : false;
  // القسم المتاح: شاشاته المسموحة فقط. غير المتاح: كل شاشاته (تُفتح بحساب ذلك القسم)
  const screens = open && user ? visibleNav(user, s.key) : (SECTION_NAV[s.key] ?? []);
  const roles = (SECTION_ROLES[s.key] ?? []).map((r) => ROLES[r]?.label).filter(Boolean).join("، ") + "، وأي دور مخصص بصلاحياته";
  const devUser = SHOW_DEV_USERS ? DEV_USERS[s.account] : undefined;
  const accent = s.tone === "finance" ? "bg-nav-finance" : "bg-nav-medical";
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
      <div className={`flex items-center gap-3 px-5 py-4 text-white ${accent}`}>
        <span className="grid size-11 place-items-center rounded-2xl bg-white/15"><Icon name={s.icon} size={22} /></span>
        <span className="flex flex-1 flex-col"><span className="text-[17px] font-bold">{s.title}</span><span className="text-xs text-white/75">{s.device}</span></span>
        {role && (open
          ? <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold"><Icon name="lock-open" size={13} />متاح لك</span>
          : <span className="flex items-center gap-1 rounded-full bg-black/20 px-2.5 py-1 text-xs font-semibold text-white/85"><Icon name="lock" size={13} />حساب آخر</span>)}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <p className="text-sm leading-6 text-ink-2">{s.desc}</p>
        <ul className="flex flex-col gap-1" aria-label={`شاشات ${s.title}`}>
          {screens.map((n) => (
            <li key={n.href}>
              <button type="button" onClick={() => onOpen(s, n.href)} className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start text-[14px] hover:bg-primary-soft">
                <Icon name={n.icon} size={17} className="text-primary" />
                <span className="flex-1">{n.label}</span>
                <Icon name="arrow-left" size={15} className="text-ink-muted opacity-0 transition group-hover:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-1 border-t border-line pt-3 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5"><Icon name="shield-check" size={14} />يفتحه: {roles}</span>
          {devUser && <span className="flex items-center gap-1.5"><Icon name="at-sign" size={14} />حساب التطوير: <b className="num text-ink-2" dir="ltr">{devUser}</b></span>}
        </div>
      </div>
    </article>
  );
}

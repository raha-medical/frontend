"use client";
/** الموقع التعريفي — Landing.dc.html: الهوية، الخدمات، رحلة المريض، الفروع وأقسامها، الأطباء، تحميل التطبيق. البيانات من /public/*. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BrandMark } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { API_URL } from "@/lib/config";
import { fmtTimesInText } from "@/lib/format";
import { BrandScene, BrandTile, ServiceArt } from "@/components/brand-scene";
import { DoctorPhoto, ISelect } from "@/components/ui";

const pub = async <T,>(p: string): Promise<T> => { const r = await fetch(API_URL + p); if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<T>; };
type Br = { branch_id: string; name: string; city: string | null; address: string | null; phone: string | null; working_hours: string | null; status: string; status_ar: string; status_reason_ar: string | null; departments: string[]; doctors_count: number; latitude: number | null; longitude: number | null; directions?: { google_maps_url: string } | null };
type Home = { branch: Br; departments: { department: string; department_ar: string; clinics: { clinic_id: string; name: string }[] }[]; doctors: { doctor_id: string; full_name: string; specialty: string; photo_url: string | null }[] };
const DEPT_ICON: Record<string, string> = { clinic: "stethoscope", lab: "flask-conical", radiology: "scan-line", pharmacy: "pill" };

/** ظهور العناصر عند التمرير (translateY 28px→0 + opacity، 900ms) مع احترام prefers-reduced-motion. */
function Reveal({ children, d = 0, className = "" }: { children: React.ReactNode; d?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} className={className} style={{ transform: on ? "none" : "translateY(28px)", opacity: on ? 1 : 0, transition: `transform 900ms cubic-bezier(.22,1,.36,1) ${d * 110}ms, opacity 900ms ease ${d * 110}ms` }}>{children}</div>;
}

export function Landing() {
  const branches = useQuery({ queryKey: ["public", "branches"], queryFn: () => pub<{ items: Br[] }>("/public/branches"), retry: 1 });
  const [sel, setSel] = useState<string | null>(null);
  const bid = sel ?? branches.data?.items[0]?.branch_id ?? null;
  const home = useQuery({ queryKey: ["public", "branch", bid], queryFn: () => pub<Home>(`/public/branches/${bid}`), enabled: !!bid });
  const [tick, setTick] = useState(103);
  useEffect(() => { const t = setInterval(() => setTick((x) => (x >= 120 ? 101 : x + 1)), 3200); return () => clearInterval(t); }, []);
  const count = branches.data?.items.length ?? 0;
  const nav = [["#about", "من نحن"], ["#services", "خدماتنا"], ["#journey", "رحلتك"], ["#branches", "الفروع"], ["#doctors", "الأطباء"]];
  const marquee = [["stethoscope", "الباطنية"], ["baby", "الأطفال"], ["heart-pulse", "القلبية"], ["bone", "العظام"], ["flask-conical", "المختبر"], ["scan-line", "الأشعة والسونار"], ["pill", "الصيدلية"], ["eye", "العيون"], ["ear", "الأنف والأذن"], ["smile", "الأسنان"]];
  return (
    <div className="min-h-dvh overflow-x-clip bg-surface text-ink [scroll-behavior:smooth]">
      <style>{`@keyframes rh-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}@keyframes rh-marq{from{transform:translateX(0)}to{transform:translateX(-50%)}}@media (prefers-reduced-motion:reduce){.rh-anim{animation:none!important}}`}</style>
      <nav className="glass-bar sticky top-2 z-40 mx-2 mt-2 flex items-center gap-4 rounded-panel px-[clamp(16px,4vw,56px)] py-3">
        <a href="#top" className="flex items-center gap-2.5 text-ink hover:text-ink"><BrandMark size={44} /><span className="hidden flex-col sm:flex"><span className="font-bold">مجمع عيادات الرحمة الطبي</span><span className="num text-[11px] tracking-wider text-ink-3">AL-RAHMA MEDICAL COMPLEX</span></span></a>
        <div className="hidden flex-1 justify-center gap-1 lg:flex">{nav.map(([h, l]) => <a key={h} href={h} className="rounded-full px-3.5 py-2 text-sm text-ink-2 hover:bg-bg hover:text-ink">{l}</a>)}</div>
        <span className="flex-1 lg:hidden" />
        <ThemeToggle />
        <Link href="/patient" className="flex h-11 items-center gap-2 rounded-full bg-brand-green-deep px-5 text-sm font-semibold text-white hover:bg-brand-navy hover:text-white"><Icon name="calendar-plus" size={17} /><span className="hidden sm:inline">احجز موعداً</span></Link>
      </nav>

      <section id="top" className="grid items-center gap-10 px-[clamp(16px,4vw,56px)] py-14 lg:grid-cols-[1.1fr_1fr] lg:py-20">
        <div className="flex flex-col gap-5">
          <Reveal d={1}><span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-4 py-2 text-sm text-primary-strong"><b className="num">{count || "—"}</b> {count === 1 ? "فرع" : "فروع"} · عيادات، مختبر، أشعة وصيدلية تحت سقف واحد</span></Reveal>
          <Reveal d={2}><h1 className="text-[clamp(32px,5vw,58px)] font-bold leading-[1.25] text-brand-navy dark:text-ink">رعاية تحتضن العائلة، وموعد يحترم وقتك</h1></Reveal>
          <Reveal d={3}><p className="max-w-xl text-lg leading-9 text-ink-2">احجز من هاتفك، وتابع دورك لحظة بلحظة حتى يُنادى رقمك. نتائج التحاليل والأشعة ووصفتك الإلكترونية تصلك في التطبيق، وتُصرف من صيدلية أي فرع.</p></Reveal>
          <Reveal d={4} className="flex flex-wrap gap-3">
            <Link href="/patient" className="flex h-14 items-center gap-2 rounded-full bg-brand-navy px-7 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:text-white"><Icon name="calendar-plus" size={19} />احجز موعدك الآن</Link>
            <a href="#branches" className="flex h-14 items-center gap-2 rounded-full border-[1.5px] border-line-strong px-7 font-semibold text-ink hover:border-brand-green hover:text-ink"><Icon name="map-pin" size={19} />أقرب فرع لك</a>
          </Reveal>
          <Reveal d={5} className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2">{[["clock", "لا انتظار بلا داعٍ"], ["shield-check", "ملف واحد لكل الفروع"], ["qr-code", "إيصال موثّق بـ QR"]].map(([i, l]) => <span key={l} className="flex items-center gap-1.5"><Icon name={i} size={16} className="text-brand-green-strong dark:text-brand-green" />{l}</span>)}</Reveal>
        </div>
        <Reveal d={2} className="relative">
          <BrandScene className="aspect-[4/3] w-full rounded-[40px]"><BrandTile size={104} /></BrandScene>
          <div className="rh-anim absolute -start-4 top-8 z-10 hidden sm:flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-float" style={{ animation: "rh-float 6s ease-in-out infinite" }}>
            <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary"><Icon name="radio" size={19} /></span>
            <span className="flex flex-col"><span className="sub-sm">الطابور الآن · الباطنية</span><span className="text-sm">يُخدم <b className="num">A-{tick}</b></span></span>
          </div>
          <div className="rh-anim absolute -end-3 bottom-10 z-10 hidden sm:flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-float" style={{ animation: "rh-float 7s ease-in-out infinite 1s" }}>
            <span className="grid size-10 place-items-center rounded-xl bg-lab-soft text-lab"><Icon name="flask-conical" size={19} /></span>
            <span className="flex flex-col"><span className="sub-sm">إشعار من التطبيق</span><span className="text-sm font-semibold">نتيجة التحليل جاهزة</span></span>
            <Icon name="badge-check" size={18} className="text-success" />
          </div>
        </Reveal>
      </section>

      <section dir="ltr" className="overflow-hidden border-y border-line bg-bg py-4">
        <div className="rh-anim flex w-max gap-10" style={{ animation: "rh-marq 42s linear infinite" }}>
          {[...marquee, ...marquee].map(([i, l], k) => <span key={k} dir="rtl" className="flex items-center gap-2 whitespace-nowrap text-lg text-ink-2"><Icon name={i} size={20} className="text-brand-green-strong dark:text-brand-green" />{l}</span>)}
        </div>
      </section>

      <section id="about" className="grid items-center gap-10 px-[clamp(16px,4vw,56px)] py-20 lg:grid-cols-2">
        <Reveal d={1} className="grid place-items-center"><div className="grid size-[min(360px,80vw)] place-items-center rounded-full bg-primary-soft"><BrandMark size={260} /></div></Reveal>
        <div className="flex flex-col gap-4">
          <Reveal d={1}><span className="font-semibold text-brand-green-strong dark:text-brand-green">من نحن</span></Reveal>
          <Reveal d={2}><h2 className="text-[clamp(26px,3.5vw,40px)] font-bold">شعارنا يحكي ما نؤمن به</h2></Reveal>
          <Reveal d={3}><p className="text-lg leading-9 text-ink-2">هلال يحتضن عائلة، وقلب يجمعها، ويدان تحميانها، ونبض لا يتوقف. هذا ما نقدمه في كل فرع: طب يعامل المريض كفرد من العائلة، ونظام يجعل الزيارة أوضح وأسرع.</p></Reveal>
          <div className="grid gap-3 sm:grid-cols-2">{[["heart-handshake", "الرحمة أولاً", "نعامل كل مريض كفرد من عائلتنا"], ["clock", "احترام الوقت", "دورك وتوقيت دخولك على هاتفك"], ["shield-check", "الأمان والخصوصية", "ملاحظاتك الطبية لا يراها إلا طبيبك"], ["building-2", "ملف واحد", "سجلك ووصفتك ورصيدك في كل الفروع"]].map(([i, t, d], k) => (
            <Reveal key={t} d={4 + (k % 2)}><div className="flex gap-3 rounded-2xl border border-line p-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-green/10 text-brand-green-strong dark:text-brand-green"><Icon name={i} size={19} /></span><span className="flex flex-col"><span className="font-bold">{t}</span><span className="sub">{d}</span></span></div></Reveal>
          ))}</div>
        </div>
      </section>

      <section id="services" className="bg-bg px-[clamp(16px,4vw,56px)] py-20">
        <Reveal d={1}><span className="font-semibold text-brand-green-strong dark:text-brand-green">خدماتنا</span></Reveal>
        <Reveal d={2}><h2 className="mb-2 text-[clamp(26px,3.5vw,40px)] font-bold">كل ما تحتاجه زيارتك، في مكان واحد</h2></Reveal>
        <Reveal d={3}><p className="mb-8 text-ink-2">من الكشف إلى التحليل إلى الدواء، بفاتورة واحدة وإيصال موثّق برمز QR.</p></Reveal>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {([["clinics", "stethoscope", "العيادات التخصصية", "كشف جديد ومراجعة بسعر واضح، ودورك على هاتفك.", ["حجز أونلاين", "مراجعة مخفضة"]], ["lab", "flask-conical", "المختبر", "تحاليل بنتائج معتمدة تصلك في التطبيق مع القيم المرجعية.", ["نتائج إلكترونية", "تنبيه القيم الحرجة"]], ["radiology", "scan-line", "الأشعة والسونار", "أشعة سينية وسونار بتقارير مكتوبة وصور مرفقة.", ["مواعيد مجدولة", "تقرير معتمد"]], ["pharmacy", "pill", "الصيدلية", "وصفة إلكترونية تُصرف من أي فرع حتى تاريخ انتهائها.", ["كود الوصفة", "بدائل موثقة"]]] as const).map(([k, i, t, d, tags]) => (
            <Reveal key={k} d={3}><article className="flex h-full flex-col overflow-hidden rounded-[28px] bg-surface transition hover:-translate-y-1 hover:shadow-float">
              <ServiceArt icon={i} className="aspect-[3/2] w-full" />
              <div className="flex flex-1 flex-col gap-2 p-5"><span className="flex items-center gap-2 text-lg font-bold"><Icon name={i} size={20} className="text-brand-green-strong dark:text-brand-green" />{t}</span><span className="sub flex-1 leading-7">{d}</span><span className="flex flex-wrap gap-1.5">{tags.map((x) => <span key={x} className="rounded-full bg-bg px-2.5 py-1 text-xs">{x}</span>)}</span></div>
            </article></Reveal>
          ))}
        </div>
      </section>

      <section id="journey" className="grid items-center gap-10 px-[clamp(16px,4vw,56px)] py-20 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Reveal d={1}><span className="font-semibold text-brand-green-strong dark:text-brand-green">رحلتك معنا</span></Reveal>
          <Reveal d={2}><h2 className="text-[clamp(26px,3.5vw,40px)] font-bold">من الحجز حتى الدواء، كل خطوة واضحة على هاتفك</h2></Reveal>
          <ol className="relative mt-2 flex flex-col gap-5 border-s-2 border-dashed border-brand-green/40 ps-6">
            {[["calendar-plus", "احجز", "اختر الفرع والطبيب واليوم، وادفع عربوناً أو كامل الكشفية إن أردت."], ["ticket", "تابع دورك", "رقمك ومن أمامك والوقت التقريبي، وتنبيه «تفضل للدخول»."], ["stethoscope", "المعاينة", "التشخيص والوصفة والطلبات تُحفظ في ملفك الموحد."], ["flask-conical", "النتائج", "تصلك النتائج والتقارير في التطبيق فور اعتمادها."], ["pill", "الدواء", "اصرف وصفتك بكودها من صيدلية أي فرع."]].map(([i, t, d], k) => (
              <Reveal key={t} d={3 + k}><li className="relative flex gap-3"><span className="absolute -start-[37px] grid size-7 place-items-center rounded-full bg-brand-green-deep text-white"><Icon name={i} size={14} /></span><span className="flex flex-col"><span className="font-bold">{t}</span><span className="sub leading-7">{d}</span></span></li></Reveal>
            ))}
          </ol>
        </div>
        <Reveal d={2} className="relative mx-auto w-[min(320px,80vw)]">
          <BrandScene className="aspect-[9/19] w-full rounded-[40px] border-8 border-ink shadow-float"><BrandMark size={120} tone="onDark" paper="rgb(var(--nav-medical))" /></BrandScene>
          <div className="rh-anim absolute -start-8 bottom-16 z-10 flex flex-col items-center rounded-2xl bg-surface px-5 py-3 shadow-float" style={{ animation: "rh-float 5s ease-in-out infinite" }}><span className="sub-sm">رقمك</span><span className="num text-2xl font-bold">A-107</span><span className="text-xs text-brand-green-strong dark:text-brand-green">أمامك 3</span></div>
        </Reveal>
      </section>

      <section id="branches" className="bg-bg px-[clamp(16px,4vw,56px)] py-20">
        <Reveal d={1}><span className="font-semibold text-brand-green-strong dark:text-brand-green">فروعنا</span></Reveal>
        <Reveal d={2}><h2 className="mb-2 text-[clamp(26px,3.5vw,40px)] font-bold">ملفك واحد في كل الفروع</h2></Reveal>
        <Reveal d={3}><p className="mb-6 text-ink-2">سجلك الطبي ووصفتك ورصيدك تنتقل معك. احجز في أي فرع، واصرف وصفتك من أي صيدلية تابعة للمجمع.</p></Reveal>
        {branches.isError ? <p className="sub">تعذر تحميل الفروع الآن.</p> : (
          <>
            {count > 1 && <div className="mb-5 w-full max-w-sm"><ISelect aria-label="اختر الفرع" value={bid ?? ""} onChange={(v) => { if (v) setSel(v); }} options={(branches.data?.items ?? []).map((b) => ({ value: b.branch_id, label: b.name, icon: "map-pin", hint: b.city ?? undefined }))} /></div>}
            {home.data && (() => { const b = home.data.branch; return (
              <div className="grid overflow-hidden rounded-[32px] bg-surface lg:grid-cols-2">
                <ServiceArt icon="hospital" className="min-h-[240px] w-full" />
                <div className="flex flex-col gap-4 p-7">
                  <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold ${b.status === "open" ? "bg-success-soft text-success-strong" : "bg-warn-soft text-warn-strong"}`}>{b.status_ar}{b.status_reason_ar ? ` · ${b.status_reason_ar}` : ""}</span>
                  <span className="flex items-center gap-3"><BrandMark size={52} /><span className="flex flex-col"><span className="text-xl font-bold">{b.name}</span><span className="sub">{b.city}</span></span></span>
                  <div className="flex flex-col gap-2 text-sm">{([["map-pin", "العنوان", b.address], ["clock", "الدوام", fmtTimesInText(b.working_hours)], ["phone", "الهاتف", b.phone]] as const).filter(([, , v]) => v).map(([i, k, v]) => <span key={k} className="flex items-center gap-2"><Icon name={i} size={16} className="text-brand-green-strong dark:text-brand-green" /><span className="text-ink-2">{k}</span><span className={k === "الهاتف" ? "num" : ""} dir={k === "الهاتف" ? "ltr" : undefined}>{v}</span></span>)}</div>
                  <span className="sub-sm">الأقسام في هذا الفرع</span>
                  <div className="flex flex-wrap gap-2">{home.data.departments.flatMap((d) => d.clinics.map((c) => <span key={c.clinic_id} className="flex items-center gap-1.5 rounded-full bg-bg px-3 py-1.5 text-sm"><Icon name={DEPT_ICON[d.department] ?? "building"} size={14} />{c.name}</span>))}</div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Link href="/patient" className="flex h-12 items-center gap-2 rounded-full bg-brand-green-deep px-5 font-semibold text-white hover:bg-brand-navy hover:text-white"><Icon name="calendar-plus" size={17} />احجز في {b.name}</Link>
                    {b.directions && <a href={b.directions.google_maps_url} target="_blank" rel="noreferrer" className="flex h-12 items-center gap-2 rounded-full border border-line-strong px-4 text-ink"><Icon name="navigation" size={16} />الاتجاهات</a>}
                    {b.phone && <a href={`tel:${b.phone}`} className="flex h-12 items-center gap-2 rounded-full border border-line-strong px-4 text-ink"><Icon name="phone" size={16} />اتصل</a>}
                  </div>
                </div>
              </div>
            ); })()}
          </>
        )}
      </section>

      <section id="doctors" className="px-[clamp(16px,4vw,56px)] py-20">
        <div className="mb-8 flex flex-wrap items-end gap-3"><div className="flex flex-1 flex-col gap-2"><Reveal d={1}><span className="font-semibold text-brand-green-strong dark:text-brand-green">أطباؤنا</span></Reveal><Reveal d={2}><h2 className="text-[clamp(26px,3.5vw,40px)] font-bold">نخبة من الاختصاصيين</h2></Reveal></div>
          <Link href="/patient" className="flex items-center gap-1 font-semibold">كل الأطباء والمواعيد<Icon name="arrow-left" size={16} /></Link></div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {(home.data?.doctors ?? []).slice(0, 8).map((d) => (
            <Reveal key={d.doctor_id} d={3}><article className="flex flex-col overflow-hidden rounded-[28px] border border-line transition hover:-translate-y-1">
              <DoctorPhoto src={d.photo_url} name={d.full_name} textClass="text-6xl" sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="aspect-square w-full" />
              <div className="flex items-center gap-2 p-4"><span className="flex flex-1 flex-col"><span className="flex items-center gap-1 text-xs text-brand-green-strong dark:text-brand-green"><Icon name="stethoscope" size={13} />{d.specialty}</span><span className="font-bold">{d.full_name}</span></span>
                <Link href="/patient" title="احجز" aria-label={`احجز عند ${d.full_name}`} className="grid size-11 place-items-center rounded-full bg-brand-green-deep text-white hover:text-white"><Icon name="calendar-plus" size={18} /></Link></div>
            </article></Reveal>
          ))}
          {!home.data?.doctors.length && <p className="sub">تظهر قائمة الأطباء عند تشغيل الخادم.</p>}
        </div>
      </section>

      <section id="app" className="px-[clamp(16px,4vw,56px)] pb-20">
        <Reveal d={2}><div className="relative flex flex-col gap-5 overflow-hidden rounded-[40px] bg-brand-green-deep p-10 text-white lg:p-14">
          <div className="pointer-events-none absolute -end-20 -top-20 opacity-20"><BrandMark size={380} tone="onDark" paper="rgb(var(--brand-green-deep))" /></div>
          <h2 className="max-w-2xl text-[clamp(24px,3vw,38px)] font-bold">حمّل تطبيق الرحمة، وتابع العائلة كلها من رقم واحد</h2>
          <p className="max-w-2xl text-lg leading-8 text-white/90">ادخل برقم هاتفك فقط. أضف أفراد عائلتك، واحجز لهم، وتلقَّ تنبيه «تفضل للدخول» ونتائجهم ووصفاتهم في مكان واحد.</p>
          <div className="flex flex-wrap gap-3"><Link href="/patient" className="flex h-14 items-center gap-2 rounded-2xl bg-black/85 px-5 text-white hover:text-white"><Icon name="smartphone" size={20} />افتح التطبيق على الويب</Link></div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">{["حجز للعائلة", "تنبيه الدور", "النتائج والوصفات", "الدفع الإلكتروني"].map((x) => <span key={x} className="flex items-center gap-1.5 text-sm"><Icon name="circle-check" size={16} />{x}</span>)}</div>
        </div></Reveal>
      </section>

      <footer className="flex flex-wrap items-center gap-4 border-t border-line px-[clamp(16px,4vw,56px)] py-8 text-sm text-ink-2">
        <BrandMark size={36} /><span className="flex-1">© {new Date().getFullYear()} مجمع عيادات الرحمة الطبي</span>
        <Link href="/staff/login" className="text-ink-2">دخول الموظفين</Link>
      </footer>
    </div>
  );
}

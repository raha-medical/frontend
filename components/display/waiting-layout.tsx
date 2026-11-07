"use client";
import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { QrCode } from "@/components/qr";

type Board = { doctor_name: string; now_serving: string | null; next: string[] };
interface Props {
  boards: Board[]; clinic: string; time: string; error: string | null;
  checkin: { enabled: boolean; qr_payload: string | null } | null;
  called: { ticket_number: string; doctor_name: string; room?: string | null } | null;
  needsSound: boolean; onEnableSound: () => Promise<void>;
}

export function WaitingLayout({ boards, clinic, time, error, checkin, called, needsSound, onEnableSound }: Props) {
  const [base, setBase] = useState("");
  useEffect(() => {
    try {
      const url = new URL(process.env.NEXT_PUBLIC_PATIENT_APP_URL || "/patient", window.location.origin);
      if (url.protocol === "https:" || url.protocol === "http:") { url.search = ""; url.hash = ""; setBase(url.toString()); }
    } catch { /* يبقى الرمز مخفياً عند خطأ إعداد الرابط */ }
  }, []);
  const token = checkin?.qr_payload?.startsWith("alrahma://checkin?t=") ? checkin.qr_payload.slice("alrahma://checkin?t=".length) : null;
  const link = base && checkin?.enabled && token ? `${base}?tab=bookings&t=${encodeURIComponent(token)}` : null;
  return <main className="flex min-h-dvh flex-col bg-[#071f2c] text-white lg:h-dvh lg:overflow-hidden">
    <header className="flex shrink-0 items-center gap-4 border-b border-white/10 px-5 py-4 lg:px-8">
      <BrandMark size={56} tone="onDark" paper="#071f2c" /><div className="flex min-w-0 flex-1 flex-col"><h1 className="text-xl font-bold lg:text-2xl">مجمع الرحمة الطبي</h1><span className="text-sm text-white/65">{clinic}</span></div>
      {needsSound && <button onClick={() => void onEnableSound()} className="flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-4 text-sm font-semibold"><Icon name="volume-2" size={20} />تفعيل النداء</button>}
      <time className="num whitespace-nowrap text-lg font-semibold lg:text-2xl">{time}</time>
    </header>
    {error && <div role="status" className="mx-5 mt-3 rounded-xl bg-warn/20 px-4 py-2 text-sm text-on-nav-warn">{error}</div>}
    <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-2 lg:gap-5 lg:p-6">
      <aside className="flex min-h-0 min-w-0 flex-col items-center justify-center gap-5 rounded-[28px] border border-white/15 bg-[#0b3942] p-6 text-center lg:gap-4 [@media(max-height:800px)]:gap-2 [@media(max-height:800px)]:p-4" aria-label="تسجيل الحضور من شاشة الانتظار">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-[#9ce8e7]"><Icon name="smartphone" size={19} />حضورك يبدأ من هنا</span>
        <div><h2 className="text-3xl font-bold leading-tight lg:text-[clamp(28px,2.5vw,46px)] [@media(max-height:800px)]:!text-2xl">وصلت؟ ثبّت حضورك</h2><p className="mt-3 text-base text-white/75 lg:text-lg [@media(max-height:800px)]:mt-2 [@media(max-height:800px)]:!text-sm">امسح الرمز بهاتفك وافتح تطبيق المراجع</p></div>
        <div className="grid aspect-square w-[min(64vw,32vh,360px)] shrink-0 place-items-center rounded-[24px] bg-white p-4 shadow-xl lg:w-[min(29vw,39vh,440px)] [@media(max-height:800px)]:!w-[min(64vw,27vh,300px)]">
          {link ? <span className="w-full [&_svg]:h-auto [&_svg]:w-full"><QrCode value={link} size={380} /></span> : <div className="flex flex-col items-center gap-3 p-4 text-[#0b3942]"><Icon name={checkin?.enabled === false ? "user-round" : "loader-circle"} size={48} /><p className="text-base font-semibold">{checkin?.enabled === false ? "راجع الاستقبال لتثبيت حضورك" : "جارٍ تجهيز رمز الحضور…"}</p></div>}
        </div>
        <ol className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-base font-semibold lg:text-lg [@media(max-height:800px)]:!text-sm"><li>افتح الرابط</li><li>سجّل دخولك</li><li>أكّد حضورك</li></ol>
        <p className="max-w-md text-sm leading-6 text-white/65 [@media(max-height:800px)]:text-xs [@media(max-height:800px)]:leading-5">داخل التطبيق؟ اضغط زر المسح أعلى الشاشة ووجّه الكاميرا إلى هذا الرمز.</p>
        <span className="flex items-center gap-2 text-xs text-[#9ce8e7]"><Icon name="refresh-cw" size={14} />رمز متجدد لتسجيل حضورك في العيادة</span>
      </aside>
      <section className="flex min-h-0 min-w-0 flex-col gap-4 rounded-[28px] bg-[#f1f7f8] p-5 text-[#0a2b3b] lg:p-6" aria-label="الطابور الحالي والقادم">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-2xl font-bold lg:text-3xl">الطابور الآن</h2><p className="mt-1 text-sm text-[#58717b]">تابع رقمك وانتظر النداء</p></div><Icon name="list-ordered" size={30} className="text-[#0b7683]" /></div>
        {called && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#0b7683] px-5 py-3 text-white"><span className="flex items-center gap-2 font-semibold"><Icon name="megaphone" size={24} />تفضل للدخول · {called.doctor_name}{called.room ? ` · ${called.room}` : ""}</span><span className="num text-4xl font-bold">{called.ticket_number}</span></div>}
        <div className="grid min-h-0 min-w-0 flex-1 gap-4 overflow-auto" style={{ gridTemplateColumns: boards.length > 2 ? "repeat(2,minmax(0,1fr))" : "minmax(0,1fr)" }}>
          {!boards.length && <div className="grid min-h-48 place-items-center rounded-2xl border border-[#d9e6e9] text-[#58717b]">{error ? "بانتظار عودة الاتصال" : "بانتظار بيانات الطابور"}</div>}
          {boards.map(b => <section key={b.doctor_name} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[#d9e6e9] bg-white p-4 lg:p-5"><h3 className="flex items-center gap-2 text-base font-bold lg:text-xl"><Icon name="stethoscope" size={22} className="text-[#0b7683]" />{b.doctor_name}</h3><div className="flex flex-col items-center gap-2 rounded-2xl bg-[#e5f3f3] px-3 py-4"><span className="text-sm font-semibold text-[#456570]">الرقم الحالي</span><span className="num text-[clamp(52px,6.5vw,120px)] font-bold leading-none tracking-tight text-[#096975]">{b.now_serving ?? "—"}</span></div><span className="text-sm font-semibold text-[#58717b]">الأرقام القادمة</span><div className="flex flex-wrap gap-2">{b.next.slice(0,5).map(n => <span key={n} className="num rounded-xl border border-[#d9e6e9] bg-[#f1f7f8] px-4 py-2 text-xl font-bold">{n}</span>)}{!b.next.length && <span className="text-sm text-[#58717b]">لا توجد أرقام بانتظار النداء</span>}</div></section>)}
        </div>
      </section>
    </div>
    <footer className="shrink-0 px-5 pb-4 text-center text-xs text-white/55">حفاظًا على خصوصيتك، نعرض أرقام الأدوار فقط دون أسماء المراجعين</footer>
  </main>;
}

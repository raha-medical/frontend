"use client";
/** لوحة الإحصائيات (GET /reports/stats): مؤشرات الفترة مقارنة بالفترة السابقة، الإيراد والزيارات يومياً،
 *  توزيع الإيراد حسب القسم وطريقة الدفع، مقارنة الفروع، أيام الأسبوع، وأكثر الأطباء زيارات.
 *  الرسوم SVG بلا مكتبات: لون واحد (primary) لكل رسم، والقيمة مكتوبة نصاً، وتلميح عند المرور، وجدول بديل. */
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { Alert, ISelect, Segmented, Spinner } from "@/components/ui";
import { statsApi, type Stats, type StatsTotals } from "@/lib/api/finance";
import { errorMessage } from "@/lib/api/errors";
import { addDays, todayBaghdad } from "@/lib/date";
import { fmtDayMonth, fmtNum, fmtWeekdayDate } from "@/lib/format";
import { useAuth } from "@/lib/auth/store";
import { DEPT_AR, Panel, useBranches } from "./kit";
import { AssistantUsageCard } from "./assistant-usage";

type Range = "1" | "7" | "30" | "90" | "365";
const METHOD_AR: Record<string, string> = { cash: "نقداً بالدينار", pos: "بطاقة (POS)", online: "إلكتروني", cash_usd: "نقداً بالدولار (مقابله بالدينار)" };
const usd = (n: number) => `$${fmtNum(n)}`;
const WEEKDAY_AR: Record<string, string> = { saturday: "السبت", sunday: "الأحد", monday: "الإثنين", tuesday: "الثلاثاء", wednesday: "الأربعاء", thursday: "الخميس", friday: "الجمعة" };
const short = (n: number) => (Math.abs(n) >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${+(n / 1e3).toFixed(0)}K` : String(n));
const iqd = (n: number) => `${fmtNum(n)} د.ع`;

export function StatsScreen() {
  const me = useAuth((s) => s.user)!;
  const branches = useBranches();
  const [range, setRange] = useState<Range>("30");
  const [branch, setBranch] = useState("all");
  const to = todayBaghdad();
  const from = addDays(to, -(Number(range) - 1));
  const q = useQuery({ queryKey: ["reports", "stats", from, to, branch], queryFn: () => statsApi.get({ from, to, branch_id: branch === "all" ? undefined : branch }), refetchInterval: 60_000 });
  const mine = (branches.data?.items ?? []).filter((x) => me.role === "admin" || me.branch_ids.includes(x.branch_id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="-mx-1 overflow-x-auto px-1"><Segmented value={range} onChange={setRange} options={[
          { value: "1", label: "اليوم" }, { value: "7", label: "7 أيام" }, { value: "30", label: "30 يوماً" }, { value: "90", label: "3 أشهر" }, { value: "365", label: "سنة" },
        ]} /></div>
        {mine.length > 1 && <div className="w-full max-w-[260px]"><ISelect label="الفرع" value={branch} onChange={(v) => setBranch(v || "all")} size="md"
          options={[{ value: "all", label: "كل الفروع", icon: "layout-grid" }, ...mine.map((b) => ({ value: b.branch_id, label: b.name, icon: "building-2" }))]} /></div>}
        <span className="flex-1" />
        {me.role === "admin" && <Link href="/staff/admin/map" className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-strong"><Icon name="map" size={17} />خريطة الفروع</Link>}
      </div>
      {q.isError && <Alert tone="danger">{errorMessage(q.error)}</Alert>}
      {q.isPending ? <div className="grid min-h-[300px] place-items-center"><Spinner label="جارٍ حساب الإحصائيات…" /></div> : q.data && <Body s={q.data} />}
      {/* المساعد: أرقام عامة للمدير العام فقط، وأقصى فترة 92 يوماً */}
      {me.role === "admin" && <AssistantUsageCard from={Number(range) > 92 ? addDays(to, -91) : from} to={to} />}
    </div>
  );
}

function Body({ s }: { s: Stats }) {
  const t = s.totals, p = s.previous_totals, c = s.currency, pc = s.previous_currency;
  const dates = s.days.map((d) => d.date);
  const dept = s.departments.map((d) => ({ name: DEPT_AR[d.key]?.label ?? d.key, value: d.value }));
  const methods = s.methods.map((m) => ({ name: METHOD_AR[m.key] ?? m.key, value: m.value }));
  return (
    <>
      <span className="sub-sm">من <span className="num">{fmtWeekdayDate(s.from)}</span> إلى <span className="num">{fmtWeekdayDate(s.to)}</span> · الأسهم مقارنة بالفترة السابقة بنفس الطول.</span>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi icon="banknote" label="صافي الإيراد" value={iqd(t.revenue)} cur={t.revenue} prev={p.revenue} hint={`متوسط اليوم ${iqd(t.avg_per_day)}`} />
        <Kpi icon="wallet" label="المقبوض بالدينار" value={iqd(c.iqd)} cur={c.iqd} prev={pc.iqd} />
        <Kpi icon="circle-dollar-sign" label="المقبوض بالدولار" value={usd(c.usd)} cur={c.usd} prev={pc.usd} hint={c.usd ? `مقابله ${iqd(c.usd_as_iqd)}` : undefined} />
        <Kpi icon="users" label="الزيارات" value={fmtNum(t.visits)} cur={t.visits} prev={p.visits} hint={`${fmtNum(t.patients)} مراجع مختلف`} />
        <Kpi icon="user-plus" label="مراجعون جدد" value={fmtNum(t.new_patients)} cur={t.new_patients} prev={p.new_patients} />
        <Kpi icon="calendar-check" label="الحجوزات" value={fmtNum(t.bookings)} cur={t.bookings} prev={p.bookings} />
        <Kpi icon="circle-check" label="نسبة الحضور" value={t.attendance_rate == null ? "—" : `${t.attendance_rate}%`} cur={t.attendance_rate} prev={p.attendance_rate} pts />
        <Kpi icon="calendar-x" label="نسبة الإلغاء" value={t.cancellation_rate == null ? "—" : `${t.cancellation_rate}%`} cur={t.cancellation_rate} prev={p.cancellation_rate} pts lowerIsBetter />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="صافي الإيراد يومياً" icon="chart-line" actions={<span className="sub-sm">د.ع</span>}>
          <TimeChart kind="area" dates={dates} values={s.days.map((d) => d.revenue)} fmt={iqd} label="صافي الإيراد يومياً" />
        </Panel>
        <Panel title="الزيارات يومياً" icon="chart-column" actions={<span className="sub-sm">مراجع حضر</span>}>
          <TimeChart kind="bar" dates={dates} values={s.days.map((d) => d.visits)} fmt={(n) => `${fmtNum(n)} زيارة`} label="الزيارات يومياً" />
        </Panel>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel title="الإيراد حسب القسم" icon="hospital"><HBars rows={dept} fmt={iqd} share /></Panel>
        <Panel title="المقبوض حسب طريقة الدفع" icon="wallet"><HBars rows={methods} fmt={iqd} share />{c.usd > 0 && <span className="sub-sm">قُبض بالدولار <b className="num">{usd(c.usd)}</b> فعلياً.</span>}</Panel>
        <Panel title="الزيارات حسب يوم الأسبوع" icon="calendar-days"><HBars rows={s.weekdays.map((w) => ({ name: WEEKDAY_AR[w.key] ?? w.key, value: w.value }))} fmt={fmtNum} keepOrder /></Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {s.branches.length > 1 && <Panel title="الفروع: صافي الإيراد" icon="building-2"><HBars rows={s.branches.map((b) => ({ name: b.name, value: b.revenue, href: `/staff/admin/branches/${b.branch_id}` }))} fmt={iqd} share /></Panel>}
        {s.branches.length > 1 && <Panel title="الفروع: الزيارات" icon="users"><HBars rows={s.branches.map((b) => ({ name: b.name, value: b.visits }))} fmt={fmtNum} share /></Panel>}
        <Panel title="أكثر الأطباء زيارات" icon="stethoscope">
          <HBars rows={s.top_doctors.map((d) => ({ name: d.branch_name && s.branches.length > 1 ? `${d.name} · ${d.branch_name}` : d.name, value: d.visits }))} fmt={fmtNum} empty="لا زيارات في هذه الفترة." />
        </Panel>
        <Panel title="الحجوزات والإلغاء والغياب" icon="calendar-x">
          <TimeChart kind="bar" dates={dates} values={s.days.map((d) => d.cancelled + d.no_shows)} fmt={(n) => `${fmtNum(n)} إلغاء أو غياب`} label="الإلغاء والغياب يومياً" />
          <span className="sub-sm">مجموع الإلغاء <b className="num">{fmtNum(t.cancelled)}</b> والغياب <b className="num">{fmtNum(t.no_shows)}</b> من <b className="num">{fmtNum(t.bookings + t.cancelled)}</b> حجز.</span>
        </Panel>
      </div>

      <details className="glass rounded-card p-4">
        <summary className="cursor-pointer text-sm font-bold">عرض الأرقام اليومية كجدول</summary>
        <div className="mt-3 max-h-[420px] overflow-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="sticky top-0 bg-surface text-ink-2"><tr>{["اليوم", "صافي الإيراد", "الاسترجاع", "المقبوض بالدينار", "المقبوض بالدولار", "الزيارات", "الحجوزات", "الإلغاء", "الغياب", "مراجعون جدد"].map((h) => <th key={h} className="px-2 py-2 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody className="num">{[...s.days].reverse().map((d) => (
              <tr key={d.date} className="border-t border-line"><td className="px-2 py-1.5">{fmtWeekdayDate(d.date)}</td><td className="px-2">{fmtNum(d.revenue)}</td><td className="px-2">{fmtNum(d.refunds)}</td><td className="px-2">{fmtNum(d.collected_iqd)}</td><td className="px-2">{usd(d.collected_usd)}</td>
                <td className="px-2">{fmtNum(d.visits)}</td><td className="px-2">{fmtNum(d.bookings)}</td><td className="px-2">{fmtNum(d.cancelled)}</td><td className="px-2">{fmtNum(d.no_shows)}</td><td className="px-2">{fmtNum(d.new_patients)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </>
  );
}

/** بطاقة مؤشر: القيمة، والتغير عن الفترة السابقة بسهم وكلمة (لا يعتمد على اللون وحده). */
function Kpi({ icon, label, value, cur, prev, hint, pts, lowerIsBetter }: { icon: string; label: string; value: string; cur: number | null; prev: number | null; hint?: string; pts?: boolean; lowerIsBetter?: boolean }) {
  let delta: { text: string; up: boolean; good: boolean } | null = null;
  const fresh = !pts && cur != null && cur > 0 && prev === 0;
  if (cur != null && prev != null) {
    const diff = pts ? Math.round((cur - prev) * 10) / 10 : prev === 0 ? null : Math.round(((cur - prev) / prev) * 100);
    if (diff != null && diff !== 0) delta = { text: `${diff > 0 ? "+" : ""}${diff}${pts ? " نقطة" : "%"}`, up: diff > 0, good: lowerIsBetter ? diff < 0 : diff > 0 };
  }
  return (
    <div className="glass flex flex-col gap-1.5 rounded-card p-4">
      <span className="flex items-center gap-2 text-sm text-ink-2"><Icon name={icon} size={16} className="text-primary" />{label}</span>
      <b className="num text-[20px] leading-tight">{value}</b>
      <span className="flex flex-wrap items-center gap-x-2 text-xs">
        {delta ? <span className={`num inline-flex items-center gap-0.5 font-semibold ${delta.good ? "text-success-strong" : "text-danger-strong"}`}><Icon name={delta.up ? "trending-up" : "trending-down"} size={14} />{delta.text}</span>
          : <span className="text-ink-muted">{fresh ? "لا بيانات في الفترة السابقة" : "بلا تغيير"}</span>}
        {hint && <span className="text-ink-2">{hint}</span>}
      </span>
    </div>
  );
}

/** أعمدة أفقية بلون واحد مرتبة من الأكبر، والقيمة والنسبة مكتوبتان. */
function HBars({ rows, fmt, share, keepOrder, empty = "لا بيانات في هذه الفترة." }: { rows: { name: string; value: number; href?: string }[]; fmt: (n: number) => string; share?: boolean; keepOrder?: boolean; empty?: string }) {
  const list = keepOrder ? rows : [...rows].sort((a, b) => b.value - a.value);
  const max = Math.max(0, ...list.map((r) => r.value));
  const total = list.reduce((a, r) => a + Math.max(0, r.value), 0);
  if (!max) return <span className="sub-sm">{empty}</span>;
  return (
    <div className="flex flex-col gap-2.5">
      {list.map((r) => {
        const pc = total ? Math.round((r.value / total) * 100) : 0;
        const name = r.href ? <Link href={r.href} className="hover:underline">{r.name}</Link> : r.name;
        return (
          <div key={r.name} className="group flex flex-col gap-1" title={`${r.name}: ${fmt(r.value)}${share ? ` (${pc}%)` : ""}`}>
            <span className="flex items-baseline gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{name}</span><b className="num">{fmt(r.value)}</b>{share && <span className="num w-10 text-end text-xs text-ink-2">{pc}%</span>}</span>
            <span className="block h-2.5 overflow-hidden rounded-[4px] bg-bg"><span className="block h-full rounded-[4px] bg-primary transition-[width] duration-slow group-hover:bg-primary-strong" style={{ width: `${r.value > 0 ? Math.max(1, (r.value / max) * 100) : 0}%` }} /></span>
          </div>
        );
      })}
    </div>
  );
}

/** أعلى المحور: 4 أقسام بخطوة 1 أو 2 أو 5 × 10^n (أرقام صحيحة دائماً). */
function niceMax(v: number) {
  if (v <= 0) return 4;
  const raw = v / 4, p = 10 ** Math.floor(Math.log10(raw)), n = raw / p;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p) * 4;
}

/** رسم زمني بسلسلة واحدة (مساحة أو أعمدة) مع خط تتبع وتلميح عند المرور أو اللمس. */
function TimeChart({ kind, dates, values, fmt, label }: { kind: "area" | "bar"; dates: string[]; values: number[]; fmt: (n: number) => string; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const H = 220, L = 44, R = 8, T = 10, B = 26;
  const n = values.length;
  const max = niceMax(Math.max(0, ...values));
  const iw = w - L - R, ih = H - T - B;
  const step = n ? iw / n : iw;
  const x = (i: number) => L + step * i + step / 2;
  const y = (v: number) => T + ih - (Math.max(0, v) / max) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
  const line = useMemo(() => values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(""), [values, w, max]); // eslint-disable-line react-hooks/exhaustive-deps
  const bw = Math.max(2, Math.min(28, step - 2));
  const bar = (i: number, v: number) => {
    const h = Math.max(0, T + ih - y(v)); if (h <= 0) return "";
    const r = Math.min(4, bw / 2, h), x0 = x(i) - bw / 2, x1 = x0 + bw, y0 = T + ih, y1 = y0 - h;
    return `M${x0},${y0}V${y1 + r}Q${x0},${y1} ${x0 + r},${y1}H${x1 - r}Q${x1},${y1} ${x1},${y1 + r}V${y0}Z`;
  };
  const move = (clientX: number) => {
    const rect = box.current!.getBoundingClientRect();
    const i = Math.floor((clientX - rect.left - L) / step);
    setHover(i >= 0 && i < n ? i : null);
  };
  const total = values.reduce((a, v) => a + v, 0);
  return (
    <div ref={box} dir="ltr" className="relative w-full select-none" onMouseMove={(e) => move(e.clientX)} onMouseLeave={() => setHover(null)} onTouchStart={(e) => move(e.touches[0].clientX)} onTouchMove={(e) => move(e.touches[0].clientX)}>
      <svg width={w} height={H} role="img" aria-label={`${label}: المجموع ${fmt(total)}`} className="block">
        {ticks.map((t) => <g key={t}><line x1={L} x2={w - R} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} strokeDasharray={t ? "3 4" : undefined} />
          <text x={L - 6} y={y(t) + 4} textAnchor="end" className="fill-ink-2 text-[11px]">{short(t)}</text></g>)}
        {dates.map((d, i) => i % every === 0 && <text key={d} x={x(i)} y={H - 8} textAnchor="middle" className="fill-ink-2 text-[11px]">{fmtDayMonth(d)}</text>)}
        {kind === "area" ? <>
          <path d={`${line}L${x(n - 1)},${T + ih}L${x(0)},${T + ih}Z`} className="fill-primary/15" />
          <path d={line} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        </> : values.map((v, i) => <path key={i} d={bar(i, v)} className={hover === i ? "fill-primary-strong" : "fill-primary"} />)}
        {hover != null && <>
          <line x1={x(hover)} x2={x(hover)} y1={T} y2={T + ih} className="stroke-ink-muted" strokeWidth={1} />
          {kind === "area" && <circle cx={x(hover)} cy={y(values[hover])} r={5} className="fill-primary stroke-surface" strokeWidth={2} />}
        </>}
      </svg>
      {hover != null && (
        <div dir="rtl" className="pointer-events-none absolute top-1 z-10 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop" style={{ left: Math.min(Math.max(x(hover) - 80, 0), w - 170), width: 170 }}>
          <div className="text-ink-2">{fmtWeekdayDate(dates[hover])}</div>
          <b className="num text-sm">{fmt(values[hover])}</b>
        </div>
      )}
    </div>
  );
}

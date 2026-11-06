"use client";
/** لوحة المدير العام (المواصفة 7): الخريطة الحية ومقارنة الفروع. العقد 24: GET /reports/branches-overview، ويتحدث كل 30 ثانية. */
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { Alert, Badge, Button, DataGrid, Segmented, Spinner, type BadgeTone } from "@/components/ui";
import { entitlementsApi, type BranchOverview } from "@/lib/api/finance";
import { errorMessage } from "@/lib/api/errors";
import { fmtNum, fmtTimesInText } from "@/lib/format";
const kindOf = (s: string) => (s === "open" ? "open" : s === "open_after_hours" ? "late" : "closed");

const OverviewMap = dynamic(() => import("./overview-map"), { ssr: false, loading: () => <div className="absolute inset-0 grid place-items-center bg-bg"><Spinner label="جارٍ تحميل الخريطة…" /></div> });

const useOverview = () => useQuery({ queryKey: ["admin", "overview"], queryFn: () => entitlementsApi.overview(), refetchInterval: 30_000 });
const TONE: Record<string, BadgeTone> = { open: "success", late: "warn", closed: "muted" };
const ICON: Record<string, string> = { open: "circle-check", late: "alarm-clock", closed: "moon" };
type Filter = "all" | "open" | "late" | "closed";

export function BranchStatus({ b }: { b: BranchOverview }) {
  const k = kindOf(b.live_status);
  return <Badge tone={TONE[k]} icon={ICON[k]} variant={k === "late" ? "solid" : "soft"}>{b.live_status_ar}</Badge>;
}

function Figure({ icon, label, value }: { icon: string; label: string; value: string }) {
  return <span className="flex items-center gap-2"><Icon name={icon} size={17} className="text-primary" /><span className="flex flex-col leading-tight"><b className="num text-[17px]">{value}</b><span className="sub-sm">{label}</span></span></span>;
}

export function BranchMapScreen() {
  const q = useOverview();
  const [filter, setFilter] = useState<Filter>("all");
  const [sel, setSel] = useState<string | null>(null);
  const all = useMemo(() => q.data?.items ?? [], [q.data]);
  const shown = useMemo(() => (filter === "all" ? all : all.filter((b) => kindOf(b.live_status) === filter)), [all, filter]);
  const picked = all.find((b) => b.branch_id === sel) ?? null;
  const late = all.filter((b) => b.live_status === "open_after_hours");
  const unplaced = all.filter((b) => b.latitude == null || b.longitude == null);
  return (
    <div className="relative -mx-4 -mb-12 -mt-5 h-[calc(100dvh-104px)] min-h-[560px] overflow-hidden sm:-mx-7">
      <OverviewMap items={shown} selected={sel} onSelect={setSel} />
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] flex flex-col gap-2 sm:inset-x-4">
        {q.isError && <div className="pointer-events-auto"><Alert tone="danger">{errorMessage(q.error)}</Alert></div>}
        {q.data && (
          <div className="glass pointer-events-auto flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl p-3 shadow-glass">
            <Figure icon="users" label="مراجعو اليوم" value={fmtNum(q.data.patients_today)} />
            <Figure icon="banknote" label="إيراد اليوم" value={fmtNum(q.data.revenue_today)} />
            <Figure icon="stethoscope" label="أطباء حاضرون" value={fmtNum(q.data.doctors_present)} />
            <span className="flex-1" />
            <Link href="/staff/admin/stats" className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-strong"><Icon name="chart-line" size={17} />الإحصائيات</Link>
            <Link href="/staff/admin/compare" className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-strong"><Icon name="chart-column" size={17} />مقارنة الفروع</Link>
          </div>
        )}
        {q.data && <div className="pointer-events-auto self-start overflow-x-auto"><Segmented value={filter} onChange={setFilter} options={[
          { value: "all", label: `الكل (${all.length})` }, { value: "open", label: `مفتوح (${q.data.open})`, icon: "circle-check" },
          { value: "late", label: `بعد الدوام (${q.data.open_after_hours})`, icon: "alarm-clock" }, { value: "closed", label: `مغلق (${q.data.closed})`, icon: "moon" },
        ]} /></div>}
        {late.length > 0 && <div className="pointer-events-auto self-start"><Alert tone="warn" icon="alarm-clock"><b>{late.map((b) => b.name).join("، ")}</b> {late.length === 1 ? "يعمل" : "تعمل"} بعد موعد الإغلاق.</Alert></div>}
        {unplaced.length > 0 && <span className="glass pointer-events-auto flex flex-wrap items-center gap-x-2 gap-y-1 self-start rounded-xl px-3 py-1.5 text-xs"><Icon name="map-pin-plus" size={14} className="text-warn" />بلا موقع على الخريطة (اضغط لتحديده بالدبوس):
          {unplaced.map((b) => <Link key={b.branch_id} href={`/staff/admin/branches/${b.branch_id}`} className="font-semibold text-primary-strong hover:underline">{b.name}</Link>)}</span>}
      </div>
      {q.isPending && <div className="absolute inset-0 z-[1000] grid place-items-center"><Spinner /></div>}
      {picked && <BranchCard b={picked} onClose={() => setSel(null)} />}
    </div>
  );
}

function BranchCard({ b, onClose }: { b: BranchOverview; onClose: () => void }) {
  const stats: [string, string, string][] = [["users", "مراجعو اليوم", fmtNum(b.patients_today)], ["banknote", "إيراد اليوم", fmtNum(b.revenue_today)], ["stethoscope", "أطباء حاضرون", fmtNum(b.doctors_present)]];
  return (
    <div className="enter glass absolute bottom-4 end-3 z-[1000] flex w-[calc(100%-24px)] max-w-[360px] flex-col gap-3 rounded-panel p-4 shadow-float sm:end-4" role="region" aria-label={`تفاصيل ${b.name}`}>
      <div className="flex items-start gap-2">
        <span className="flex min-w-0 flex-1 flex-col gap-1"><span className="truncate text-lg font-bold">{b.name}</span><span className="flex flex-wrap items-center gap-2"><BranchStatus b={b} />{b.hours_today && <span className="sub-sm">{fmtTimesInText(b.hours_today)}</span>}</span></span>
        <button onClick={onClose} aria-label="إغلاق" className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-bg"><Icon name="x" size={18} /></button>
      </div>
      <div className="grid grid-cols-3 gap-2">{stats.map(([i, l, v]) => <span key={l} className="flex flex-col gap-0.5 rounded-xl bg-bg/70 p-2.5"><Icon name={i} size={16} className="text-primary" /><b className="num text-[15px]">{v}</b><span className="text-xs text-ink-2">{l}</span></span>)}</div>
      <Link href={`/staff/admin/branches/${b.branch_id}`}><Button size="md" variant="soft" icon="arrow-left" className="w-full">تفاصيل الفرع</Button></Link>
    </div>
  );
}

// ------------------------------------------------------------------ مقارنة الفروع
/** مؤشر واحد لكل الفروع: عمود بلون واحد والرقم مكتوب نصاً، والترتيب من الأكبر. الجدول أسفلها يعرض كل القيم. */
function Compare({ title, rows, format }: { title: string; rows: { name: string; value: number | null }[]; format: (n: number) => string }) {
  const known = rows.filter((r) => r.value != null) as { name: string; value: number }[];
  const sorted = [...known].sort((a, b) => b.value - a.value);
  const max = Math.max(...known.map((r) => r.value), 0);
  return (
    <section className="glass flex flex-col gap-3 rounded-card p-4" aria-label={title}>
      <h2 className="text-sm font-bold">{title}</h2>
      {!sorted.length ? <span className="sub-sm">لا بيانات بعد.</span> : sorted.map((r) => (
        <div key={r.name} className="flex flex-col gap-1" title={`${r.name}: ${format(r.value)}`}>
          <span className="flex items-baseline gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{r.name}</span><b className="num">{format(r.value)}</b></span>
          <span className="block h-2.5 overflow-hidden rounded-[4px] bg-bg"><span className="block h-full rounded-[4px] bg-primary transition-[width] duration-slow" style={{ width: `${max && r.value ? Math.max(1, (r.value / max) * 100) : 0}%` }} /></span>
        </div>
      ))}
    </section>
  );
}

const pct = (n: number | null) => (n == null ? "—" : `${n}%`);

export function BranchCompareScreen() {
  const q = useOverview();
  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="danger">{errorMessage(q.error)}</Alert>;
  const items = q.data.items;
  const of = (f: (b: BranchOverview) => number | null) => items.map((b) => ({ name: b.name, value: f(b) }));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2"><Link href="/staff/admin/map" className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-strong"><Icon name="map" size={17} />الخريطة</Link><span className="sub-sm">المؤشرات منذ بداية الشهر، وتتحدث كل 30 ثانية.</span></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Compare title="إيراد الشهر (د.ع)" rows={of((b) => b.revenue_month)} format={fmtNum} />
        <Compare title="إيراد اليوم (د.ع)" rows={of((b) => b.revenue_today)} format={fmtNum} />
        <Compare title="مستحقات الأطباء هذا الشهر (د.ع)" rows={of((b) => b.entitlements_month)} format={fmtNum} />
        <Compare title="مراجعو الشهر" rows={of((b) => b.patients_month)} format={fmtNum} />
        <Compare title="نسبة الحضور" rows={of((b) => b.attendance_rate)} format={(n) => `${n}%`} />
        <Compare title="نسبة الإلغاء" rows={of((b) => b.cancellation_rate)} format={(n) => `${n}%`} />
      </div>
      <DataGrid<BranchOverview> aria-label="مقارنة الفروع" rows={items} rowKey={(b) => b.branch_id} minWidth={1000} pageSize={0} empty={{ icon: "building-2", title: "لا توجد فروع" }}
        columns={[
          { key: "name", header: "الفرع", sortable: true, cell: (b) => <Link href={`/staff/admin/branches/${b.branch_id}`} className="font-semibold">{b.name}</Link> },
          { key: "live_status", header: "الحالة", cell: (b) => <BranchStatus b={b} /> },
          { key: "revenue_today", header: "إيراد اليوم", numeric: true, sortable: true, cell: (b) => fmtNum(b.revenue_today) },
          { key: "revenue_month", header: "إيراد الشهر", numeric: true, sortable: true, cell: (b) => <span className="font-bold">{fmtNum(b.revenue_month)}</span> },
          { key: "entitlements_month", header: "المستحقات", numeric: true, sortable: true, cell: (b) => fmtNum(b.entitlements_month) },
          { key: "patients_month", header: "المراجعون", numeric: true, sortable: true, cell: (b) => fmtNum(b.patients_month) },
          { key: "attendance_rate", header: "الحضور", numeric: true, sortable: true, value: (b) => b.attendance_rate ?? -1, cell: (b) => pct(b.attendance_rate) },
          { key: "cancellation_rate", header: "الإلغاء", numeric: true, sortable: true, value: (b) => b.cancellation_rate ?? -1, cell: (b) => pct(b.cancellation_rate) },
          { key: "doctors_count", header: "الأطباء", numeric: true, sortable: true, cell: (b) => fmtNum(b.doctors_count) },
          { key: "clinics_count", header: "العيادات", numeric: true, sortable: true, cell: (b) => fmtNum(b.clinics_count) },
          { key: "staff_count", header: "الموظفون", numeric: true, sortable: true, cell: (b) => fmtNum(b.staff_count) },
        ]} />
    </div>
  );
}

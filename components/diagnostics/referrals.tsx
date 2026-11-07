"use client";
/** تبويبات الخدمة (5.1): التحويلات الواردة وسجل المكتملة. العقد 23. قائمة العمل نفسها للمفعّلين فقط. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { CameraScanner } from "@/components/reception/checkin-screen";
import { Badge, Button, Card, CellStack, DataGrid, ISelect, Segmented, controlCls, type BadgeTone } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { staffApi } from "@/lib/api/staff";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { useLive } from "@/lib/realtime/provider";

export type ServiceKey = "lab" | "radiology" | "ultrasound" | "pharmacy";
type Row = { referral_id: string; service_ar: string; status: string; status_ar: string; patient_name: string; file_number: string; title: string; doctor_name: string | null; prescription_code: string | null; payment_status: string; amount_due: number; activation_method_ar: string | null; activated_at: string | null; completed_at: string | null; expires_at: string; created_at: string; source?: "doctor" | "direct"; phone_number?: string | null };
type Page = { items: Row[]; total: number };
export type Summary = { referred: number; activated: number; completed_today: number };

export const referralApi = {
  list: (q: Record<string, string | number | undefined>) => staffApi.get<Page>("/referrals", q),
  summary: (service: ServiceKey) => staffApi.get<Summary>("/referrals/summary", { service }),
  activate: (id: string) => staffApi.post<Row>(`/referrals/${id}/activate`, undefined, { idempotencyKey: false }),
  scan: (service: ServiceKey, code: string) => staffApi.post<{ activated: number; items: Row[] }>("/referrals/scan", { service, code }, { idempotencyKey: false }),
};

/** عدادات التبويبات، وتتحدث مباشرة مع الحدث referral.updated. */
export function useReferralSummary(service: ServiceKey) {
  const { live } = useLive();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["referrals", "summary", service], queryFn: () => referralApi.summary(service), refetchInterval: 60_000 });
  useEffect(() => {
    if (!live) return;
    return live.on("referral.updated", () => { void qc.invalidateQueries({ queryKey: ["referrals"] }); void qc.invalidateQueries({ queryKey: ["worklist"] }); });
  }, [live, qc]);
  return q.data;
}

const PAY: Record<string, { label: string; tone: BadgeTone }> = { paid: { label: "مدفوع", tone: "success" }, unpaid: { label: "غير مدفوع", tone: "warn" }, deferred: { label: "مؤجل", tone: "info" }, refunded: { label: "مسترجع", tone: "muted" } };
const ST: Record<string, BadgeTone> = { referred: "info", activated: "primary", completed: "success", expired: "muted", external: "muted", cancelled: "muted" };

export function ReferralList({ service, status, canWrite, action, source }: { service: ServiceKey; status: "referred" | "activated" | "completed"; canWrite: boolean; action?: (r: Row) => React.ReactNode; source?: "doctor" | "direct" }) {
  const qc = useQueryClient();
  const [closed, setClosed] = useState("");
  const shown = status === "referred" && closed ? closed : status;
  const key = ["referrals", service, shown, source];
  const q = useQuery({ queryKey: key, queryFn: () => referralApi.list({ service, status: shown, page_size: 100, source }) });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [cam, setCam] = useState(false);
  const camOk = typeof window !== "undefined" && "BarcodeDetector" in window;
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["referrals"] }); void qc.invalidateQueries({ queryKey: ["worklist"] }); };
  async function scan(text = code) {
    if (!text.trim()) return;
    setBusy(true);
    try { const r = await referralApi.scan(service, text.trim()); toast.success(r.activated ? `فُعّل ${r.activated} وانتقل لقائمة العمل` : "مفعّل مسبقاً"); setCode(""); refresh(); }
    catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  }
  async function activate(r: Row) {
    try { await referralApi.activate(r.referral_id); toast.success(`${r.patient_name} في قائمة العمل`); refresh(); } catch (e) { toast.error(errorMessage(e)); }
  }
  return (
    <div className="flex flex-col gap-3">
      {status === "referred" && (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          {canWrite && service !== "lab" && service !== "pharmacy" && <form className="flex min-w-[240px] flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); void scan(); }}>
            <input value={code} onChange={(e) => setCode(e.target.value)} aria-label="رمز المراجع أو رقم الطلب" placeholder="امسح رمز المراجع أو رقم الوصفة أو رقم الملف" className={controlCls} dir="auto" />
            <Button size="md" icon="scan-line" loading={busy} disabled={!code.trim()} type="submit">تفعيل</Button>
            {camOk && <Button size="md" variant="ghost" icon="camera" type="button" aria-label="مسح بالكاميرا" onClick={() => setCam(true)} />}
          </form>}
          {cam && <CameraScanner title="مسح رمز المراجع" onClose={() => setCam(false)} onCode={(c) => { setCam(false); void scan(c); }} />}
          <ISelect aria-label="عرض" size="sm" className="min-w-[170px]" searchable={false} clearable placeholder="بانتظار المراجع" value={closed} onChange={(v) => setClosed(v ?? "")} options={[{ value: "expired", label: "منتهية الصلاحية" }, { value: "external", label: "خارجية" }]} />
        </Card>
      )}
      <DataGrid<Row> aria-label="التحويلات" rows={q.data?.items} loading={q.isPending} error={q.isError ? errorMessage(q.error) : undefined} rowKey={(r) => r.referral_id}
        search={{ placeholder: "ابحث بالاسم أو رقم الملف" }}
        empty={{ icon: "inbox", title: status === "referred" ? "لا توجد تحويلات منتظرة" : status === "activated" ? "لا يوجد مراجعون حاضرون" : "لا توجد حالات مكتملة" }}
        columns={[
          { key: "patient_name", header: "المراجع", sortable: true, value: (r) => `${r.patient_name} ${r.file_number}`, cell: (r) => <CellStack title={r.patient_name} sub={r.file_number} /> },
          { key: "title", header: "المطلوب", cell: (r) => <CellStack title={r.title} sub={r.prescription_code ?? r.doctor_name ?? undefined} /> },
          ...(service === "lab" ? [{ key: "source", header: "مصدر الطلب", cell: (r: Row) => <span className="flex flex-col gap-1"><Badge tone={r.source === "direct" ? "primary" : "info"}>{r.source === "direct" ? "مراجعة مباشرة" : "إحالة طبيب"}</Badge>{r.phone_number && <span className="num text-xs" dir="ltr">{r.phone_number}</span>}</span> }] : []),
          { key: "status", header: "الحالة", cell: (r) => <Badge tone={ST[r.status] ?? "muted"}>{r.status_ar}</Badge> },
          { key: "payment_status", header: "الدفع", cell: (r) => r.payment_status === "not_applicable" ? "—" : <span className="flex flex-col gap-0.5"><Badge tone={PAY[r.payment_status]?.tone ?? "muted"}>{PAY[r.payment_status]?.label ?? r.payment_status}</Badge>{r.amount_due > 0 && <span className="num text-xs">{fmtNum(r.amount_due)} د.ع</span>}</span> },
          { key: "created_at", header: status === "completed" ? "اكتمل" : "الوقت", sortable: true, value: (r) => r.completed_at ?? r.activated_at ?? r.created_at, cell: (r) => <span className="flex flex-col"><span className="num text-xs">{fmtDateTime(r.completed_at ?? r.activated_at ?? r.created_at)}</span>{r.activation_method_ar && <span className="sub-sm">{r.activation_method_ar}</span>}</span> },
          { key: "act", header: "", sticky: true, cell: (r) => <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>{action?.(r)}{canWrite && ["referred", "expired", "external"].includes(r.status) && <Button size="sm" icon="user-check" onClick={() => void activate(r)}>حضر</Button>}</span> },
        ]} />
    </div>
  );
}

export type ServiceTab = "work" | "incoming" | "done";

/** مبدّل تبويبات الخدمة بعدادات. */
export function ServiceTabs({ value, onChange, summary }: { value: ServiceTab; onChange: (t: ServiceTab) => void; summary?: Summary }) {
  return <Segmented value={value} onChange={onChange} options={[
    { value: "work", label: `قائمة العمل${summary ? ` (${summary.activated})` : ""}`, icon: "list-todo" },
    { value: "incoming", label: `تحويلات واردة${summary ? ` (${summary.referred})` : ""}`, icon: "inbox" },
    { value: "done", label: `المكتملة${summary ? ` (${summary.completed_today} اليوم)` : ""}`, icon: "circle-check" },
  ]} />;
}

/** زر صرف الوصفة من قائمة عمل الصيدلية. */
export function DispenseLink({ code }: { code: string | null }) {
  if (!code) return null;
  return <Link href={`/staff/pharmacy/scan?code=${encodeURIComponent(code)}`} className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-semibold text-on-accent hover:text-on-accent"><Icon name="pill" size={15} />صرف</Link>;
}

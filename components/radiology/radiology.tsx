"use client";
/** قسم الأشعة والسونار — سير عمله: الموعد والغرفة ← التنفيذ ← التقرير (الموجودات والانطباع والصور) ← الاعتماد. العقد 13. Diagnostics.dc.html (isRad). */
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Card, CellStack, DataGrid, DateField, DateTimeField, Empty, Segmented } from "@/components/ui";
import { radApi, type WorkItem } from "@/lib/api/clinical";
import { errorMessage } from "@/lib/api/errors";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { modalityAr } from "@/lib/labels";
import { TextInput } from "@/components/reception/common";
import { esc, printHtml } from "@/lib/agent/print-html";
import { Attachments, PatientBar, Worklist, RAD_ST } from "@/components/diagnostics/shared";
import { ReferralList, ServiceTabs, useReferralSummary, type ServiceTab } from "@/components/diagnostics/referrals";
import { useAuth } from "@/lib/auth/store";
import { hasPerm } from "@/lib/roles";

// ------------------------------------------------------------------ الأشعة
export function RadiologyScreen() {
  const [sel, setSel] = useState<WorkItem | null>(null);
  const order = useSearchParams().get("order");
  const [tab, setTab] = useState<ServiceTab>("work");
  const [service, setService] = useState<"radiology" | "ultrasound">("radiology");
  const summary = useReferralSummary(service);
  const canWrite = hasPerm(useAuth((s) => s.user), "radiology.write");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Segmented value={service} onChange={(v) => { setService(v); setSel(null); }} options={[{ value: "radiology", label: "الأشعة", icon: "scan-line" }, { value: "ultrasound", label: "السونار", icon: "activity" }]} />
        <ServiceTabs value={tab} onChange={setTab} summary={summary} />
      </div>
      {!canWrite && <Alert tone="info" icon="eye">عرض فقط: لا يمكنك تنفيذ أي عملية في هذا القسم.</Alert>}
      {tab === "incoming" ? <ReferralList service={service} status="referred" canWrite={canWrite} /> : tab === "done" ? <ReferralList service={service} status="completed" canWrite={false} /> : (
    <div className="grid items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Worklist kind="radiology" service={service} sel={sel?.order_item_id ?? null} onSel={setSel} autoSelect={order} />
      {sel?.awaiting_payment ? <Card className="p-6"><Alert tone="warn" icon="credit-card">{sel.patient_name} حاضر، والطلب غير مدفوع. وجّهه للاستقبال، ويبدأ العمل بعد الدفع أو الاستثناء.</Alert></Card> : sel ? <fieldset disabled={!canWrite} className="min-w-0"><RadOrder key={sel.order_item_id} w={sel} onChange={setSel} /></fieldset> : <Card className="p-8"><Empty image="radiology" title="اختر طلباً من القائمة" hint="الجدولة (اختيارية) ← التنفيذ ← التقرير ← الاعتماد." /></Card>}
    </div>
      )}
    </div>
  );
}

function RadOrder({ w, onChange }: { w: WorkItem; onChange: (w: WorkItem) => void }) {
  const [criticalFlag, setCriticalFlag] = useState(false);
  const qc = useQueryClient();
  const hasReport = ["performed", "reported", "released"].includes(w.status);
  const rep = useQuery({ queryKey: ["radrep", w.order_item_id], queryFn: () => radApi.report(w.order_item_id), enabled: hasReport, retry: false });
  // datetime-local يأخذ الوقت المحلي بلا منطقة. toISOString يعطي UTC فيظهر الموعد قبل ساعتين ونصف في بغداد
  const [when, setWhen] = useState(() => { const d = new Date(Date.now() + 30 * 60_000); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); });
  const [room, setRoom] = useState(w.room ?? "");
  const [findings, setFindings] = useState(""); const [impression, setImpression] = useState("");
  const [atts, setAtts] = useState<{ file_id: string; file_name: string; url?: string }[]>([]);
  const [amend, setAmend] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (rep.data) { setFindings(rep.data.findings ?? ""); setImpression(rep.data.impression ?? ""); setAtts(rep.data.attachments); } }, [rep.data]);
  const released = w.status === "released";
  const refresh = (status?: string) => { void qc.invalidateQueries({ queryKey: ["worklist", "radiology"] }); void qc.invalidateQueries({ queryKey: ["radrep", w.order_item_id] }); if (status) onChange({ ...w, status: status as WorkItem["status"] }); };
  const run = async (k: string, fn: () => Promise<unknown>, ok: string, status?: string) => { setBusy(k); try { await fn(); toast.success(ok); refresh(status); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); } };
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PatientBar w={w} />
      <Card className="flex flex-col gap-3 p-[18px]">
        <span className="flex items-center gap-2 font-bold"><Icon name="scan-line" size={18} className="text-info" />{w.service_name}{w.modality ? <span className="sub-sm">· {modalityAr(w.modality)}</span> : null}<span className="flex-1" /><span className={`rounded-full px-2.5 py-1 text-xs ${RAD_ST[w.status]?.cls}`}>{RAD_ST[w.status]?.label ?? w.status}</span></span>
        {(w.status === "paid" || w.status === "deferred" || w.status === "scheduled") && (
          <>
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px_auto] md:items-end">
              <DateTimeField label="الموعد" value={when} onChange={setWhen} />
              <TextInput label="الغرفة" value={room} onChange={setRoom} placeholder="سونار 2" />
              <Button size="md" variant="ghost" icon="calendar-clock" loading={busy === "sch"} onClick={() => run("sch", () => radApi.schedule(w.order_item_id, { scheduled_at: new Date(when).toISOString(), room: room || undefined }), "جُدول الموعد", "scheduled")}>جدولة</Button>
            </div>
            <Button size="md" className="self-start" icon="circle-check" loading={busy === "perf"} onClick={() => run("perf", () => radApi.performed(w.order_item_id), "سُجل التنفيذ", "performed")}>تم التنفيذ</Button>
          </>
        )}
        {w.performed_at && <span className="sub-sm">نُفذ <span className="num">{fmtDateTime(w.performed_at)}</span></span>}
      </Card>
      {hasReport && (
        <Card className="flex flex-col gap-3 p-[18px]">
          <span className="font-bold">التقرير</span>
          <TextInput label="الموجودات (Findings)" value={findings} onChange={setFindings} multiline required />
          <TextInput label="الانطباع (Impression)" value={impression} onChange={setImpression} multiline />
          <Attachments dept="radiology" orderId={w.order_item_id} list={atts} onAdd={(a) => setAtts((x) => [...x, a])} />
          {released && <TextInput label="سبب تعديل تقرير معتمد" value={amend} onChange={setAmend} icon="notebook-pen" required />}
          <div className="flex flex-wrap gap-2">
            {!released && <Button size="md" variant="ghost" icon="save" loading={busy === "d"} disabled={!findings.trim()} onClick={() => run("d", () => radApi.putReport(w.order_item_id, { critical_flag: criticalFlag || undefined, findings, impression, attachments: atts.map((a) => ({ file_id: a.file_id })), release: false }), "حُفظت المسودة", "reported")}>حفظ مسودة</Button>}
            <label className="flex items-center gap-2 text-sm font-semibold text-danger-strong"><input type="checkbox" checked={criticalFlag} onChange={(e) => setCriticalFlag(e.target.checked)} className="size-5" />نتيجة حرجة: أخطر الطبيب المعالج فوراً</label>
            <Button size="md" icon="badge-check" loading={busy === "r"} disabled={!findings.trim() || (released && !amend.trim())} onClick={() => run("r", () => radApi.putReport(w.order_item_id, { critical_flag: criticalFlag || undefined, findings, impression, attachments: atts.map((a) => ({ file_id: a.file_id })), release: true, amend_reason: released ? amend : undefined }), "اعتُمد التقرير", "released")}>{released ? "اعتماد التعديل" : "اعتماد التقرير"}</Button>
            {released && rep.data && <Button size="md" variant="ghost" icon="printer" onClick={() => void printRadReport(rep.data!)}>طباعة التقرير</Button>}
          </div>
        </Card>
      )}
    </div>
  );
}

/** تقرير الأشعة A4 على الطابعة العادية. */
function printRadReport(r: import("@/lib/api/clinical").RadReport) {
  return printHtml(`<h2 style="margin:0">مجمع الرحمة الطبي · الأشعة والسونار</h2><p>${esc(r.patient.full_name)} · ${esc(r.patient.file_number)}${r.ordered_by ? ` · الطبيب: ${esc(r.ordered_by)}` : ""}</p>
    <h3>${esc(r.service_name)}${r.modality ? ` · ${esc(modalityAr(r.modality))}` : ""}</h3>
    <h4>الموجودات (Findings)</h4><p style="white-space:pre-wrap">${esc(r.findings ?? "")}</p>
    ${r.impression ? `<h4>الانطباع (Impression)</h4><p style="white-space:pre-wrap">${esc(r.impression)}</p>` : ""}
    <p style="font-size:12px">${r.performed_at ? `نُفذت ${esc(fmtDateTime(r.performed_at))}` : ""}${r.reported_by ? ` · كتبه ${esc(r.reported_by)}` : ""}${r.amended ? " · معدّل" : ""}</p>`, `تقرير ${r.service_name}`, "a4");
}

/** مواعيد اليوم (الأشعة فقط): المجدول حسب الوقت والغرفة، من GET /radiology/worklist?status=scheduled&date=. */
export function RadiologySchedule() {
  const [date, setDate] = useState(() => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10));
  const q = useQuery({ queryKey: ["worklist", "radiology", "schedule", date], queryFn: () => radApi.worklist({ status: "scheduled", date, page_size: 100 }), refetchInterval: 60_000 });
  const items = q.data?.items ?? [];
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <DateField size="md" className="w-[210px]" label="اليوم" value={date} onChange={(v) => { if (v) setDate(v); }} />
        <span className="sub">المواعيد المجدولة التي لم تُنفذ بعد · <span className="num">{items.length}</span></span>
      </div>
      <DataGrid<WorkItem> aria-label="مواعيد اليوم" rows={q.data ? items : undefined} loading={q.isPending} error={q.isError ? errorMessage(q.error) : undefined} rowKey={(w) => w.order_item_id} minWidth={640} pageSize={0}
        search={{ placeholder: "ابحث باسم المريض أو الغرفة أو الخدمة" }} onRowClick={(w) => router.push(`/staff/radiology?order=${w.order_item_id}`)}
        empty={{ icon: "calendar-clock", title: "لا مواعيد مجدولة", hint: "جدولة موعد تتم من «قائمة العمل» لكل طلب." }}
        columns={[
          { key: "scheduled_at", header: "الوقت", width: "110px", sortable: true, value: (w) => w.scheduled_at ?? "", cell: (w) => <span className="num font-bold">{fmtTime(w.scheduled_at)}</span> },
          { key: "room", header: "الغرفة", width: "140px", sortable: true, value: (w) => w.room || "بدون غرفة", cell: (w) => <span className="flex items-center gap-1.5 text-[13px]"><Icon name="door-open" size={15} className="text-info" />{w.room || "بدون غرفة"}</span> },
          { key: "patient_name", header: "المريض", sortable: true, value: (w) => `${w.patient_name} ${w.service_name}`, cell: (w) => <CellStack title={w.patient_name} sub={`${w.service_name}${w.modality ? ` · ${modalityAr(w.modality)}` : ""}`} /> },
          { key: "go", header: <span className="sr-only">فتح</span>, width: "48px", cell: () => <Icon name="chevron-left" size={17} className="text-ink-muted" /> },
        ]} />
    </div>
  );
}

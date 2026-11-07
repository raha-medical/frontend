"use client";
/** مكونات مشتركة بين المختبر والأشعة (قسمان منفصلان، لكل منهما سير عمله): قائمة العمل، شريط المريض، المرفقات. Diagnostics.dc.html. */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Card, DataGrid, Empty, Segmented, Spinner } from "@/components/ui";
import { filesApi, labApi, radApi, type WorkItem } from "@/lib/api/clinical";
import { errorMessage } from "@/lib/api/errors";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { todayBaghdad } from "@/lib/date";
import { useLive } from "@/lib/realtime/provider";
import { TextInput, useDebounced } from "@/components/reception/common";

export type StatusMap = Record<string, { label: string; cls: string }>;
/** حالات المختبر: العينة ثم التحليل ثم النتيجة. */
export const LAB_ST: StatusMap = {
  paid: { label: "بانتظار العينة", cls: "bg-info-soft text-info-strong" }, deferred: { label: "آجل · بانتظار العينة", cls: "bg-info-soft text-info-strong" },
  sample_collected: { label: "سُحبت العينة", cls: "bg-lab-soft text-lab-strong" }, in_progress: { label: "قيد التحليل", cls: "bg-warn-soft text-warn-strong" },
  resulted: { label: "نتيجة مسودة", cls: "bg-warn-soft text-warn-strong" }, released: { label: "معتمدة", cls: "bg-success-soft text-success-strong" },
  cancelled: { label: "ملغاة", cls: "bg-bg text-ink-3" },
};
/** حالات الأشعة: الموعد ثم التنفيذ ثم التقرير. */
export const RAD_ST: StatusMap = {
  paid: { label: "بانتظار الموعد", cls: "bg-info-soft text-info-strong" }, deferred: { label: "آجل · بانتظار الموعد", cls: "bg-info-soft text-info-strong" },
  scheduled: { label: "مجدولة", cls: "bg-info-soft text-info-strong" }, performed: { label: "مُنفذة · بانتظار التقرير", cls: "bg-lab-soft text-lab-strong" },
  reported: { label: "تقرير مسودة", cls: "bg-warn-soft text-warn-strong" }, released: { label: "التقرير معتمد", cls: "bg-success-soft text-success-strong" },
  cancelled: { label: "ملغاة", cls: "bg-bg text-ink-3" },
};

export function Worklist({ kind, sel, onSel, autoSelect, service, source }: { kind: "lab" | "radiology"; sel: string | null; onSel: (w: WorkItem) => void; autoSelect?: string | null; service?: "radiology" | "ultrasound"; source?: "doctor" | "direct" }) {
  const ST = kind === "lab" ? LAB_ST : RAD_ST;
  const [tab, setTab] = useState<"open" | "released">("open");
  const [text, setText] = useState("");
  const q = useDebounced(text);
  const { live } = useLive();
  const qc = useQueryClient();
  const key = ["worklist", kind, tab, q, source];
  const list = useQuery({ queryKey: key, queryFn: () => (kind === "lab" ? labApi : radApi).worklist({ status: tab === "released" ? "released" : undefined, date: tab === "released" ? todayBaghdad() : undefined, q: q || undefined, page_size: 100, source }), refetchInterval: 60_000 });
  useEffect(() => { if (autoSelect && !sel) { const w = list.data?.items.find((x) => x.order_item_id === autoSelect); if (w) onSel(w); } }, [autoSelect, sel, list.data, onSel]);
  useEffect(() => { if (!live) return; const off = live.on("order.created", () => void qc.invalidateQueries({ queryKey: ["worklist", kind] })); return off; }, [live, qc, kind]);
  return (
    <div className="flex flex-col gap-3">
      <Segmented value={tab} onChange={setTab} options={[{ value: "open", label: "قيد العمل", icon: "list-todo" }, { value: "released", label: "المعتمد اليوم", icon: "circle-check" }]} />
      <div className="flex h-11 items-center gap-2 rounded-field border-[1.5px] border-line-strong bg-surface px-3 focus-within:border-primary"><Icon name="search" size={16} className="text-ink-muted" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "lab" ? "اسم المريض، رقم الملف، أو باركود العينة" : "اسم المريض أو رقم الملف"} className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></div>
      <DataGrid<WorkItem> aria-label={kind === "lab" ? "قائمة عمل المختبر" : "قائمة عمل الأشعة"} rows={service ? list.data?.items.filter((w) => (w.modality === "ultrasound") === (service === "ultrasound")) : list.data?.items} loading={list.isPending} error={list.isError ? errorMessage(list.error) : undefined}
        rowKey={(w) => w.order_item_id} minWidth={320} dense pageSize={0} maxHeight="min(68vh, 720px)" onRowClick={onSel} selectedKey={sel}
        empty={{ icon: "inbox", title: "لا يوجد مراجعون حاضرون", hint: "المراجع يظهر هنا بعد حضوره. المنتظرون في «تحويلات واردة»." }}
        columns={[
          { key: "patient_name", header: "الطلب", sortable: true, value: (w) => w.patient_name, cell: (w) => (
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-sm font-bold">{w.patient_name}</span>
              {kind === "lab" && <span className="text-xs font-semibold text-primary">{w.source === "direct" ? "مراجعة مباشرة" : "إحالة طبيب"}{w.phone_number && <> · <span dir="ltr">{w.phone_number}</span></>}</span>}
              <span className="truncate text-xs text-ink-2">{w.service_name} · {w.ordered_by ?? w.referring_doctor_name ?? "مراجع مباشر"}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-[11px]"><span className={`rounded-full px-2 py-0.5 ${(w.awaiting_payment ? { cls: "bg-warn-soft text-warn-strong" } : ST[w.status] ?? { cls: "bg-bg" }).cls}`}>{w.awaiting_payment ? "حاضر · بانتظار الدفع" : ST[w.status]?.label ?? w.status}</span>{w.has_critical && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger-strong">حرج</span>}{w.sample_barcode && <span className="num text-ink-muted" dir="ltr">{w.sample_barcode}</span>}</span>
            </span>
          ) },
          { key: "ordered_at", header: "الوقت", width: "84px", sortable: true, cell: (w) => <span className="num whitespace-nowrap text-[11px] text-ink-muted">{fmtTime(w.ordered_at)}</span> },
        ]} />
    </div>
  );
}

export function PatientBar({ w }: { w: WorkItem }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-4">
      <span className="grid size-11 place-items-center rounded-full bg-primary-soft text-primary-strong"><Icon name="user-round" size={20} /></span>
      <span className="flex flex-1 flex-col"><span className="font-bold">{w.patient_name}</span><span className="sub"><span className="num">{w.file_number}</span>{w.gender ? ` · ${w.gender === "female" ? "أنثى" : "ذكر"}` : ""}{w.age != null ? <> · <span className="num">{w.age}</span> سنة</> : null}</span></span>
      <span className="text-[13px] text-ink-2">{w.ordered_by ?? (w.referring_doctor_name ? `محيل: ${w.referring_doctor_name}` : "")}</span>
      {w.note && <span className="w-full rounded-xl bg-warn-soft/60 px-2.5 py-1.5 text-xs"><Icon name="sticky-note" size={12} className="inline" /> {w.note}</span>}
    </div>
  );
}

/** مرفقات النتيجة أو التقرير. `dept` هو غرض الرفع في العقد (lab | radiology)، والخادم يرفض غيره بـ INVALID_FILE_PURPOSE. */
export function Attachments({ dept, orderId, list, onAdd }: { dept: "lab" | "radiology"; orderId: string; list: { file_id: string; file_name: string; url?: string }[]; onAdd: (f: { file_id: string; file_name: string }) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">المرفقات</span>
      <div className="flex flex-wrap gap-1.5">
        {list.map((a) => a.url ? <a key={a.file_id} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full bg-bg px-3 py-1.5 text-xs"><Icon name="paperclip" size={12} />{a.file_name}</a> : <span key={a.file_id} className="flex items-center gap-1 rounded-full bg-bg px-3 py-1.5 text-xs"><Icon name="paperclip" size={12} />{a.file_name}</span>)}
        <label className="flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-line-strong px-3 py-1.5 text-xs font-semibold text-primary">
          <Icon name={busy ? "loader-circle" : "upload"} size={12} className={busy ? "animate-spin" : ""} />إرفاق ملف
          <input type="file" className="hidden" accept={dept === "radiology" ? "image/jpeg,image/png,application/pdf,application/dicom,.dcm" : "image/jpeg,image/png,application/pdf"} onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return; setBusy(true);
            try { onAdd({ file_id: await filesApi.upload(f, dept, { order_item_id: orderId }), file_name: f.name }); } catch (er) { toast.error(errorMessage(er)); } finally { setBusy(false); e.target.value = ""; }
          }} />
        </label>
      </div>
    </div>
  );
}


"use client";
/** قسم المختبر — سير عمله: سحب العينة (وملصقها) ← التحليل ← النتائج والقيم الحرجة ← الاعتماد. العقد 12. Diagnostics.dc.html (isLab). */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Card, Empty, Segmented, Spinner } from "@/components/ui";
import { labApi, type WorkItem } from "@/lib/api/clinical";
import { errorMessage } from "@/lib/api/errors";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { TextInput } from "@/components/reception/common";
import { hardwareAgent } from "@/lib/agent";
import { esc, printHtml } from "@/lib/agent/print-html";
import { Attachments, PatientBar, Worklist, LAB_ST } from "@/components/diagnostics/shared";
import { ReferralList, ServiceTabs, useReferralSummary, type ServiceTab } from "@/components/diagnostics/referrals";
import { useAuth } from "@/lib/auth/store";
import { hasPerm } from "@/lib/roles";

// ------------------------------------------------------------------ المختبر
export function LabScreen() {
  const query = useSearchParams();
  const [sel, setSel] = useState<WorkItem | null>(null);
  const [tab, setTab] = useState<ServiceTab>(query.get("tab") === "incoming" ? "incoming" : "work");
  const [source, setSource] = useState<"all" | "doctor" | "direct">(query.get("source") === "direct" ? "direct" : "all");
  const summary = useReferralSummary("lab");
  const canWrite = hasPerm(useAuth((s) => s.user), "lab.write");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={source} onChange={(v) => { setSource(v); setSel(null); }} options={[{ value: "all", label: "كل المراجعين", icon: "users" }, { value: "doctor", label: "إحالات الأطباء", icon: "stethoscope" }, { value: "direct", label: "مراجعة مباشرة", icon: "user-round" }]} />
        <div className="flex flex-wrap gap-2">
          {canWrite && <Link href="/staff/lab/direct" className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-on-accent"><Icon name="user-plus" size={17} />تسجيل مراجع مباشر</Link>}
          <Link href="/staff/lab/settings" className="inline-flex h-11 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold"><Icon name="settings-2" size={17} />التحاليل والأسعار</Link>
        </div>
      </div>
      <ServiceTabs value={tab} onChange={setTab} summary={source === "all" ? summary : undefined} />
      {!canWrite && <Alert tone="info" icon="eye">عرض فقط: لا يمكنك تنفيذ أي عملية في هذا القسم.</Alert>}
      {tab === "incoming" ? <ReferralList service="lab" status="referred" canWrite={canWrite} source={source === "all" ? undefined : source} /> : tab === "done" ? <ReferralList service="lab" status="completed" canWrite={false} source={source === "all" ? undefined : source} /> : (
    <div className="grid items-start gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Worklist kind="lab" sel={sel?.order_item_id ?? null} onSel={setSel} source={source === "all" ? undefined : source} />
      {sel?.awaiting_payment ? <Card className="p-6"><Alert tone="warn" icon="credit-card">{sel.patient_name} حاضر، والطلب غير مدفوع. وجّهه للاستقبال، ويبدأ العمل بعد الدفع أو الاستثناء.</Alert></Card> : sel ? <fieldset disabled={!canWrite} className="min-w-0"><LabOrder key={sel.order_item_id} w={sel} onChange={setSel} /></fieldset> : <Card className="p-8"><Empty image="lab" title="اختر طلباً من القائمة" hint="سحب العينة ← بدء التحليل ← إدخال النتائج ← الاعتماد." /></Card>}
    </div>
      )}
    </div>
  );
}

function LabOrder({ w, onChange }: { w: WorkItem; onChange: (w: WorkItem) => void }) {
  const qc = useQueryClient();
  const tpl = useQuery({ queryKey: ["labtpl", w.service_id], queryFn: () => labApi.template(w.service_id) });
  const needsResult = ["sample_collected", "in_progress", "resulted", "released"].includes(w.status);
  const res = useQuery({ queryKey: ["labres", w.order_item_id], queryFn: () => labApi.result(w.order_item_id), enabled: needsResult, retry: false });
  const [vals, setVals] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [comment, setComment] = useState("");
  const [atts, setAtts] = useState<{ file_id: string; file_name: string; url?: string }[]>([]);
  const [amend, setAmend] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [criticalFlag, setCriticalFlag] = useState(false);
  useEffect(() => { if (res.data) { setVals(Object.fromEntries(res.data.values.map((v) => [v.code, String(v.value)]))); setText(res.data.text_result ?? ""); setComment(res.data.comment ?? ""); setAtts(res.data.attachments); } }, [res.data]);
  const released = w.status === "released";
  const refresh = (status?: string) => { void qc.invalidateQueries({ queryKey: ["worklist", "lab"] }); void qc.invalidateQueries({ queryKey: ["labres", w.order_item_id] }); if (status) onChange({ ...w, status: status as WorkItem["status"] }); };
  const params = tpl.data?.parameters ?? [];
  const flag = (code: string) => {
    const p = params.find((x) => x.code === code); const v = Number(vals[code]); if (!p || vals[code] === undefined || vals[code] === "" || Number.isNaN(v)) return null;
    if (p.critical_low != null && v <= p.critical_low) return { t: "حرج منخفض", c: "bg-danger text-on-accent" };
    if (p.critical_high != null && v >= p.critical_high) return { t: "حرج مرتفع", c: "bg-danger text-on-accent" };
    if (p.ref_low != null && v < p.ref_low) return { t: "منخفض", c: "bg-info-soft text-info-strong" };
    if (p.ref_high != null && v > p.ref_high) return { t: "مرتفع", c: "bg-warn-soft text-warn-strong" };
    return { t: "طبيعي", c: "bg-success-soft text-success-strong" };
  };
  async function save(release: boolean) {
    setBusy(release ? "release" : "draft");
    try {
      const values = params.filter((p) => vals[p.code] !== undefined && vals[p.code] !== "").map((p) => ({ code: p.code, value: Number(vals[p.code]) }));
      const r = await labApi.putResult(w.order_item_id, { values: params.length ? values : undefined, text_result: params.length ? null : text, comment: comment || null, critical_flag: criticalFlag || undefined, attachments: atts.map((a) => ({ file_id: a.file_id })), release, amend_reason: released ? amend : undefined });
      toast.success(release ? (r.has_critical ? "اعتُمدت · أُشعر الطبيب بالقيمة الحرجة" : "اعتُمدت النتيجة") : "حُفظت المسودة");
      refresh(r.status);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); }
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PatientBar w={w} />
      <Card className="flex flex-col gap-3 p-[18px]">
        <span className="flex items-center gap-2 font-bold"><Icon name="flask-conical" size={18} className="text-lab" />{w.service_name}<span className="flex-1" /><span className={`rounded-full px-2.5 py-1 text-xs ${LAB_ST[w.status]?.cls}`}>{LAB_ST[w.status]?.label ?? w.status}</span></span>
        {(w.status === "paid" || w.status === "deferred") && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1"><TextInput label="باركود العينة (اختياري، يولده السيرفر)" value={barcode} onChange={setBarcode} icon="barcode" ltr /></div>
            <Button size="md" icon="test-tube" loading={busy === "collect"} onClick={async () => { setBusy("collect"); try { const r = await labApi.collect(w.order_item_id, barcode.trim() || undefined); toast.success(`سُحبت العينة · ${r.sample_barcode}`); void printLabel({ ...w, sample_barcode: r.sample_barcode }); onChange({ ...w, status: "sample_collected", sample_barcode: r.sample_barcode }); refresh(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); } }}>سحب العينة</Button>
          </div>
        )}
        {w.status === "sample_collected" && <Button size="md" variant="ghost" className="self-start" icon="play" loading={busy === "start"} onClick={async () => { setBusy("start"); try { await labApi.start(w.order_item_id); refresh("in_progress"); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(null); } }}>بدء التحليل</Button>}
        {w.sample_barcode && <span className="sub-sm flex flex-wrap items-center gap-2">العينة <span className="num" dir="ltr">{w.sample_barcode}</span>{res.data?.sample_collected_at ? <> · <span className="num">{fmtDateTime(res.data.sample_collected_at)}</span></> : null}
          <button onClick={() => void printLabel(w)} className="flex items-center gap-1 rounded-full border border-line-strong px-2.5 py-1 text-xs font-semibold text-primary"><Icon name="printer" size={13} />طباعة الملصق</button></span>}
      </Card>
      {needsResult && (
        <Card className="flex flex-col gap-3 p-[18px]">
          <span className="font-bold">النتائج</span>
          {tpl.isPending ? <Spinner /> : params.length ? (
            <div className="overflow-x-auto">
              <div className="grid min-w-[560px] grid-cols-[minmax(0,1.3fr)_120px_70px_120px_100px] items-center gap-2 text-sm">
                <span className="sub-sm">البارامتر</span><span className="sub-sm">القيمة</span><span className="sub-sm">الوحدة</span><span className="sub-sm">المرجع</span><span />
                {params.map((p) => { const fl = flag(p.code); return (
                  <div key={p.code} className="contents">
                    <span className="flex flex-col"><span className="font-semibold" dir="ltr">{p.name}</span><span className="num text-[11px] text-ink-muted" dir="ltr">{p.code}</span></span>
                    <input inputMode="decimal" dir="ltr" value={vals[p.code] ?? ""} disabled={released && !amend} onChange={(e) => setVals((v) => ({ ...v, [p.code]: e.target.value.replace(/[^\d.-]/g, "") }))} className="num h-10 rounded-xl border-[1.5px] border-line-strong bg-surface px-2 text-base font-semibold outline-none focus:border-primary disabled:opacity-60" aria-label={p.name} />
                    <span className="num text-xs text-ink-2" dir="ltr">{p.unit}</span>
                    <span className="num text-xs text-ink-2" dir="ltr">{p.ref_low ?? "—"} – {p.ref_high ?? "—"}</span>
                    <span>{fl && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${fl.c}`}>{fl.t}</span>}</span>
                  </div>
                ); })}
              </div>
            </div>
          ) : <TextInput label="النتيجة (وصفي)" value={text} onChange={setText} multiline />}
          <TextInput label="ملاحظة" value={comment} onChange={setComment} />
          <Attachments dept="lab" orderId={w.order_item_id} list={atts} onAdd={(a) => setAtts((x) => [...x, a])} />
          {released && <>
            <Alert tone="info" icon="lock">النتيجة معتمدة{res.data?.released_by ? ` من ${res.data.released_by}` : ""}. التعديل يحتاج سبباً ويُسجل في التدقيق ويُشعر الطبيب.</Alert>
            <TextInput label="سبب تعديل نتيجة معتمدة" value={amend} onChange={setAmend} icon="notebook-pen" required />
          </>}
          <div className="flex flex-wrap gap-2">
            {!released && <Button size="md" variant="ghost" icon="save" loading={busy === "draft"} onClick={() => save(false)}>حفظ مسودة</Button>}
            <label className="flex items-center gap-2 text-sm font-semibold text-danger-strong"><input type="checkbox" checked={criticalFlag} onChange={(e) => setCriticalFlag(e.target.checked)} className="size-5" />نتيجة حرجة: أخطر الطبيب المعالج فوراً</label>
            <Button size="md" icon="badge-check" loading={busy === "release"} disabled={released && !amend.trim()} onClick={() => save(true)}>{released ? "اعتماد التعديل" : "اعتماد النتيجة"}</Button>
            {released && res.data && <Button size="md" variant="ghost" icon="printer" onClick={() => void printLabResult(res.data!)}>طباعة النتيجة</Button>}
          </div>
        </Card>
      )}
    </div>
  );
}


/** ملصق العينة عبر الوكيل (POST /print/label). فشل الطباعة لا يلغي سحب العينة. */
async function printLabel(w: WorkItem) {
  if (!w.sample_barcode) return;
  try {
    await hardwareAgent.printLabel({ sample_barcode: w.sample_barcode, patient_name: w.patient_name, file_number: w.file_number, test_name: w.service_name, collected_at: fmtTime(new Date().toISOString()) });
  } catch (e) { toast.error(`سُحبت العينة لكن تعذرت طباعة الملصق: ${errorMessage(e)}`); }
}

/** ورقة نتيجة المختبر A4 على الطابعة العادية (ليست مهمة الوكيل الحراري). */
function printLabResult(r: import("@/lib/api/clinical").LabResult) {
  const rows = r.values.map((v) => `<tr><td dir="ltr">${esc(v.name)}</td><td dir="ltr"><b>${esc(v.value)}</b> ${esc(v.unit ?? "")}</td><td dir="ltr">${esc(v.ref_low ?? "")} – ${esc(v.ref_high ?? "")}</td><td>${esc(({ normal: "", low: "منخفض", high: "مرتفع", critical_low: "حرج منخفض", critical_high: "حرج مرتفع" } as Record<string, string>)[v.flag] ?? v.flag)}</td></tr>`).join("");
  return printHtml(`<h2 style="margin:0">مجمع الرحمة الطبي · المختبر</h2><p>${esc(r.patient.full_name)} · ${esc(r.patient.file_number)}${r.ordered_by ? ` · الطبيب: ${esc(r.ordered_by)}` : ""}</p>
    <h3>${esc(r.service_name)}</h3>${rows ? `<table><tr><th>الفحص</th><th>النتيجة</th><th>المرجع</th><th></th></tr>${rows}</table>` : `<p>${esc(r.text_result ?? "")}</p>`}
    ${r.comment ? `<p>ملاحظة: ${esc(r.comment)}</p>` : ""}<p style="font-size:12px">العينة ${esc(r.sample_barcode ?? "")} · اعتُمدت ${esc(r.released_at ? fmtDateTime(r.released_at) : "")}${r.released_by ? ` · ${esc(r.released_by)}` : ""}${r.amended ? " · معدّلة" : ""}</p>`, `نتيجة ${r.service_name}`, "a4");
}

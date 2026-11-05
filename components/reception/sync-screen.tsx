"use client";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Button, Card, Empty } from "@/components/ui";
import { DEVICE_CODE } from "@/lib/config";
import { fmtDateTime } from "@/lib/format";
import { db, type OutboxOp } from "@/lib/offline/db";
import { flushOutbox } from "@/lib/offline/outbox";
import { refreshSnapshot } from "@/lib/offline/snapshot";
import { useSync } from "@/lib/offline/sync-provider";

const TYPE_AR: Record<string, string> = {
  "patient.create": "تسجيل مريض", "patient.update": "تعديل مريض", "queue.check_in": "تثبيت حضور", "queue.call": "استدعاء", "queue.start": "بدء معاينة",
  "queue.complete": "إنهاء", "queue.no_show": "تخطي / غياب", "queue.emergency": "طوارئ", "queue.late_arrival": "وصل متأخراً", "payment.create": "تحصيل نقدي",
  "shift.open": "فتح وردية", "shift.close": "إغلاق وردية", agent_event: "حدث الطابعة/الدرج",
};

/** المزامنة (العقد 17): الصادر أوفلاين، والعمليات المرفوضة أو المتعارضة التي تحتاج مراجعة الموظف. */
export function SyncScreen() {
  const { online, pending, needsReview } = useSync();
  const ops = useLiveQuery(() => db().outbox.orderBy("occurred_at").toArray(), [], [] as OutboxOp[]) ?? [];
  const snapAt = useLiveQuery(async () => (await db().kv.get("snapshot.at"))?.value as number | undefined, []);
  const [busy, setBusy] = useState<"flush" | "snap" | null>(null);
  const review = ops.filter((o) => o.status === "needs_review");
  const queue = ops.filter((o) => o.status !== "needs_review");

  async function flush() {
    setBusy("flush");
    const r = await flushOutbox();
    setBusy(null);
    if (r.skipped === "offline") toast.warn("لا يوجد اتصال بالخادم");
    else if (r.skipped === "no_device") toast.error("رمز الجهاز غير مضبوط (NEXT_PUBLIC_DEVICE_CODE)");
    else if (r.skipped === "error") toast.error("تعذرت المزامنة. ستُعاد المحاولة تلقائياً.");
    else toast.success(r.sent ? `أُرسلت ${r.sent} عملية · ${r.needsReview} تحتاج مراجعة` : "لا توجد عمليات بانتظار الإرسال");
  }
  async function snap() {
    setBusy("snap");
    try { await refreshSnapshot(); toast.success("حُدّثت بيانات اليوم المحلية"); } catch { toast.error("تعذر تحديث بيانات اليوم"); }
    setBusy(null);
  }

  return (
    <>
      {!DEVICE_CODE && <Alert tone="warn">هذا الجهاز بلا رمز جهاز (<span className="num">NEXT_PUBLIC_DEVICE_CODE</span>). العمليات الأوفلاين تبقى محفوظة ولا تُرسل حتى يُضبط الرمز. يُسجَّل الجهاز من الإدارة (الأجهزة) أو بسكربت البيانات التجريبية.</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={online ? "wifi" : "wifi-off"} tone={online ? "success" : "warn"} label="الاتصال" value={online ? "متصل" : "أوفلاين"} />
        <Stat icon="refresh-cw" tone={pending ? "warn" : "success"} label="بانتظار الإرسال" value={String(pending)} />
        <Stat icon="triangle-alert" tone={needsReview ? "danger" : "success"} label="تحتاج مراجعة" value={String(needsReview)} />
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <Button size="md" icon="refresh-cw" loading={busy === "flush"} onClick={flush}>مزامنة الآن</Button>
        <Button size="md" variant="ghost" icon="inbox" loading={busy === "snap"} onClick={snap}>تحديث بيانات اليوم المحلية</Button>
        <span className="sub ms-auto">آخر تحديث لبيانات اليوم: <span className="num">{snapAt ? fmtDateTime(new Date(snapAt).toISOString()) : "—"}</span></span>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3.5"><Icon name="triangle-alert" size={18} className="text-danger" /><span className="text-[17px] font-bold">عمليات تحتاج مراجعة</span></div>
        {!review.length ? <Empty icon="circle-check" title="لا توجد عمليات مرفوضة" /> : review.map((o) => <OpRow key={o.op_id} o={o} />)}
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3.5"><Icon name="cloud-off" size={18} className="text-warn" /><span className="text-[17px] font-bold">الصادر (بانتظار الإرسال)</span></div>
        {!queue.length ? <Empty icon="inbox" title="الصادر فارغ" hint="كل العمليات وصلت للخادم." /> : queue.map((o) => <OpRow key={o.op_id} o={o} />)}
      </Card>
    </>
  );
}

function Stat({ icon, tone, label, value }: { icon: string; tone: "success" | "warn" | "danger"; label: string; value: string }) {
  const c = { success: "bg-success-soft text-success-strong", warn: "bg-warn-soft text-warn-strong", danger: "bg-danger-soft text-danger-strong" }[tone];
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={`grid size-11 place-items-center rounded-2xl ${c}`}><Icon name={icon} size={20} /></span>
      <span className="flex flex-col"><span className="sub">{label}</span><span className="num text-xl font-bold">{value}</span></span>
    </Card>
  );
}

function OpRow({ o }: { o: OutboxOp }) {
  const review = o.status === "needs_review";
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
      <span className={`grid size-9 place-items-center rounded-xl ${review ? "bg-danger-soft text-danger-strong" : "bg-warn-soft text-warn-strong"}`}><Icon name={review ? "circle-alert" : "refresh-cw"} size={17} /></span>
      <div className="flex min-w-[220px] flex-1 flex-col">
        <span className="font-semibold">{o.label ?? TYPE_AR[o.type] ?? o.type}</span>
        <span className="sub-sm">{TYPE_AR[o.type] ?? o.type} · <span className="num">{fmtDateTime(o.occurred_at)}</span>{o.attempts ? <> · محاولات <span className="num">{o.attempts}</span></> : null}</span>
        {o.error && <span className="text-xs text-danger-strong">{o.error.status === "conflict" ? "تعارض" : "مرفوضة"}{o.error.code ? <> · <span className="num">{o.error.code}</span></> : null}{o.error.detail || o.error.title ? ` · ${o.error.detail ?? o.error.title}` : ""}</span>}
      </div>
      {review && (
        <>
          <Button size="md" variant="ghost" icon="rotate-ccw" onClick={async () => { await db().outbox.update(o.op_id, { status: "pending", error: null }); void flushOutbox(); }}>إعادة الإرسال</Button>
          <Button size="md" variant="ghost" icon="trash-2" className="!text-danger-strong" onClick={async () => {
            if (o.type === "payment.create" && !confirm("هذه عملية تحصيل نقدي. إزالتها تعني أن المبلغ لن يُسجل في النظام. راجع المحاسب قبل الإزالة. متابعة؟")) return;
            await db().outbox.delete(o.op_id); toast.info("أُزيلت العملية من القائمة");
          }}>إزالة</Button>
        </>
      )}
    </div>
  );
}

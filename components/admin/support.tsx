"use client";
/** الدعم (الجلسة 4): طلبات الدعم والشكاوى من تطبيق المراجع والرد عليها، وإدارة الأسئلة الشائعة. الصلاحية support.manage. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Badge, Button, Card, Empty, Field, Modal, Segmented, Spinner, controlCls } from "@/components/ui";
import { FAQ_CATEGORIES, supportApi, type FaqItem, type SupportRequest } from "@/lib/api/session4";
import { errorMessage } from "@/lib/api/errors";
import { fmtDateTime } from "@/lib/format";

export function SupportRequestsScreen() {
  const [status, setStatus] = useState<"open" | "replied" | "all">("open");
  const q = useQuery({ queryKey: ["support", status], queryFn: () => supportApi.requests({ status: status === "all" ? undefined : status, page_size: 100 }), refetchInterval: 60_000 });
  const [reply, setReply] = useState<SupportRequest | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <Segmented value={status} onChange={setStatus} options={[{ value: "open", label: "بانتظار الرد" }, { value: "replied", label: "تم الرد" }, { value: "all", label: "الكل" }]} />
      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert> : !q.data.items.length ? <Card className="p-6"><Empty icon="inbox" title="لا توجد طلبات" /></Card> : (
        <div className="flex flex-col gap-2.5">
          {q.data.items.map((r) => (
            <Card key={r.support_request_id} solid className="flex flex-col gap-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={r.status === "open" ? "warn" : "success"} icon={r.status === "open" ? "clock" : "circle-check"}>{r.status_ar}</Badge>
                <Badge tone="info">{r.type_ar}</Badge>
                <span className="flex-1 font-bold">{r.patient_name ?? "مراجع"}</span>
                {r.phone_number && <a href={`tel:${r.phone_number}`} className="num text-sm text-primary" dir="ltr">{r.phone_number}</a>}
                <span className="num sub-sm">{fmtDateTime(r.created_at)}</span>
              </div>
              {r.booking_label && <span className="sub flex items-center gap-1.5"><Icon name="calendar-days" size={14} />{r.booking_label}</span>}
              <p className="text-[15px]">{r.description}</p>
              {r.reply ? <div className="rounded-xl bg-primary-soft p-3 text-sm"><span className="sub-sm">{r.replied_by_name} · <span className="num">{fmtDateTime(r.replied_at)}</span></span><p>{r.reply}</p></div>
                : <Button size="sm" icon="message-square" className="self-start" onClick={() => setReply(r)}>رد</Button>}
            </Card>
          ))}
        </div>
      )}
      {reply && <ReplyDialog r={reply} onClose={() => setReply(null)} />}
    </div>
  );
}

function ReplyDialog({ r, onClose }: { r: SupportRequest; onClose: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="الرد على الطلب" icon="message-square" footer={
      <Button loading={busy} disabled={!text.trim()} icon="send" onClick={async () => {
        setBusy(true);
        try { await supportApi.reply(r.support_request_id, text.trim()); toast.success("أُرسل الرد وأُشعر المراجع"); void qc.invalidateQueries({ queryKey: ["support"] }); onClose(); }
        catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>إرسال الرد</Button>}>
      <p className="sub mb-2">{r.description}</p>
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2000} className={`${controlCls} h-auto min-h-[120px] w-full p-3`} aria-label="الرد" />
    </Modal>
  );
}

export function FaqScreen() {
  const q = useQuery({ queryKey: ["faq-admin"], queryFn: () => supportApi.faq() });
  const [edit, setEdit] = useState<Partial<FaqItem> | null>(null);
  const qc = useQueryClient();
  return (
    <div className="flex flex-col gap-3">
      <Button icon="plus" className="self-start" size="md" onClick={() => setEdit({ category: "booking", sort: 100, is_active: true })}>سؤال جديد</Button>
      {q.isPending ? <Spinner /> : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert> : (
        <div className="flex flex-col gap-2">
          {q.data.items.map((f) => (
            <Card key={f.faq_id} solid className={`flex items-start gap-3 p-4 ${f.is_active ? "" : "opacity-60"}`}>
              <span className="flex flex-1 flex-col gap-1"><span className="font-bold">{f.question_ar}</span><span className="sub-sm">{f.category_ar} · ترتيب <span className="num">{f.sort}</span>{f.is_active ? "" : " · موقوف"}</span><span className="text-sm">{f.answer_ar}</span></span>
              <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEdit(f)}>تعديل</Button>
              <Button size="sm" variant="ghost" icon="trash-2" onClick={async () => { if (!confirm("حذف السؤال؟")) return; try { await supportApi.deleteFaq(f.faq_id); void qc.invalidateQueries({ queryKey: ["faq-admin"] }); } catch (e) { toast.error(errorMessage(e)); } }}>حذف</Button>
            </Card>
          ))}
        </div>
      )}
      {edit && <FaqDialog f={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function FaqDialog({ f, onClose }: { f: Partial<FaqItem>; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(f);
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title={f.faq_id ? "تعديل السؤال" : "سؤال جديد"} icon="info" width={560} footer={
      <Button loading={busy} disabled={!v.question_ar?.trim() || !v.answer_ar?.trim()} icon="check" onClick={async () => {
        setBusy(true);
        try {
          const body = { category: v.category, question_ar: v.question_ar?.trim(), answer_ar: v.answer_ar?.trim(), sort: Number(v.sort ?? 0), is_active: v.is_active };
          if (f.faq_id) await supportApi.updateFaq(f.faq_id, body); else await supportApi.createFaq(body);
          void qc.invalidateQueries({ queryKey: ["faq-admin"] }); toast.success("حُفظ"); onClose();
        } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
      }}>حفظ</Button>}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">التصنيف
          <select value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} className={`${controlCls} h-11 px-3`}>{FAQ_CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <Field label="السؤال" value={v.question_ar ?? ""} onChange={(e) => setV({ ...v, question_ar: e.target.value })} maxLength={300} />
        <label className="flex flex-col gap-1 text-sm">الجواب
          <textarea value={v.answer_ar ?? ""} onChange={(e) => setV({ ...v, answer_ar: e.target.value })} rows={5} className={`${controlCls} h-auto p-3`} />
        </label>
        <Field label="الترتيب" type="number" value={String(v.sort ?? 0)} onChange={(e) => setV({ ...v, sort: Number(e.target.value) })} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.is_active ?? true} onChange={(e) => setV({ ...v, is_active: e.target.checked })} />فعّال (يظهر في تطبيق المراجع)</label>
      </div>
    </Modal>
  );
}

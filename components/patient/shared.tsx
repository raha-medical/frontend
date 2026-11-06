"use client";
/** ما تتشاركه شاشات تطبيق المريض: الدفع الإلكتروني، رمز المسح، ورقة النتيجة. */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icon";
import { QrCode } from "@/components/qr";
import { Alert, Button, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { patientApi } from "@/lib/api/staff";
import { API_URL } from "@/lib/config";
import { openGateway, type PayBody } from "./gateway";

export const pub = async <T,>(path: string): Promise<T> => { const r = await fetch(API_URL + path); if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<T>; };

export type OPay = { online_payment_id: string; amount: number; status: string; redirect_url: string | null; receipt: { receipt_number: string; qr_code: string } | null; provider_reference?: string; failure_code?: string | null };

/** رحلة الدفع الإلكتروني (زين كاش / كي كارد، القسم 3.5). النتيجة من استعلام الخادم دائماً. */
export async function payOnline(b: PayBody): Promise<OPay> {
  const r = await openGateway(b);
  if (!r) throw new Error("أُغلقت نافذة الدفع قبل البدء");
  return r;
}

/** زر يُظهر رمز QR كبيراً للمسح (الحجز في الاستقبال، الوصفة في الصيدلية). */
export function QrToggle({ value, label, hint }: { value: string; label: string; hint: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <button onClick={() => setOpen(false)} className="flex flex-col items-center gap-1.5 rounded-2xl border border-line bg-white p-3" aria-label="إخفاء الرمز">
      <QrCode value={value} size={200} label={label} />
      <span className="sub-sm">{hint}</span>
    </button>
  ) : (
    <button onClick={() => setOpen(true)} className="flex h-10 items-center justify-center gap-2 rounded-full border border-line-strong bg-surface text-base font-semibold"><Icon name="qr-code" size={17} />عرض رمز المسح</button>
  );
}

export function ResultSheet({ id, dept, onClose }: { id: string; dept: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["p", "res", id], queryFn: () => patientApi.get<{ service_name: string; values?: { code: string; name: string; unit: string | null; value: number; ref_low: number | null; ref_high: number | null; flag: string }[]; text_result?: string | null; comment?: string | null; findings?: string | null; impression?: string | null; attachments: { file_id: string; file_name: string; url: string }[] }>(dept === "lab" ? `/lab/orders/${id}/result` : `/radiology/orders/${id}/report`) });
  return (
    // في portal فوق شريط التنقل السفلي (يقع داخل سياق تكديس التطبيق)، حتى لا يغطي زر الإغلاق
    createPortal(<div className="scale-patient fixed inset-0 z-[60] flex items-end justify-center bg-black/45" role="dialog" aria-modal="true" aria-label="تفاصيل النتيجة" onClick={onClose}>
      <div className="flex max-h-[85dvh] w-full max-w-[440px] flex-col gap-3 overflow-auto rounded-t-3xl bg-surface p-5 pb-[max(env(safe-area-inset-bottom),20px)]" onClick={(e) => e.stopPropagation()}>
        {q.isPending ? <Spinner /> : q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert> : <>
          <span className="text-lg font-bold">{q.data.service_name}</span>
          {q.data.values?.map((v) => <div key={v.code} className="flex items-center gap-2 border-b border-line py-2 text-base"><span className="flex-1" dir="ltr">{v.name}</span><span className={`num font-bold ${v.flag.includes("critical") ? "text-danger-strong" : v.flag === "normal" ? "" : "text-warn-strong"}`}>{v.value}</span><span className="num text-sm text-ink-2" dir="ltr">{v.unit} ({v.ref_low ?? "—"}–{v.ref_high ?? "—"})</span></div>)}
          {q.data.text_result && <p className="text-base">{q.data.text_result}</p>}
          {q.data.findings && <p className="text-base"><b>الموجودات:</b> {q.data.findings}</p>}
          {q.data.impression && <p className="text-base"><b>الانطباع:</b> {q.data.impression}</p>}
          {q.data.comment && <p className="sub">{q.data.comment}</p>}
          {q.data.attachments.map((a) => <a key={a.file_id} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-base"><Icon name="paperclip" size={14} />{a.file_name}</a>)}
        </>}
        <Button variant="ghost" className="shrink-0" onClick={onClose}>إغلاق</Button>
      </div>
    </div>, document.body)
  );
}

"use client";
/**
 * 7.1-ب: معاينة الوصل الفعلي قبل طباعته. بعد التحصيل/الاسترجاع يُجلب print-payload من الخادم (الرقم التسلسلي و QR والشعار)
 * ويُعرض بنفس قالب الطباعة (receiptHtml) داخل iframe، فما يراه الموظف هو ما يُطبع حرفياً. الشكل النهائي لجلسة التصميم.
 */
import { useEffect, useState } from "react";
import { Alert, Button, Modal, Spinner } from "@/components/ui";
import { toast } from "@/components/toast";
import { receiptHtml } from "@/lib/agent";
import { printDocument } from "@/lib/agent/print-html";
import type { DrawerResult } from "@/lib/api/billing";
import { errorMessage } from "@/lib/api/errors";
import { loadReceiptPayload, printReceiptPayload } from "@/lib/reception/print";

export function ReceiptPrintDialog({ result, onClose }: { result: DrawerResult | null; onClose: () => void }) {
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [printed, setPrinted] = useState(false);
  useEffect(() => {
    setPayload(null); setError(null); setPrinted(false);
    if (!result?.receipt) return;
    let live = true;
    loadReceiptPayload(result).then((p) => { if (live) setPayload(p); }, (e) => { if (live) setError(e); });
    return () => { live = false; };
  }, [result]);
  if (!result?.receipt) return null;
  const close = () => { if (!printed) toast.warn("لم يُطبع الوصل. يمكن طباعة نسخة مكررة من «إيصالات حسابي»."); onClose(); };
  return (
    <Modal open onClose={close} title={`معاينة الوصل ${result.receipt.receipt_number}`} icon="receipt" width={420}
      footer={<div className="flex gap-2">
        <Button icon="printer" loading={busy} disabled={!payload || printed} onClick={async () => {
          setBusy(true);
          try { await printReceiptPayload(payload!, result); setPrinted(true); toast.success("طُبع الوصل"); onClose(); }
          catch (e) { toast.error(`تعذرت الطباعة: ${errorMessage(e)}`); } finally { setBusy(false); }
        }}>طباعة</Button>
        <Button variant="ghost" onClick={close}>إغلاق</Button>
      </div>}>
      {error ? <Alert tone="danger">{errorMessage(error)}</Alert> : !payload ? <Spinner /> : (
        <iframe title="معاينة الوصل" srcDoc={printDocument(receiptHtml(payload), "معاينة الوصل").replace("</head>", "<style>body{padding:12px;box-sizing:border-box}</style></head>")}
          className="h-[480px] w-full rounded-xl border border-line bg-white" sandbox="" />
      )}
    </Modal>
  );
}

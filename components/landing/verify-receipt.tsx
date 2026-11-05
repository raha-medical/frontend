"use client";
/** صفحة التحقق العامة من الإيصال (مسح الـ QR). العقد 9: GET /public/receipts/verify/{code}. لا تعرض بيانات المريض. */
import { useQuery } from "@tanstack/react-query";
import { BrandMark } from "@/components/brand-mark";
import { Icon } from "@/components/icon";
import { API_URL } from "@/lib/config";
import { fmtDateTime, fmtNum } from "@/lib/format";

type Verify = { valid: boolean; receipt_number: string; type: string; issued_at: string; total: number; branch_name: string; status: "valid" | "partially_refunded" | "refunded" };
const TYPE_AR: Record<string, string> = { payment: "إيصال قبض", refund: "إيصال استرجاع", deposit: "إيصال عربون", online: "إيصال دفع إلكتروني" };
const STATUS: Record<Verify["status"], { label: string; cls: string; icon: string }> = {
  valid: { label: "إيصال صحيح", cls: "bg-success-soft text-success-strong", icon: "shield-check" },
  partially_refunded: { label: "إيصال صحيح · مسترجع جزئياً", cls: "bg-warn-soft text-warn-strong", icon: "shield-alert" },
  refunded: { label: "إيصال صحيح · مسترجع بالكامل", cls: "bg-warn-soft text-warn-strong", icon: "shield-alert" },
};

export function VerifyReceipt({ code }: { code: string }) {
  const q = useQuery({
    queryKey: ["verify", code], retry: false,
    queryFn: async () => {
      const r = await fetch(`${API_URL}/public/receipts/verify/${encodeURIComponent(code)}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as Verify;
    },
  });
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-card bg-surface p-6 shadow-pop">
        <div className="flex flex-col items-center gap-1.5 border-b border-dashed border-line-strong pb-4">
          <BrandMark size={44} />
          <span className="text-base font-bold">مجمع الرحمة الطبي</span>
          <span className="sub-sm">التحقق من أصالة الإيصال</span>
        </div>
        {q.isPending ? <span className="sub text-center">جارٍ التحقق…</span>
          : q.isError ? <span className="text-center text-danger-strong">تعذر الاتصال. حاول مرة أخرى.</span>
          : !q.data ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-danger-soft p-4 text-center text-danger-strong">
              <Icon name="shield-x" size={34} /><span className="text-lg font-bold">إيصال غير صحيح</span>
              <span className="text-sm">لم نجد هذا الإيصال في سجلات المجمع. لا يعتد به.</span>
            </div>
          ) : (
            <>
              <div className={`flex items-center justify-center gap-2 rounded-2xl p-3.5 text-base font-bold ${STATUS[q.data.status]?.cls ?? STATUS.valid.cls}`}>
                <Icon name={STATUS[q.data.status]?.icon ?? "shield-check"} size={22} />{STATUS[q.data.status]?.label ?? "إيصال صحيح"}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-sm">
                <dt className="sub">الرقم</dt><dd className="num text-end font-semibold">{q.data.receipt_number}</dd>
                <dt className="sub">النوع</dt><dd className="text-end">{TYPE_AR[q.data.type] ?? q.data.type}</dd>
                <dt className="sub">التاريخ</dt><dd className="num text-end">{fmtDateTime(q.data.issued_at)}</dd>
                <dt className="sub">الفرع</dt><dd className="text-end">{q.data.branch_name}</dd>
                <dt className="sub">المبلغ</dt><dd className="num text-end text-lg font-bold">{fmtNum(q.data.total)} د.ع</dd>
              </dl>
            </>
          )}
      </div>
    </main>
  );
}

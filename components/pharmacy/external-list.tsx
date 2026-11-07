"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, DataGrid } from "@/components/ui";
import { pharmacyCatalogApi, type ExternalSale } from "@/lib/api/pharmacy-catalog";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { errorMessage } from "@/lib/api/errors";
import { TextInput, useDebounced } from "@/components/reception/common";

export function PharmacyExternalList({ canWrite }: { canWrite: boolean }) {
  const [text, setText] = useState("");
  const q = useDebounced(text);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const result = useQuery({ queryKey: ["pharmacy-external", q, status, page], queryFn: () => pharmacyCatalogApi.external({ q: q || undefined, status: status || undefined, page, page_size: 20 }), refetchInterval: 15000 });
  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-0 flex-1"><TextInput label="بحث عن مراجع مباشر" value={text} onChange={v => { setText(v); setPage(1); }} placeholder="الاسم أو الهاتف أو رقم الملف" icon="search" /></div><label className="flex flex-col gap-1.5 text-sm">الحالة<select className="h-12 rounded-field border border-line-strong bg-surface px-3" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">كل الحالات</option><option value="billed">بانتظار الدفع أو التسليم</option><option value="dispensed">مكتملة</option></select></label></div>
    <DataGrid<ExternalSale> aria-label="مراجعو الصيدلية المباشرون" rows={result.data?.items} loading={result.isPending} error={result.isError ? errorMessage(result.error) : undefined} rowKey={s => s.invoice_id} pageSize={0} empty={{ icon: "user-round", title: "لا توجد طلبات مباشرة", hint: "سجّل المراجع باسمه وهاتفه واختر علاجاته وكمياتها." }} columns={[
      { key: "patient_name", header: "المراجع", cell: s => <span className="flex flex-col"><span className="font-bold">{s.patient_name}</span><span className="sub-sm">{s.file_number}</span><span className="num text-xs" dir="ltr">{s.phone_number}</span></span> },
      { key: "status", header: "الحالة", cell: s => <Badge tone={s.status === "dispensed" ? "success" : "warn"}>{s.status === "dispensed" ? "مكتملة" : "بانتظار الدفع أو التسليم"}</Badge> },
      { key: "amount", header: "مبلغ الطلب", cell: s => <span className="num">{fmtNum(s.amount)} د.ع</span> },
      { key: "created_at", header: "التاريخ", cell: s => <span className="num text-xs">{fmtDateTime(s.created_at)}</span> },
      { key: "open", header: "", cell: s => canWrite && <Link href={`/staff/pharmacy/external?invoice_id=${s.invoice_id}`} className="font-semibold text-primary">فتح الطلب</Link> },
    ]} />
    <div className="flex items-center justify-between gap-3 text-sm"><Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>السابق</Button><span className="num">{page} · {result.data?.total ?? 0} طلب</span><Button variant="ghost" size="sm" disabled={page * 20 >= (result.data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>التالي</Button></div>
  </div>;
}

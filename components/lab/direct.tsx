"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Spinner } from "@/components/ui";
import { TextInput } from "@/components/reception/common";
import { labCatalogApi, type LabDirectResult } from "@/lib/api/lab-catalog";
import { errorMessage } from "@/lib/api/errors";
import { fmtNum } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import { useAuth } from "@/lib/auth/store";

export function LabDirect() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["lab-catalog"], queryFn: labCatalogApi.list });
  const canCreate = useAuth(s => s.can("lab.write"));
  const canCollect = useAuth(s => s.can("payments.collect"));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [key, setKey] = useState(uuidv7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<LabDirectResult | null>(null);
  const valid = name.trim().length >= 2 && name.trim().length <= 150 && /^07\d{9}$/.test(phone.trim()) && selected.length > 0 && selected.length <= 30;
  async function submit() {
    if (!valid || busy || !canCreate) return;
    setBusy(true); setError(null);
    try {
      const response = await labCatalogApi.direct({ new_patient: { full_name: name.trim(), phone_number: phone.trim() }, items: selected.map(service_id => ({ service_id })) }, key);
      setResult(response);
      void qc.invalidateQueries({ queryKey: ["referrals"] });
      void qc.invalidateQueries({ queryKey: ["worklist", "lab"] });
      void qc.invalidateQueries({ queryKey: ["basket", response.patient_id] });
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  if (result) return <Card className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
    <h1 className="text-lg font-bold">تم تسجيل طلب المراجع المباشر</h1>
    <p>{result.patient_name} · <span className="num">{result.file_number}</span></p>
    <Alert tone="info">التحاليل بانتظار الدفع أو الاستثناء المعتمد. يبدأ العمل بعد التحصيل.</Alert>
    {result.items.map(item => <div key={item.order_item_id} className="flex justify-between gap-3 border-b border-line py-2"><span>{item.service_name}</span><span className="num">{fmtNum(item.price)} د.ع</span></div>)}
    <p className="font-bold">المطلوب: <span className="num">{fmtNum(result.total_due)} د.ع</span></p>
    {canCollect && <Link className="rounded-full bg-primary px-4 py-3 text-center font-bold text-on-accent" href={`/staff/reception/collect?patient_id=${result.patient_id}`}>متابعة التحصيل</Link>}
    <Link className="text-center font-semibold text-primary" href="/staff/lab?tab=incoming&source=direct">عرض الطلبات المباشرة</Link>
    <Button variant="ghost" icon="user-plus" onClick={() => { setName(""); setPhone(""); setSelected([]); setResult(null); setKey(uuidv7()); }}>تسجيل مراجع آخر</Button>
  </Card>;
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
    <Card className="flex flex-col gap-4 p-5">
      <div><h1 className="text-lg font-bold">تسجيل مراجع مباشر للمختبر</h1><p className="sub mt-1">للمراجع الذي يأتي دون إحالة من طبيب المجمع. أدخل الاسم والهاتف واختر التحاليل.</p></div>
      {!canCreate && <Alert tone="warn">تسجيل الطلب يتطلب صلاحية العمل في المختبر.</Alert>}
      <fieldset disabled={busy || !canCreate} className="grid min-w-0 gap-4 sm:grid-cols-2">
        <TextInput label="اسم المريض الخارجي" value={name} onChange={v => { setName(v); setKey(uuidv7()); }} required icon="user-round" />
        <TextInput label="رقم الهاتف" value={phone} onChange={v => { setPhone(v); setKey(uuidv7()); }} required icon="phone" ltr placeholder="07XXXXXXXXX" />
      </fieldset>
      {phone && !/^07\d{9}$/.test(phone.trim()) && <p role="status" className="text-sm text-danger-strong">أدخل رقم هاتف عراقي من 11 رقمًا يبدأ بـ07.</p>}
    </Card>
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="font-bold">التحاليل المطلوبة <span className="num text-primary">({selected.length})</span></h2>
      <TextInput label="بحث عن تحليل" value={search} onChange={setSearch} icon="search" />
      {query.isPending ? <Spinner /> : query.isError ? <Alert tone="danger">{errorMessage(query.error)}</Alert> : <fieldset disabled={busy || !canCreate} className="flex max-h-96 flex-col overflow-auto">
        {(query.data?.items ?? []).filter(s => s.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(s => <label key={s.service_id} className="flex cursor-pointer items-center gap-3 border-b border-line py-3">
          <input type="checkbox" className="size-5 shrink-0 accent-primary" checked={selected.includes(s.service_id)} disabled={!selected.includes(s.service_id) && selected.length >= 30} onChange={e => { setSelected(xs => e.target.checked ? [...xs, s.service_id] : xs.filter(id => id !== s.service_id)); setKey(uuidv7()); }} />
          <span className="flex-1 font-semibold">{s.name}</span><span className="num whitespace-nowrap text-sm">{fmtNum(s.price)} {s.currency === "USD" ? "$" : "د.ع"}</span>
        </label>)}
        {!query.data?.items.length && <p className="sub py-4">لا توجد تحاليل متاحة. أضفها من شاشة التحاليل والأسعار.</p>}
      </fieldset>}
      {error != null && <Alert tone="danger">{errorMessage(error)}</Alert>}
      <Button icon="clipboard-plus" loading={busy} disabled={!valid || !canCreate || query.isError} onClick={() => void submit()}>إنشاء طلب التحاليل</Button>
    </Card>
  </div>;
}

"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, DataGrid, Modal } from "@/components/ui";
import { TextInput, MoneyInput } from "@/components/reception/common";
import { labCatalogApi, type LabServiceInput } from "@/lib/api/lab-catalog";
import type { Service } from "@/lib/api/billing";
import { useAuth } from "@/lib/auth/store";
import { errorMessage } from "@/lib/api/errors";
import { fmtNum } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import { toast } from "@/components/toast";

export function LabSettings() {
  const query = useQuery({ queryKey: ["lab-catalog"], queryFn: labCatalogApi.list });
  const canWrite = useAuth(s => s.can("lab.write"));
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  return <div className="flex flex-col gap-4">
    <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div><h1 className="text-lg font-bold">تحاليل المختبر وأسعارها</h1><p className="sub mt-1">أسعار الفرع الحالي. تغيير السعر يسري على الطلبات الجديدة فقط.</p></div>
      {canWrite && <Button icon="plus" onClick={() => setEditing("new")}>إضافة تحليل</Button>}
    </Card>
    <DataGrid<Service> aria-label="تحاليل المختبر وأسعارها" rows={query.data?.items} loading={query.isPending} error={query.isError ? errorMessage(query.error) : undefined}
      rowKey={s => s.service_id} search={{ placeholder: "ابحث عن تحليل" }} empty={{ icon: "flask-conical", title: "لم تُضف تحاليل بعد", hint: "أضف التحاليل وأسعارها لتظهر عند تسجيل طلب جديد." }} columns={[
        { key: "name", header: "التحليل", sortable: true },
        { key: "price", header: "السعر", sortable: true, cell: s => <span className="num font-bold">{fmtNum(s.price)} {s.currency === "USD" ? "$" : "د.ع"}</span> },
        { key: "edit", header: "", cell: s => canWrite && <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditing(s)}>تعديل</Button> },
      ]} />
    {editing && <ServiceEditor key={editing === "new" ? "new" : editing.service_id} service={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
  </div>;
}

function ServiceEditor({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<LabServiceInput>({ name: service?.name ?? "", price: service?.price ?? 0, currency: service?.currency ?? "IQD", reason: "" });
  const [key] = useState(uuidv7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const changedPrice = !!service && (service.price !== form.price || (service.currency ?? "IQD") !== form.currency);
  const valid = form.name.trim().length > 0 && form.name.trim().length <= 150 && Number.isSafeInteger(form.price) && form.price >= 0 && form.price <= 100_000_000 && (!changedPrice || !!form.reason?.trim());
  async function save() {
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try {
      const body = { ...form, name: form.name.trim(), reason: form.reason?.trim() || undefined };
      if (service) await labCatalogApi.update(service.service_id, body); else await labCatalogApi.create(body, key);
      await qc.invalidateQueries({ queryKey: ["lab-catalog"] });
      void qc.invalidateQueries({ queryKey: ["services"] });
      toast.success(service ? "حُفظ التحليل وسعره" : "أُضيف التحليل"); onClose();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return <Modal open title={service ? "تعديل تحليل" : "إضافة تحليل"} icon="flask-conical" onClose={() => { if (!busy) onClose(); }}>
    <div className="flex flex-col gap-4">
      <TextInput label="اسم التحليل" value={form.name} onChange={name => setForm({ ...form, name })} required />
      <MoneyInput label="السعر" value={form.price} onChange={price => setForm({ ...form, price })} unit={form.currency === "USD" ? "$" : "د.ع"} />
      <label className="flex flex-col gap-1.5 text-sm font-medium">عملة السعر<select className="h-11 rounded-field border border-line-strong bg-surface px-3" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value as "IQD" | "USD" })}><option value="IQD">دينار عراقي</option><option value="USD">دولار أمريكي</option></select></label>
      {changedPrice && <TextInput label="سبب تغيير السعر" value={form.reason ?? ""} onChange={reason => setForm({ ...form, reason })} required />}
      {error != null && <Alert tone="danger">{errorMessage(error)}</Alert>}
      <Button icon="save" loading={busy} disabled={!valid} onClick={() => void save()}>حفظ التحليل</Button>
    </div>
  </Modal>;
}

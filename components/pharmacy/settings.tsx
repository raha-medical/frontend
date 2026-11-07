"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, DataGrid, Modal } from "@/components/ui";
import { TextInput, MoneyInput } from "@/components/reception/common";
import { pharmacyCatalogApi, type DrugInput } from "@/lib/api/pharmacy-catalog";
import type { Service } from "@/lib/api/billing";
import { useAuth } from "@/lib/auth/store";
import { errorMessage } from "@/lib/api/errors";
import { fmtNum } from "@/lib/format";
import { uuidv7 } from "@/lib/id";
import { toast } from "@/components/toast";

export function PharmacySettings() {
  const q = useQuery({ queryKey: ["pharmacy-drugs", "catalog"], queryFn: pharmacyCatalogApi.list });
  const canWrite = useAuth(s => s.can("pharmacy.dispense"));
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  return <div className="flex flex-col gap-4">
    <Card className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h1 className="text-lg font-bold">العلاجات والأسعار</h1><p className="sub mt-1">سعر الوحدة في الفرع الحالي. تحدد كمية المريض عند الصرف، بدون إدارة مخزون.</p></div>{canWrite && <Button icon="plus" onClick={() => setEditing("new")}>إضافة علاج</Button>}</Card>
    <DataGrid<Service> aria-label="علاجات الصيدلية وأسعارها" rows={q.data?.items} loading={q.isPending} error={q.isError ? errorMessage(q.error) : undefined} rowKey={s => s.service_id} search={{ placeholder: "ابحث عن علاج" }} empty={{ icon: "pill", title: "لا توجد علاجات", hint: "أضف العلاج وسعر الوحدة ليظهر عند الصرف." }} columns={[
      { key: "name", header: "العلاج", sortable: true },
      { key: "price", header: "سعر الوحدة", sortable: true, cell: s => <span className="num font-bold">{fmtNum(s.price)} {s.currency === "USD" ? "$" : "د.ع"}</span> },
      { key: "requires_prescription", header: "الوصفة", cell: s => <Badge tone={s.requires_prescription ? "warn" : "muted"}>{s.requires_prescription ? "يحتاج وصفة" : "غير مقيّد بوصفة"}</Badge> },
      { key: "edit", header: "", cell: s => canWrite && <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditing(s)}>تعديل</Button> },
    ]} />
    {editing && <DrugEditor drug={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
  </div>;
}
function DrugEditor({ drug, onClose }: { drug: Service | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<DrugInput>({ name: drug?.name ?? "", price: drug?.price ?? 0, currency: drug?.currency ?? "IQD", requires_prescription: drug?.requires_prescription ?? false, reason: "" });
  const [key, setKey] = useState(uuidv7);
  const change = (patch: Partial<DrugInput>) => { setForm(f => ({ ...f, ...patch })); setKey(uuidv7()); };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const changedPrice = !!drug && (form.price !== drug.price || form.currency !== (drug.currency ?? "IQD"));
  const valid = form.name.trim().length > 0 && form.name.trim().length <= 150 && Number.isSafeInteger(form.price) && form.price >= 0 && form.price <= 100_000_000 && (!changedPrice || !!form.reason?.trim());
  async function save() {
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try {
      const body = { ...form, name: form.name.trim() };
      if (drug) await pharmacyCatalogApi.update(drug.service_id, body); else await pharmacyCatalogApi.create(body, key);
      await qc.invalidateQueries({ queryKey: ["pharmacy-drugs"] });
      void qc.invalidateQueries({ queryKey: ["services"] });
      toast.success("حُفظ العلاج وسعره"); onClose();
    } catch(e) { setError(e); } finally { setBusy(false); }
  }
  return <Modal open title={drug ? "تعديل علاج" : "إضافة علاج"} icon="pill" onClose={() => { if (!busy) onClose(); }}><fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
    <TextInput label="اسم العلاج" value={form.name} onChange={name => change({ name })} required />
    <MoneyInput label="سعر الوحدة" value={form.price} onChange={price => change({ price })} unit={form.currency === "USD" ? "$" : "د.ع"} />
    <label className="flex flex-col gap-1.5 text-sm">العملة<select value={form.currency} onChange={e => change({ currency: e.target.value as "IQD" | "USD" })} className="h-11 rounded-field border border-line-strong bg-surface px-3"><option value="IQD">دينار عراقي</option><option value="USD">دولار أمريكي</option></select></label>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requires_prescription} onChange={e => change({ requires_prescription: e.target.checked })} className="size-5" />العلاج يحتاج وصفة</label>
    {changedPrice && <TextInput label="سبب تغيير السعر" value={form.reason ?? ""} onChange={reason => change({ reason })} required />}
    {error != null && <Alert tone="danger">{errorMessage(error)}</Alert>}
    <Button icon="save" loading={busy} disabled={!valid} onClick={() => void save()}>حفظ العلاج</Button>
  </fieldset></Modal>;
}

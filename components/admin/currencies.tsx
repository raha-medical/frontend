"use client";
/** العملات (7.2): سعر صرف الدولار لليوم يحدده محاسب الفرع، وسجله. وبوابات الدفع المتاحة (زين كاش، كي كارد) بوضعها. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/toast";
import { Alert, Badge, Button, Card, DataGrid, Field, Spinner } from "@/components/ui";
import { currencyApi } from "@/lib/api/session4";
import { staffApi } from "@/lib/api/staff";
import { errorMessage } from "@/lib/api/errors";
import { fmtDate, fmtDateTime, fmtNum } from "@/lib/format";
import { useAuth } from "@/lib/auth/store";
import { hasPerm } from "@/lib/roles";

export function CurrenciesScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["exchange-rates"], queryFn: () => currencyApi.get() });
  const canSet = hasPerm(useAuth((s) => s.user), ["shifts.review", "settings.edit"]);
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="danger">{errorMessage(q.error)}</Alert>;
  const today = q.data.today;
  return (
    <div className="flex flex-col gap-4">
      <Card solid className="flex flex-col gap-3 p-5">
        <span className="text-lg font-bold">سعر صرف الدولار لليوم <span className="num">{fmtDate(q.data.date)}</span></span>
        {today
          ? <span className="text-2xl font-bold"><span className="num">{fmtNum(today.usd_to_iqd)}</span> د.ع لكل دولار <span className="sub-sm">· {today.set_by_name} · <span className="num">{fmtDateTime(today.set_at)}</span></span></span>
          : <Alert tone="warn">لم يُدخل سعر اليوم. التحصيل بالدولار وخدمات الدولار مرفوضة حتى إدخاله.</Alert>}
        <span className="sub">كل المبالغ تُحفظ بالدينار. الخدمة المسعّرة بالدولار تتحول بسعر يوم إنشاء البند، والدفعة بالدولار تحفظ السعر المستخدم، والفكة تُعاد بالدينار دائماً. استرجاع دفعة بالدولار يكون بنفس العملة وبسعر الدفع الأصلي. زين كاش وكي كارد بالدينار فقط.</span>
        {canSet && (
          <form className="flex flex-wrap items-end gap-2" onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try { await currencyApi.set(Number(rate)); toast.success("حُفظ سعر اليوم"); setRate(""); void qc.invalidateQueries({ queryKey: ["exchange-rates"] }); }
            catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
          }}>
            <div className="w-56"><Field label="دينار لكل دولار" inputMode="numeric" ltr value={rate} onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))} placeholder="1310" /></div>
            <Button size="md" loading={busy} disabled={!rate || Number(rate) < 100} icon="check">{today ? "تعديل سعر اليوم" : "حفظ سعر اليوم"}</Button>
          </form>
        )}
      </Card>
      <DataGrid aria-label="سجل أسعار الصرف" rows={q.data.history} rowKey={(r) => r.date} minWidth={480} empty={{ icon: "history", title: "لا يوجد سجل" }}
        columns={[
          { key: "date", header: "اليوم", cell: (r) => <span className="num">{fmtDate(r.date)}</span> },
          { key: "usd_to_iqd", header: "السعر", cell: (r) => <span className="num font-bold">{fmtNum(r.usd_to_iqd)}</span> },
          { key: "set_by_name", header: "بواسطة", cell: (r) => r.set_by_name ?? "" },
          { key: "set_at", header: "الوقت", cell: (r) => <span className="num text-xs">{fmtDateTime(r.set_at)}</span> },
        ]} />
    </div>
  );
}

type Provider = { code: string; name_ar: string; mode: string };

export function GatewaysScreen() {
  const q = useQuery({ queryKey: ["providers"], queryFn: () => staffApi.get<Provider[]>("/online-payments/providers") });
  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="danger">{errorMessage(q.error)}</Alert>;
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="info">البوابات تُفعَّل من إعدادات الخادم لكل بوابة: <span dir="ltr" className="num">Payments__Providers__&#123;zaincash|qicard&#125;__Mode = mock | live | off</span>. الوضع التجريبي يتعطل تلقائياً في الإنتاج، والدفع بالدينار فقط.</Alert>
      {!q.data.length ? <Card className="p-6"><span className="sub">لا توجد بوابة مفعّلة.</span></Card> : q.data.map((p) => (
        <Card key={p.code} solid className="flex items-center gap-3 p-4">
          <span className="flex-1 font-bold">{p.name_ar}</span>
          <Badge tone={p.mode === "live" ? "success" : "warn"}>{p.mode === "live" ? "حقيقي" : p.mode === "mock" ? "تجريبي" : p.mode}</Badge>
        </Card>
      ))}
    </div>
  );
}

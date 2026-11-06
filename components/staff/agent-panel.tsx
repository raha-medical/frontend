"use client";
/** إعداد وكيل العتاد (الطابعة والدرج) على حاسوب الاستقبال: الحالة، مفتاح الوكيل، كتلة الإيصالات، طباعة تجريبية. القسمان 16 و17. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "../icon";
import { toast } from "../toast";
import { Alert, Button, Field, Modal } from "../ui";
import { getAgentKey, hardwareAgent, setAgentKey } from "@/lib/agent";
import { currentBlock, pumpAgentEvents, reserveReceiptBlock } from "@/lib/agent/lifecycle";
import { staffApi } from "@/lib/api/staff";
import { errorMessage } from "@/lib/api/errors";
import { AGENT_URL, CASH_DRAWER_ENABLED, DEVICE_CODE } from "@/lib/config";
import { fmtTime } from "@/lib/format";
import { useAuth } from "@/lib/auth/store";
import { flushOutbox } from "@/lib/offline/outbox";

export function AgentPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const canCollect = useAuth((s) => !!s.user?.permissions.includes("payments.collect"));
  const status = useQuery({ queryKey: ["agent", "status"], queryFn: () => hardwareAgent.status(), enabled: open, retry: false });
  const server = useQuery({ queryKey: ["agent", "server-key"], queryFn: () => staffApi.get<{ key_id?: string }>("/agent/drawer-public-key"), enabled: open, staleTime: 300_000 });
  const block = useQuery({ queryKey: ["agent", "block"], queryFn: async () => (await currentBlock()) ?? null, enabled: open });
  const [key, setKey] = useState(getAgentKey);
  const [busy, setBusy] = useState<string | null>(null);
  const real = hardwareAgent.mode === "agent";
  const st = status.data;
  const keyMismatch = real && st?.public_key_id && server.data?.key_id && st.public_key_id !== server.data.key_id;

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    try { await fn(); } catch (e) { toast.error(errorMessage(e)); } finally {
      setBusy(null);
      void qc.invalidateQueries({ queryKey: ["agent"] });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={CASH_DRAWER_ENABLED ? "الطابعة والدرج" : "الطابعة"} icon="printer" width={520}>
      <div className="flex flex-col gap-1 rounded-xl bg-bg p-3 text-[13px]">
        <Row k="الوضع" v={real ? "وكيل محلي" : "محاكاة (طباعة المتصفح)"} />
        {real && <Row k="عنوان الوكيل" v={<span dir="ltr" className="num">{AGENT_URL}</span>} />}
        <Row k="رمز الجهاز" v={<span dir="ltr" className="num">{DEVICE_CODE ?? "غير مضبوط"}</span>} />
      </div>

      {status.isError ? (
        <Alert tone="danger" icon="plug-zap">{errorMessage(status.error)}</Alert>
      ) : st && (
        <div className="flex flex-col gap-1 rounded-xl border border-line p-3 text-[13px]">
          <Row k="الإصدار" v={<span className="num">{st.agent_version}</span>} />
          <Row k="الطابعة" v={!st.printer.connected ? "غير متصلة" : `${st.printer.model} · ${st.printer.paper === "ok" ? "الورق جيد" : st.printer.paper === "low" ? "ورق قليل" : "نفد الورق"}`} />
          {CASH_DRAWER_ENABLED && <Row k="الدرج" v={!st.drawer.connected ? "غير موصول" : st.drawer.state === "open" ? "مفتوح" : "مغلق"} />}
          <Row k="أحداث لم تُرفع" v={<span className="num">{st.pending_events}</span>} />
        </div>
      )}
      {CASH_DRAWER_ENABLED && keyMismatch && <Alert tone="warn" icon="key-round">مفتاح التوقيع في الوكيل يختلف عن مفتاح الخادم، فلن ينفتح الدرج. أعد تشغيل الوكيل ليجلب المفتاح الجديد.</Alert>}

      {real && (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1"><Field label="مفتاح الوكيل (X-Agent-Key)" icon="key-round" ltr secret value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="يظهر في نافذة الوكيل عند التثبيت" /></div>
          <Button size="md" variant="ghost" icon="save" onClick={() => { setAgentKey(key); toast.success("حُفظ المفتاح لهذا المتصفح"); void qc.invalidateQueries({ queryKey: ["agent"] }); }}>حفظ</Button>
        </div>
      )}

      {DEVICE_CODE && (
        <div className="flex flex-col gap-2 rounded-xl border border-line p-3 text-[13px]">
          <span className="flex items-center gap-1.5 font-semibold"><Icon name="ticket" size={16} />كتلة أرقام الإيصالات (للعمل أوفلاين)</span>
          {block.data ? (
            <span className="text-ink-2">
              <span dir="ltr" className="num">{block.data.prefix}{block.data.from} – {block.data.prefix}{block.data.to}</span>
              {st?.receipt_block?.block_id === block.data.block_id
                ? <> · الوكيل استلمها{st.receipt_block.last_used != null && <> · آخر رقم <span className="num">{st.receipt_block.last_used}</span></>}</>
                : <> · <b className="text-warn-strong">الوكيل لم يستلمها</b></>}
            </span>
          ) : <span className="text-ink-2">لا توجد كتلة. تُحجز تلقائياً عند فتح الوردية.</span>}
          {canCollect && (
            <Button size="md" variant="ghost" icon="send" loading={busy === "block"} onClick={() => run("block", async () => {
              const r = await reserveReceiptBlock();
              if (r.warning) toast.warn(r.warning); else toast.success("سُلّمت الكتلة للوكيل");
            })}>{block.data ? "إعادة إرسال الكتلة للوكيل" : "حجز كتلة الآن"}</Button>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="md" icon="printer" loading={busy === "test"} onClick={() => run("test", async () => {
          await hardwareAgent.printTicket({ ticket_number: "TEST", doctor_name: "طباعة تجريبية", estimated_time: fmtTime(new Date()) });
          toast.success("أُرسلت الطباعة التجريبية");
        })}>طباعة تجريبية</Button>
        {real && (
          <Button size="md" variant="ghost" icon="upload" loading={busy === "events"} onClick={() => run("events", async () => {
            const n = await pumpAgentEvents();
            await flushOutbox();
            toast.success(n ? `رُفع ${n} حدث` : "لا أحداث جديدة");
          })}>رفع الأحداث الآن</Button>
        )}
      </div>
      {CASH_DRAWER_ENABLED && <span className="sub-sm leading-6">الدرج لا ينفتح إلا مع طباعة إيصال تحصيل نقدي. النسخة المكررة لا تفتحه. أي فتح يدوي يصل للمحاسب.</span>}
    </Modal>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><span className="text-ink-2">{k}</span><span className="text-end">{v}</span></div>;
}

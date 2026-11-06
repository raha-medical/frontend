import { staffApi } from "../api/staff";
import { errorMessage } from "../api/errors";
import { DEVICE_CODE } from "../config";
import { enqueue } from "../offline/outbox";
import { kvGet, kvSet } from "../offline/db";
import { hardwareAgent, type ReceiptBlock } from "./index";

/**
 * دورة حياة كتلة الإيصالات والأحداث بين السيرفر والوكيل المحلي (القسمان 16 و17):
 * فتح الحساب اليومي ← حجز كتلة وتسليمها للوكيل · إغلاق الحساب اليومي ← إعادة الأرقام غير المستخدمة · كل دقيقة ← رفع أحداث الدرج والطابعة.
 * الفشل هنا لا يوقف الحساب اليومي؛ يعود سبب المشكلة للعرض فقط.
 */
const BLOCK_KEY = "agent.receipt_block";
const EVENTS_KEY = "agent.events_since";

export const currentBlock = () => kvGet<ReceiptBlock | null>(BLOCK_KEY);

/** يحجز كتلة للجهاز (أو يعيد الفعالة) ويسلّمها للوكيل. يُستدعى بعد فتح الحساب اليومي وعند «إعادة الإرسال للوكيل». */
export async function reserveReceiptBlock(): Promise<{ block: ReceiptBlock | null; warning?: string }> {
  if (!DEVICE_CODE) return { block: null, warning: "رمز جهاز الاستقبال غير مضبوط (NEXT_PUBLIC_DEVICE_CODE)" };
  let block: ReceiptBlock;
  try {
    block = await staffApi.post<ReceiptBlock>(`/devices/${encodeURIComponent(DEVICE_CODE)}/receipt-blocks`, {});
  } catch (e) {
    return { block: null, warning: `تعذر حجز كتلة الإيصالات: ${errorMessage(e)}` };
  }
  await kvSet(BLOCK_KEY, block);
  try {
    await hardwareAgent.setReceiptBlock(block);
    return { block };
  } catch (e) {
    return { block, warning: `حُجزت الكتلة لكن الوكيل لم يستلمها: ${errorMessage(e)}` };
  }
}

/** يعيد الأرقام غير المستخدمة. آخر رقم مستخدم من الوكيل إن عرفه، والسيرفر يعتمد الأكبر مما وصله. */
export async function returnReceiptBlock(): Promise<{ warning?: string }> {
  if (!DEVICE_CODE) return {};
  const block = await currentBlock();
  if (!block) return {};
  let lastUsed: number | null = null;
  try {
    const st = await hardwareAgent.status();
    if (st.receipt_block?.block_id === block.block_id) lastUsed = st.receipt_block.last_used ?? null;
  } catch { /* الوكيل غير متصل: السيرفر يعتمد آخر إيصال وصله */ }
  try {
    await staffApi.post(`/devices/${encodeURIComponent(DEVICE_CODE)}/receipt-blocks/${block.block_id}/return`, { last_used: lastUsed });
  } catch (e) {
    return { warning: `تعذرت إعادة أرقام الكتلة: ${errorMessage(e)}` };
  }
  await kvSet(BLOCK_KEY, null);
  try { await hardwareAgent.setReceiptBlock(null); } catch { /* يُستبدل عند الكتلة التالية */ }
  return {};
}

let pumping = false;
/** يقرأ أحداث الوكيل الجديدة ويضعها في الصادر كـ agent_event (idempotent بـ local_event_id)، ثم يؤكد للوكيل. */
export async function pumpAgentEvents(): Promise<number> {
  if (pumping || hardwareAgent.mode !== "agent" || !DEVICE_CODE) return 0;
  pumping = true;
  try {
    const since = (await kvGet<number>(EVENTS_KEY)) ?? 0;
    const events = await hardwareAgent.events(since);
    if (!events.length) return 0;
    for (const e of events) {
      await enqueue("agent_event", { local_event_id: e.local_event_id, type: e.type, receipt_number: e.receipt_number, occurred_at: e.occurred_at }, AGENT_EVENT_AR[e.type] ?? e.type);
    }
    const max = Math.max(...events.map((e) => e.local_event_id));
    await kvSet(EVENTS_KEY, max);
    // الأحداث صارت في الصادر المحلي (IndexedDB)، فلا تضيع إن حذفها الوكيل
    await hardwareAgent.ackEvents(max).catch(() => {});
    return events.length;
  } catch {
    return 0; // الوكيل غير متصل: نحاول في الدورة التالية
  } finally {
    pumping = false;
  }
}

const AGENT_EVENT_AR: Record<string, string> = {
  "receipt.printed": "طباعة إيصال", "drawer.opened": "فتح الدرج", "drawer.opened_without_receipt": "فتح الدرج بدون إيصال",
  "printer.error": "خطأ الطابعة", "paper.out": "نفاد الورق",
};

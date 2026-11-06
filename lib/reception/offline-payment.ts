import { hardwareAgent } from "../agent";
import { CASH_DRAWER_ENABLED } from "../config";
import { currentBlock } from "../agent/lifecycle";
import { uuidv7 } from "../id";
import { db, kvGet, kvSet } from "../offline/db";
import { enqueue } from "../offline/outbox";

/**
 * التحصيل النقدي أوفلاين (العقد 17، C3): برقم إيصال من كتلة الجهاز الموقّعة، وفي الوردية المفتوحة على الجهاز.
 * يُحفظ في الصادر كـ payment.create ويحمل shift_id، فيُسجّل في هذه الوردية وباسم صاحبها حتى لو أُغلقت قبل المزامنة.
 * الوكيل يفتح الدرج لأن الرقم من الكتلة (لا يحتاج توكن من الخادم).
 */
export const SHIFT_CACHE_KEY = "shift.current";
const usedKey = (blockId: string) => `agent.block_used:${blockId}`;

export async function collectCashOffline(a: { ticketId: string; patientId: string; patientName: string; amount: number; label: string }) {
  const shift = await kvGet<{ shift_id: string } | null>(SHIFT_CACHE_KEY);
  if (!shift?.shift_id) throw new Error("لا توجد وردية مفتوحة محفوظة على هذا الجهاز. افتح وردية وأنت متصل.");
  const block = await currentBlock();
  if (!block) throw new Error("لا توجد كتلة أرقام إيصالات على هذا الجهاز. تُحجز عند فتح الوردية وأنت متصل.");

  // الرقم التالي: الأكبر من عدّاد الواجهة وآخر رقم طبعه الوكيل
  let used = (await kvGet<number>(usedKey(block.block_id))) ?? block.from - 1;
  try {
    const st = await hardwareAgent.status();
    if (st.receipt_block?.block_id === block.block_id && st.receipt_block.last_used != null) used = Math.max(used, st.receipt_block.last_used);
  } catch { /* الوكيل غير متصل: الطباعة ستفشل أدناه ونبلغ */ }
  const n = used + 1;
  if (n > block.to) throw new Error("نفدت أرقام كتلة الإيصالات. أغلق الوردية وافتح غيرها عند عودة الاتصال.");
  const number = `${block.prefix}${n}`;
  await kvSet(usedKey(block.block_id), n);

  const at = new Date().toISOString();
  await enqueue("payment.create", {
    payment_id: uuidv7(), patient_id: a.patientId, ticket_id: a.ticketId, shift_id: shift.shift_id,
    tenders: [{ method: "cash", amount: a.amount }], offline_receipt_number: number, created_offline_at: at,
  }, `تحصيل أوفلاين ${number} · ${a.patientName}`);

  let printed = true;
  try {
    await hardwareAgent.printReceipt({
      print_payload: {
        receipt_number: number, type_ar: "إيصال تحصيل (أوفلاين)", patient_name: a.patientName, issued_at: at,
        lines: [{ text: a.label, amount: a.amount }], total: a.amount, tenders: [{ method: "cash", amount: a.amount }],
        footer: "صدر أثناء انقطاع الاتصال ويُطابق تلقائياً عند عودته",
      },
      drawer_token: null, open_drawer: CASH_DRAWER_ENABLED,
    });
  } catch { printed = false; }
  return { number, printed };
}

/** سعر الكشفية من لقطة الأوفلاين (للاقتراح فقط؛ الخادم يعلّم أي فرق للمحاسب). */
export async function consultationPrice(clinicId: string): Promise<number | null> {
  try {
    const list = (await db().services.toArray()) as Array<{ type?: string; clinic_id?: string | null; price?: number; visit_kind?: string | null; is_active?: boolean }>;
    const s = list.filter((x) => x.type === "consultation" && x.clinic_id === clinicId && x.is_active !== false);
    return (s.find((x) => (x.visit_kind ?? "new") === "new") ?? s[0])?.price ?? null;
  } catch { return null; }
}

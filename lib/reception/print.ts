import { hardwareAgent } from "../agent";
import { billingApi, type DrawerResult } from "../api/billing";
import { errorMessage } from "../api/errors";
import { toast } from "@/components/toast";
import { CASH_DRAWER_ENABLED } from "../config";

/**
 * بعد أي تحصيل/عربون/استرجاع: نجلب حمولة الإيصال من السيرفر ونرسلها مع توكن الدرج للوكيل المحلي (العقد 9 و16).
 * فشل الطباعة لا يلغي العملية (حُفظت في السيرفر)، ويمكن إعادة الطباعة كنسخة مكررة.
 */
/** حمولة الوصل الفعلي من الخادم (للمعاينة ثم الطباعة). */
export async function loadReceiptPayload(r: DrawerResult): Promise<Record<string, unknown>> {
  return (await billingApi.printPayload(r.receipt!.print_payload_url)) as unknown as Record<string, unknown>;
}

/** طباعة حمولة عُوينت مسبقاً (الطابعة فقط، الدرج موقوف). */
export async function printReceiptPayload(payload: Record<string, unknown>, r: DrawerResult) {
  await hardwareAgent.printReceipt({ print_payload: payload, drawer_token: CASH_DRAWER_ENABLED ? r.drawer_token : null, open_drawer: CASH_DRAWER_ENABLED && r.open_drawer });
  if (r.receipt) markPrinted(r.receipt.receipt_id);
}

/** تسجيل الطباعة في الخادم بعد نجاح الطابعة. فشله لا يوقف شيئاً: الإغلاق يطلب الطباعة أو السبب. */
function markPrinted(receiptId: string) { void billingApi.markPrinted(receiptId).catch(() => undefined); }

export async function printReceipt(r: DrawerResult): Promise<boolean> {
  if (!r.receipt) return false;
  try {
    const payload = await billingApi.printPayload(r.receipt.print_payload_url);
    await hardwareAgent.printReceipt({ print_payload: payload as unknown as Record<string, unknown>, drawer_token: CASH_DRAWER_ENABLED ? r.drawer_token : null, open_drawer: CASH_DRAWER_ENABLED && r.open_drawer });
    markPrinted(r.receipt.receipt_id);
    return true;
  } catch (e) {
    toast.error(`حُفظت العملية لكن تعذرت الطباعة: ${errorMessage(e)}`);
    return false;
  }
}

/** نسخة مكررة: لا تفتح الدرج (الاستقبال مرة واحدة لكل إيصال). */
export async function reprintReceipt(receiptId: string) {
  const r = await billingApi.reprint(receiptId);
  const payload = await billingApi.printPayload(r.print_payload_url);
  await hardwareAgent.printReceipt({ print_payload: payload as unknown as Record<string, unknown>, drawer_token: null, open_drawer: false });
  markPrinted(receiptId);
  return r.copy_number;
}

import { hardwareAgent } from "../agent";
import { billingApi, type DrawerResult } from "../api/billing";
import { errorMessage } from "../api/errors";
import { toast } from "@/components/toast";

/**
 * بعد أي تحصيل/عربون/استرجاع: نجلب حمولة الإيصال من السيرفر ونرسلها مع توكن الدرج للوكيل المحلي (العقد 9 و16).
 * فشل الطباعة لا يلغي العملية (حُفظت في السيرفر)، ويمكن إعادة الطباعة كنسخة مكررة.
 */
export async function printReceipt(r: DrawerResult): Promise<boolean> {
  if (!r.receipt) return false;
  try {
    const payload = await billingApi.printPayload(r.receipt.print_payload_url);
    await hardwareAgent.printReceipt({ print_payload: payload as unknown as Record<string, unknown>, drawer_token: r.drawer_token, open_drawer: r.open_drawer });
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
  return r.copy_number;
}

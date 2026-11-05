import { isNetworkError } from "../api/errors";
import type { OutboxType } from "../offline/db";
import { enqueue } from "../offline/outbox";

export type ActionOutcome<T> = { mode: "online"; data: T } | { mode: "offline" };

/**
 * عملية مسموحة أوفلاين (العقد 17): تُرسل مباشرة، وإن لم يوجد اتصال تُحفظ في الصندوق الصادر بنفس الجسم.
 * المعرفات تُولد في الواجهة قبل الاستدعاء حتى يكون الإرسال المزدوج آمناً.
 */
export async function onlineOrQueue<T>(online: () => Promise<T>, op: { type: OutboxType; payload: Record<string, unknown>; label: string }): Promise<ActionOutcome<T>> {
  if (typeof navigator !== "undefined" && !navigator.onLine) { await enqueue(op.type, op.payload, op.label); return { mode: "offline" }; }
  try { return { mode: "online", data: await online() }; }
  catch (e) {
    if (!isNetworkError(e)) throw e;
    await enqueue(op.type, op.payload, op.label);
    return { mode: "offline" };
  }
}

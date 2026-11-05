import { staffApi } from "../api/staff";
import { isApiError } from "../api/errors";
import { DEVICE_CODE } from "../config";
import { uuidv7 } from "../id";
import { db, type OutboxOp, type OutboxType } from "./db";

const BATCH = 500;
let flushing: Promise<FlushResult> | null = null;

export interface FlushResult { sent: number; applied: number; needsReview: number; skipped?: "offline" | "no_device" | "empty" | "busy" | "error" }

/** نضيف عملية للصندوق الصادر. المعرفات المولدة محلياً تُمرر داخل payload. */
export async function enqueue(type: OutboxType, payload: Record<string, unknown>, label?: string): Promise<OutboxOp> {
  const op: OutboxOp = { op_id: uuidv7(), type, occurred_at: new Date().toISOString(), payload, status: "pending", attempts: 0, label, error: null, created_at: Date.now() };
  await db().outbox.add(op);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("rahma:outbox"));
  return op;
}

/** إرسال العمليات المعلقة بالترتيب الزمني عبر POST /sync/batch. إعادة الإرسال آمنة (idempotent بـ op_id). */
export function flushOutbox(): Promise<FlushResult> {
  if (flushing) return flushing;
  flushing = run().finally(() => { flushing = null; });
  return flushing;
}

async function run(): Promise<FlushResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { sent: 0, applied: 0, needsReview: 0, skipped: "offline" };
  if (!DEVICE_CODE) return { sent: 0, applied: 0, needsReview: 0, skipped: "no_device" };
  const d = db();
  // عمليات علقت في sending (إغلاق المتصفح أثناء الإرسال) تعود pending؛ الإرسال مجدداً آمن
  await d.outbox.where("status").equals("sending").modify({ status: "pending" });
  let sent = 0, applied = 0, review = 0;
  for (;;) {
    const ops = (await d.outbox.where("status").equals("pending").sortBy("occurred_at")).slice(0, BATCH);
    if (!ops.length) return { sent, applied, needsReview: review, skipped: sent ? undefined : "empty" };
    await d.outbox.bulkPut(ops.map((o) => ({ ...o, status: "sending" as const, attempts: o.attempts + 1 })));
    try {
      const res = await staffApi.post<{ results: Array<{ op_id: string; status: "applied" | "duplicate" | "conflict" | "rejected"; server_refs?: Record<string, unknown>; error?: any; detail?: string }>; server_time: string }>(
        "/sync/batch",
        { device_id: DEVICE_CODE, operations: ops.map((o) => ({ op_id: o.op_id, type: o.type, occurred_at: o.occurred_at, payload: o.payload })) },
        { idempotencyKey: false },
      );
      sent += ops.length;
      for (const r of res.results) {
        if (r.status === "applied" || r.status === "duplicate") {
          applied++;
          await d.outbox.delete(r.op_id);
        } else {
          review++;
          await d.outbox.update(r.op_id, { status: "needs_review", error: { status: r.status, code: r.error?.code, title: r.error?.title, detail: r.error?.detail ?? r.detail } });
        }
      }
      // أي عملية لم يرد لها نتيجة تعود pending
      const answered = new Set(res.results.map((r) => r.op_id));
      await d.outbox.bulkPut(ops.filter((o) => !answered.has(o.op_id)).map((o) => ({ ...o, status: "pending" as const })));
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("rahma:synced", { detail: res }));
    } catch (e) {
      await d.outbox.where("op_id").anyOf(ops.map((o) => o.op_id)).modify({ status: "pending" });
      return { sent, applied, needsReview: review, skipped: isApiError(e) && e.isNetwork ? "offline" : "error" };
    }
  }
}

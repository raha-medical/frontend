import Dexie, { type Table } from "dexie";
import { staffStore } from "../api/staff";

/** صندوق صادر (Outbox) — العقد 17. */
export type OutboxType =
  | "patient.create" | "patient.update"
  | "queue.check_in" | "queue.call" | "queue.start" | "queue.complete" | "queue.no_show" | "queue.emergency" | "queue.late_arrival"
  | "payment.create" | "shift.open" | "shift.close" | "agent_event";

export interface OutboxOp {
  op_id: string;
  type: OutboxType;
  occurred_at: string; // ISO UTC
  payload: Record<string, unknown>;
  /** pending = بانتظار الإرسال | sending | needs_review = conflict/rejected يحتاج مراجعة الموظف */
  status: "pending" | "sending" | "needs_review";
  attempts: number;
  /** وصف عربي للعرض في قائمة «عمليات تحتاج مراجعة» */
  label?: string;
  error?: { status: "conflict" | "rejected"; code?: string; title?: string; detail?: string } | null;
  server_refs?: Record<string, unknown> | null;
  created_at: number;
}

export interface KV { key: string; value: unknown }

/** نسخة محلية من GET /sync/snapshot (العقد 17). */
export class RahmaDB extends Dexie {
  outbox!: Table<OutboxOp, string>;
  kv!: Table<KV, string>;
  services!: Table<Record<string, any>, string>;
  doctors!: Table<Record<string, any>, string>;
  sessions!: Table<Record<string, any>, string>;
  tickets!: Table<Record<string, any>, string>;
  queues!: Table<Record<string, any>, string>;
  patients!: Table<Record<string, any>, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      outbox: "op_id, status, occurred_at, created_at",
      kv: "key",
      services: "service_id",
      doctors: "doctor_id",
      sessions: "session_id, doctor_id",
      tickets: "ticket_id, doctor_id",
      queues: "doctor_id",
      patients: "patient_id, file_number, phone_number",
    });
  }
}

const databases = new Map<string, RahmaDB>();
export const db = (): RahmaDB => {
  const user = staffStore.get()?.user;
  // عزل اللقطة والصادر حسب الموظف والفرع يمنع إرسال عمليات حساب بتوكن حساب آخر.
  // قاعدة rahma القديمة تبقى محفوظة ولا نرسل عملياتها غير المنسوبة تلقائياً.
  const name = user ? `rahma.staff.${user.user_id}.${user.branch_id}` : "rahma.staff.anonymous";
  let database = databases.get(name);
  if (!database) { database = new RahmaDB(name); databases.set(name, database); }
  return database;
};

export const kvGet = async <T,>(key: string): Promise<T | undefined> => (await db().kv.get(key))?.value as T | undefined;
export const kvSet = (key: string, value: unknown) => db().kv.put({ key, value });

/** عند الخروج نحذف بيانات المرضى المخزنة، ونُبقي الصندوق الصادر حتى لا نفقد عمليات لم تُرسل. */
export async function clearSnapshot(d = db()) {
  await Promise.all([d.services.clear(), d.doctors.clear(), d.sessions.clear(), d.tickets.clear(), d.queues.clear(), d.patients.clear(), d.kv.where("key").startsWith("snapshot.").delete()]);
}

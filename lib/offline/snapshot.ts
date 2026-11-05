import { staffApi } from "../api/staff";
import { DEVICE_CODE } from "../config";
import { db, kvGet, kvSet } from "./db";

/** GET /sync/snapshot (العقد 17): بيانات اليوم للعمل أوفلاين. since يحدّث المرضى تزايدياً فقط. */
export async function refreshSnapshot(): Promise<{ ok: boolean; server_time?: string }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false };
  const since = await kvGet<string>("snapshot.server_time");
  const r = await staffApi.get<{
    services: any[]; doctors: any[]; sessions: any[]; tickets: any[]; queues: any[]; patients: any[]; receipt_block: unknown; server_time: string;
  }>("/sync/snapshot", { since, device_id: DEVICE_CODE ?? undefined });
  const d = db();
  await d.transaction("rw", [d.services, d.doctors, d.sessions, d.tickets, d.queues, d.patients, d.kv], async () => {
    await Promise.all([d.services.clear(), d.doctors.clear(), d.sessions.clear(), d.tickets.clear(), d.queues.clear()]);
    await d.services.bulkPut(r.services ?? []);
    await d.doctors.bulkPut(r.doctors ?? []);
    await d.sessions.bulkPut(r.sessions ?? []);
    await d.tickets.bulkPut(r.tickets ?? []);
    await d.queues.bulkPut((r.queues ?? []).filter((q) => q && q.doctor_id));
    await d.patients.bulkPut(r.patients ?? []);
    await kvSet("snapshot.server_time", r.server_time);
    await kvSet("snapshot.receipt_block", r.receipt_block ?? null);
    await kvSet("snapshot.at", Date.now());
  });
  return { ok: true, server_time: r.server_time };
}

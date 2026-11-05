"use client";
/** مركز إشعارات كل موظف (5.2): مقروء وغير مقروء، الحرج مميز، والهادئ لا يقاطع. مدير الفرع يرى إشعارات فرعه وحالة النسخ. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Badge, Button, Card, CellStack, DataGrid, Empty, Segmented, Spinner } from "@/components/ui";
import { errorMessage } from "@/lib/api/errors";
import { staffApi } from "@/lib/api/staff";
import { useAuth } from "@/lib/auth/store";
import { fmtDateTime } from "@/lib/format";
import { useLive } from "@/lib/realtime/provider";
import { hasPerm } from "@/lib/roles";

type Notif = { notification_id: string; type: string; title: string; message: string; priority?: string; is_read: boolean; created_at: string };
type List = { items: Notif[]; unread_count: number; total: number };
const KEY = ["me", "notifications"];

function useNotifications() {
  const { live } = useLive();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: () => staffApi.get<List>("/me/notifications", { page_size: 50 }), refetchInterval: 120_000 });
  useEffect(() => {
    if (!live) return;
    const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
    const onNew = (n: Notif) => { refresh(); if (n?.priority === "high") toast.error(`${n.title}: ${n.message}`); };
    const offs = [live.on("notification.created", onNew as (p: unknown) => void), live.onReconnected(refresh)];
    return () => offs.forEach((f) => f());
  }, [live, qc]);
  return q;
}

/** الجرس في رأس الشاشة، وشريط أحمر ثابت ما دامت هناك نتيجة حرجة غير مقروءة. */
export function NotificationBell() {
  const q = useNotifications();
  const n = q.data?.unread_count ?? 0;
  return (
    <Link href="/staff/notifications" aria-label={n ? `الإشعارات، ${n} غير مقروءة` : "الإشعارات"} className="relative grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface/60 text-ink hover:bg-primary-soft hover:text-ink">
      <Icon name="bell" size={19} />
      {n > 0 && <span className="num absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-on-accent">{n > 99 ? "99+" : n}</span>}
    </Link>
  );
}

export function CriticalBanner() {
  const q = useNotifications();
  const items = (q.data?.items ?? []).filter((n) => n.priority === "high" && !n.is_read);
  if (!items.length) return null;
  return (
    <Link href="/staff/notifications" role="alert" className="mx-2 mt-2 flex items-center gap-2.5 rounded-xl bg-danger px-4 py-2.5 text-sm font-bold text-on-accent hover:text-on-accent sm:mx-4 sm:px-6">
      <Icon name="siren" size={18} /><span className="flex-1 truncate">{items[0].title}: {items[0].message}</span>{items.length > 1 && <span className="num">+{items.length - 1}</span>}
    </Link>
  );
}

const iconOf = (t: string) => (t.includes("critical") ? "siren" : t.startsWith("lab") ? "flask-conical" : t.startsWith("radiology") ? "scan-line" : t.startsWith("referral") ? "inbox" : t.startsWith("queue") ? "users" : t.startsWith("shift") || t.startsWith("refund") ? "banknote" : "bell");

function MyList() {
  const q = useNotifications();
  const qc = useQueryClient();
  const [unread, setUnread] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
  const read = async (id: string) => { try { await staffApi.post(`/me/notifications/${id}/read`, undefined, { idempotencyKey: false }); refresh(); } catch (e) { toast.error(errorMessage(e)); } };
  const markAll = async () => { try { await staffApi.post("/me/notifications/read-all", undefined, { idempotencyKey: false }); refresh(); } catch (e) { toast.error(errorMessage(e)); } };
  if (q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="danger">{errorMessage(q.error)}</Alert>;
  const items = q.data.items.filter((n) => !unread || !n.is_read);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={unread ? "unread" : "all"} onChange={(v) => setUnread(v === "unread")} options={[{ value: "all", label: "الكل" }, { value: "unread", label: `غير المقروءة (${q.data.unread_count})` }]} />
        {q.data.unread_count > 0 && <Button size="md" variant="ghost" icon="check-check" onClick={markAll}>تعليم الكل كمقروء</Button>}
      </div>
      {!items.length ? <Empty icon="bell" title="لا توجد إشعارات" /> : items.map((n) => {
        const high = n.priority === "high";
        return (
          <button key={n.notification_id} onClick={() => { if (!n.is_read) void read(n.notification_id); }} className={`flex items-center gap-3 rounded-2xl border p-3 text-start ${high ? (n.is_read ? "border-danger/40 bg-surface" : "border-2 border-danger bg-danger-soft") : n.is_read ? "border-line bg-surface" : "border-primary/40 bg-primary-soft/40"}`}>
            <span className={`grid size-10 shrink-0 place-items-center rounded-xl bg-bg ${high ? "text-danger" : "text-primary"}`}><Icon name={iconOf(n.type)} size={19} /></span>
            <span className="flex min-w-0 flex-1 flex-col"><span className="flex items-center gap-1.5 text-sm font-bold">{n.title}{high && <Badge tone="danger" variant="solid">حرج</Badge>}{!n.is_read && <span className="size-2 rounded-full bg-primary" aria-label="غير مقروء" />}</span><span className="sub-sm">{n.message}</span></span>
            <span className="num shrink-0 text-xs text-ink-muted">{fmtDateTime(n.created_at)}</span>
          </button>
        );
      })}
    </div>
  );
}

type BranchRow = { type: string; title: string; message: string; recipients: number; created_at: string };

function BranchFeed() {
  const q = useQuery({ queryKey: ["branch", "notifications"], queryFn: () => staffApi.get<{ items: BranchRow[] }>("/branch/notifications", { page_size: 50 }) });
  const b = useQuery({ queryKey: ["branch", "backup"], queryFn: () => staffApi.get<{ healthy: boolean; enabled: boolean; last_success_at: string | null; note_ar: string }>("/branch/backup-status") });
  return (
    <div className="flex flex-col gap-3">
      {b.data && <Card className="flex items-center gap-3 p-4"><Icon name="database-backup" size={20} className="text-primary" /><span className="flex flex-1 flex-col"><span className="text-sm font-bold">النسخ الاحتياطي: {b.data.healthy ? "سليم" : "يحتاج متابعة"}</span><span className="sub-sm">{b.data.last_success_at ? `آخر نسخة ${fmtDateTime(b.data.last_success_at)}. ` : "لا توجد نسخة مسجلة. "}{b.data.note_ar}</span></span></Card>}
      <DataGrid<BranchRow> aria-label="إشعارات الفرع" rows={q.data?.items} loading={q.isPending} error={q.isError ? errorMessage(q.error) : undefined} rowKey={(r) => `${r.type}${r.created_at}${r.message}`}
        empty={{ icon: "bell", title: "لا توجد إشعارات تشغيلية" }}
        columns={[
          { key: "title", header: "الإشعار", cell: (r) => <CellStack title={r.title} sub={r.message} /> },
          { key: "recipients", header: "المستلمون", numeric: true, cell: (r) => r.recipients },
          { key: "created_at", header: "الوقت", cell: (r) => <span className="num text-xs">{fmtDateTime(r.created_at)}</span> },
        ]} />
    </div>
  );
}

export function NotificationCenter() {
  const user = useAuth((s) => s.user);
  const canBranch = hasPerm(user, "notifications.branch_view");
  const [tab, setTab] = useState<"mine" | "branch">("mine");
  return (
    <div className="flex flex-col gap-3">
      {canBranch && <Segmented value={tab} onChange={setTab} options={[{ value: "mine", label: "إشعاراتي", icon: "bell" }, { value: "branch", label: "إشعارات الفرع", icon: "building-2" }]} />}
      {tab === "mine" ? <MyList /> : <BranchFeed />}
    </div>
  );
}

"use client";
/** بطاقة «استخدام المساعد» للمدير العام (GET /admin/assistant/stats): أرقام يومية فقط، بلا أي نص من المحادثات.
 *  التشغيل والحد اليومي يُضبطان من الإعدادات العامة (assistant.enabled و assistant.daily_limit). */
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { Alert, Badge, Spinner } from "@/components/ui";
import { staffApi } from "@/lib/api/staff";
import { errorMessage } from "@/lib/api/errors";
import { fmtNum, fmtWeekdayDate } from "@/lib/format";
import { Panel } from "./kit";

type Errors = { rate_limited: number; server: number; auth: number; timeout: number; network: number; other: number };
type Day = { date: string; messages: number; patients: number; emergencies: number; refusals: number; limit_hits: number; proposals: number;
  confirmed_bookings: number; errors: Errors; avg_latency_ms: number | null; max_latency_ms: number };
type AssistantStats = { from: string; to: string; enabled: boolean; daily_limit: number; provider: string; model: string | null; totals: Day; days: Day[] };

const errorsOf = (e: Errors) => e.rate_limited + e.server + e.auth + e.timeout + e.network + e.other;
const ms = (n: number | null) => (n == null ? "—" : n >= 1000 ? `${(n / 1000).toFixed(1)} ث` : `${fmtNum(n)} م.ث`);

export function AssistantUsageCard({ from, to }: { from: string; to: string }) {
  const q = useQuery({ queryKey: ["admin", "assistant-stats", from, to], queryFn: () => staffApi.get<AssistantStats>("/admin/assistant/stats", { from, to }), refetchInterval: 120_000 });
  const s = q.data;
  return (
    <Panel title="استخدام المساعد الذكي" icon="sparkles" actions={<Link href="/staff/admin/settings" className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-primary-strong"><Icon name="settings-2" size={16} />التشغيل والحد اليومي</Link>}>
      {q.isError ? <Alert tone="danger">{errorMessage(q.error)}</Alert> : !s ? <Spinner /> : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={s.enabled ? "success" : "muted"} icon={s.enabled ? "circle-check" : "power-off"}>{s.enabled ? "مفعّل" : "موقوف"}</Badge>
            <Badge tone={s.provider === "gemini" ? "primary" : "warn"}>{s.provider === "gemini" ? `Gemini${s.model ? ` · ${s.model}` : ""}` : "وضع تجريبي"}</Badge>
            <span className="sub-sm">الحد اليومي لكل مراجع <span className="num">{fmtNum(s.daily_limit)}</span> رسالة</span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {([
              ["الرسائل", s.totals.messages], ["مراجعون (مجموع الأيام)", s.totals.patients], ["طوارئ", s.totals.emergencies], ["رفض", s.totals.refusals],
              ["اقتراحات حجز", s.totals.proposals], ["حجوزات مؤكدة منها", s.totals.confirmed_bookings], ["تجاوز الحد", s.totals.limit_hits], ["أخطاء المزود", errorsOf(s.totals.errors)],
            ] as const).map(([l, v]) => (
              <div key={l} className="flex flex-col rounded-xl bg-bg px-3 py-2"><span className="sub-sm">{l}</span><span className="num text-lg font-bold">{fmtNum(v)}</span></div>
            ))}
          </div>
          <span className="sub-sm">متوسط زمن الرد {ms(s.totals.avg_latency_ms)} · أطول رد {ms(s.totals.max_latency_ms)}{errorsOf(s.totals.errors) > 0 && <> · الأخطاء: 429 <span className="num">{s.totals.errors.rate_limited}</span>، 5xx <span className="num">{s.totals.errors.server}</span>، مفتاح/طلب <span className="num">{s.totals.errors.auth}</span>، مهلة <span className="num">{s.totals.errors.timeout}</span>، شبكة <span className="num">{s.totals.errors.network}</span></>}</span>
          {s.days.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="text-ink-3">{["اليوم", "رسائل", "مراجعون", "طوارئ", "رفض", "اقتراحات", "مؤكدة", "أخطاء", "متوسط الرد"].map((h) => <th key={h} className="px-2 py-1.5 text-start font-semibold">{h}</th>)}</tr></thead>
                <tbody>{s.days.map((d) => (
                  <tr key={d.date} className="border-t border-line">
                    <td className="px-2 py-1.5">{fmtWeekdayDate(d.date)}</td>
                    {[d.messages, d.patients, d.emergencies, d.refusals, d.proposals, d.confirmed_bookings, errorsOf(d.errors)].map((v, i) => <td key={i} className="num px-2 py-1.5">{fmtNum(v)}</td>)}
                    <td className="px-2 py-1.5">{ms(d.avg_latency_ms)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

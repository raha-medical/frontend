"use client";
/** صورة النتيجة الخارجية (1.2-ج3، الجلسة 4): يرفعها الاستقبال على دور المراجع، ويراها الطبيب في المعاينة. */
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Card } from "@/components/ui";
import { filesApi } from "@/lib/api/clinical";
import { patientFilesApi } from "@/lib/api/session4";
import { errorMessage } from "@/lib/api/errors";
import { fmtDateTime } from "@/lib/format";

export function ExternalResultUpload({ ticketId }: { ticketId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  return (
    <>
      <input ref={input} type="file" accept="image/jpeg,image/png,application/pdf" hidden onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        setBusy(true);
        try { await filesApi.upload(f, "external_result", { ticket_id: ticketId }); toast.success("رُفعت صورة النتيجة، ويراها الطبيب في المعاينة"); void qc.invalidateQueries({ queryKey: ["external-results", ticketId] }); }
        catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
      }} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()}
        className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line-strong px-3 text-[13px] font-semibold text-ink-2 hover:border-primary/50 disabled:opacity-60">
        <Icon name={busy ? "loader-circle" : "image-plus"} size={16} className={busy ? "animate-spin" : ""} />رفع صورة نتيجة خارجية
      </button>
    </>
  );
}

/** للطبيب: صور النتائج الخارجية لهذا الدور (والدور الأصلي إن كان عودة). */
export function ExternalResultsList({ ticketId }: { ticketId: string }) {
  const q = useQuery({ queryKey: ["external-results", ticketId], queryFn: () => patientFilesApi.list({ ticket_id: ticketId, purpose: "external_result" }), refetchInterval: 30_000 });
  const items = q.data?.items ?? [];
  if (!items.length) return null;
  return (
    <Card className="flex flex-col gap-2 p-4">
      <span className="flex items-center gap-1.5 font-bold"><Icon name="images" size={17} className="text-primary" />نتائج خارجية</span>
      {items.map((f) => (
        <a key={f.file_id} href={f.download_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
          <Icon name={f.content_type === "application/pdf" ? "file-text" : "image"} size={15} />
          <span className="flex-1 truncate">{f.file_name}</span><span className="num sub-sm">{fmtDateTime(f.created_at)}</span>
        </a>
      ))}
    </Card>
  );
}

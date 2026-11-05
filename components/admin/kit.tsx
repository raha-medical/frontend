"use client";
/** عناصر مشتركة لواجهات الإدارة (Admin.dc.html). */
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { Badge, ISelect } from "@/components/ui";
import { branchesApi } from "@/lib/api/admin";
import { useAuth } from "@/lib/auth/store";

/** شارة حالة — غلاف متوافق فوق Badge من components/ui. */
export function Pill({ tone, icon, children }: { tone: "success" | "warn" | "danger" | "info" | "muted" | "primary"; icon?: string; children: ReactNode }) {
  return <Badge tone={tone} icon={icon}>{children}</Badge>;
}

export function Panel({ title, icon, actions, children, className = "" }: { title?: ReactNode; icon?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass flex flex-col gap-3 rounded-card p-[18px] shadow-glass ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center gap-2.5">
          {icon && <Icon name={icon} size={19} className="text-primary" />}
          <span className="flex-1 text-base font-bold">{title}</span>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** قائمة اختيار مفردة — غلاف متوافق فوق ISelect (قابلة للبحث، لوحة المفاتيح، RTL).
 *  placeholder (حتى لو "") يضيف خياراً فارغاً كما كان في <select> الأصلي، فيبقى السلوك كما هو. */
export function Select<T extends string>({ label, value, onChange, options, placeholder }: { label?: string; value: T | ""; onChange: (v: T) => void; options: { value: T; label: string }[]; placeholder?: string }) {
  const opts = placeholder !== undefined ? [{ value: "" as T, label: placeholder || "—" }, ...options] : options;
  return <ISelect<T> label={label} value={value} onChange={(v) => onChange(v as T)} options={opts} placeholder={placeholder || "اختر…"} />;
}

/** الفرع الذي تعمل عليه شاشات الإدارة (الافتراضي فرع التوكن). */
export function useBranches() {
  return useQuery({ queryKey: ["branches", "mine"], queryFn: branchesApi.list, staleTime: 60_000 });
}
export function BranchSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const b = useBranches();
  const user = useAuth((s) => s.user);
  const items = (b.data?.items ?? []).filter((x) => user?.role === "admin" || user?.branch_ids.includes(x.branch_id));
  if (items.length < 2) return null;
  return <div className="w-full max-w-[260px]"><Select value={value} onChange={onChange} options={items.map((x) => ({ value: x.branch_id, label: x.name }))} /></div>;
}

export const DEPT_AR: Record<string, { label: string; icon: string; cls: string }> = {
  clinic: { label: "عيادة طبيب", icon: "stethoscope", cls: "bg-primary-soft text-primary-strong" },
  lab: { label: "مختبر", icon: "flask-conical", cls: "bg-lab-soft text-lab" },
  radiology: { label: "أشعة وسونار", icon: "scan-line", cls: "bg-info-soft text-info" },
  pharmacy: { label: "صيدلية", icon: "pill", cls: "bg-pharm-soft text-pharm" },
};

export const ROLE_AR: Record<string, { label: string; icon: string }> = {
  admin: { label: "مدير عام", icon: "shield-check" }, branch_manager: { label: "مدير فرع", icon: "building-2" }, doctor: { label: "طبيب", icon: "stethoscope" },
  receptionist: { label: "استقبال", icon: "concierge-bell" }, accountant: { label: "محاسب", icon: "calculator" }, lab_tech: { label: "فني مختبر", icon: "microscope" },
  radiologist: { label: "أخصائي أشعة", icon: "scan-line" }, pharmacist: { label: "صيدلي", icon: "pill" },
};

/** مربع حوار لعرض كلمة مرور مؤقتة مرة واحدة. */
export function SecretBox({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-warn bg-warn-soft p-3">
      <span className="flex items-center gap-1.5 text-xs font-semibold text-warn-strong"><Icon name="eye" size={13} />{label} · يظهر مرة واحدة فقط</span>
      <div className="flex items-center gap-2">
        {/* break-all: المفاتيح الطويلة كانت تخرج خارج الصندوق */}
        <span className="num min-w-0 flex-1 select-all break-all text-[15px] font-bold leading-6" dir="ltr">{value}</span>
        <button onClick={() => navigator.clipboard?.writeText(value)} aria-label="نسخ" className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-surface"><Icon name="copy" size={16} /></button>
      </div>
      {link && (
        <div className="flex items-center gap-2 border-t border-warn/30 pt-2">
          <a href={link} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-semibold text-primary-strong hover:underline"><Icon name="external-link" size={13} className="shrink-0" /><span className="num truncate" dir="ltr">{link}</span></a>
          <button onClick={() => navigator.clipboard?.writeText(link)} aria-label="نسخ الرابط" className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-surface"><Icon name="link" size={14} /></button>
        </div>
      )}
    </div>
  );
}

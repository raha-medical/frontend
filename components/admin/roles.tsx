"use client";
/** الأدوار والصلاحيات (المواصفة 2.1، العقد 2.1): قائمة الأدوار، وإضافة/تعديل دور بمصفوفة صلاحيات من الكتالوج. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Badge, Button, Card, CellStack, DataGrid, Field, ISelect, Modal, Spinner, controlCls, type Column } from "@/components/ui";
import { rolesApi, type CatalogPermission, type PermissionCatalog, type Role, type RoleInput } from "@/lib/api/admin";
import type { NavSection } from "@/lib/api/types";
import { errorMessage, fieldErrors, isApiError } from "@/lib/api/errors";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { useAuth } from "@/lib/auth/store";
import { SECTION_META, deriveSections, hasPerm } from "@/lib/roles";

/** رسائل أخطاء الأدوار بالعربية (الملحق أ). */
export function roleError(e: unknown): string {
  if (!isApiError(e)) return errorMessage(e);
  const n = Number(e.extra?.users_count ?? NaN);
  switch (e.code) {
    case "ROLE_IN_USE": return `الدور مسند لموظفين${Number.isFinite(n) ? ` (${fmtNum(n)})` : ""}. انقل الموظفين لدور آخر من شاشة المستخدمين أولاً.`;
    case "ROLE_IS_SYSTEM": return "أدوار النظام لا تُحذف ولا تُوقف ولا يتغير رمزها.";
    case "ROLE_LOCKED": return "صلاحيات المدير العام ثابتة ولا يمكن تعديلها.";
    case "DUPLICATE_ROLE": return "يوجد دور بنفس الرمز أو الاسم. اختر رمزاً أو اسماً آخر.";
    case "ROLE_NOT_FOUND": return "الدور غير موجود، ربما حُذف للتو.";
    case "FORBIDDEN": return "إدارة الأدوار للمدير العام فقط.";
    default: return errorMessage(e);
  }
}

export const sectionLabel = (s: string | null | undefined) => (s ? SECTION_META[s as NavSection]?.label ?? s : "—");

// ------------------------------------------------------------------ قائمة الأدوار
export function RolesScreen() {
  const me = useAuth((s) => s.user)!;
  const router = useRouter();
  const canCreate = hasPerm(me, "roles.create");
  const [kind, setKind] = useState<"" | "system" | "custom">("");
  const [state, setState] = useState<"" | "active" | "inactive">("");
  const [del, setDel] = useState<Role | null>(null);
  const q = useQuery({ queryKey: ["roles", "all"], queryFn: () => rolesApi.list(true) });
  const rows = (q.data?.items ?? []).filter((r) => (!kind || (kind === "system") === r.is_system) && (!state || (state === "active") === r.is_active));

  const columns: Column<Role>[] = [
    { key: "name_ar", header: "الدور", sortable: true, value: (r) => `${r.name_ar} ${r.code} ${r.description ?? ""}`,
      cell: (r) => <CellStack title={<span title={r.description ?? undefined}>{r.name_ar}</span>} sub={<span className="num" dir="ltr">{r.code}</span>} icon={<span className={`grid size-9 shrink-0 place-items-center rounded-full ${r.is_system ? "bg-primary-soft text-primary-strong" : "bg-info-soft text-info-strong"}`}><Icon name={r.is_system ? "shield-check" : "shield-plus"} size={17} /></span>} /> },
    { key: "is_system", header: "النوع", width: "130px", value: (r) => (r.is_system ? "نظام" : "مخصص"),
      cell: (r) => <span className="flex flex-wrap gap-1">{r.is_system ? <Badge tone="primary" icon="shield-check">نظام</Badge> : <Badge tone="info" icon="shield-plus">مخصص</Badge>}{r.is_locked && <Badge tone="muted" icon="lock" title="صلاحيات ثابتة">مقفل</Badge>}{!r.is_active && <Badge tone="muted" dot>موقوف</Badge>}</span> },
    { key: "users", header: "الموظفون", width: "90px", numeric: true, sortable: true, value: (r) => r.user_count,
      cell: (r) => <span title={`${fmtNum(r.active_user_count)} فعال من ${fmtNum(r.user_count)}`}>{fmtNum(r.active_user_count)}<span className="text-ink-muted"> / {fmtNum(r.user_count)}</span></span> },
    { key: "home_section", header: "قسم البداية", width: "150px", value: (r) => sectionLabel(r.home_section),
      cell: (r) => r.home_section ? <span className="flex items-center gap-1.5 whitespace-nowrap text-[13px]"><Icon name={SECTION_META[r.home_section]?.icon ?? "layout-grid"} size={15} className="text-primary" />{sectionLabel(r.home_section)}</span> : <span className="text-[13px] text-ink-muted">بلا شاشات</span> },
    { key: "actions", header: <span className="sr-only">إجراءات</span>, width: "90px", sticky: true, cell: (r) => (
      <span className="flex gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Link href={`/staff/admin/roles/${encodeURIComponent(r.code)}`} title="تعديل" aria-label={`تعديل ${r.name_ar}`} className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-bg"><Icon name="pencil" size={16} /></Link>
        {!r.is_system && hasPerm(me, "roles.delete") && (
          <button type="button" onClick={() => setDel(r)} disabled={r.user_count > 0} title={r.user_count > 0 ? "الدور مسند لموظفين: انقلهم أولاً" : "حذف الدور"} aria-label={`حذف ${r.name_ar}`}
            className="grid size-8 place-items-center rounded-full text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-35"><Icon name="trash-2" size={16} /></button>
        )}
      </span>
    ) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <DataGrid<Role> aria-label="الأدوار" rows={q.data ? rows : undefined} loading={q.isPending} error={q.isError ? roleError(q.error) : undefined}
        rowKey={(r) => r.code} columns={columns} minWidth={620} pageSize={0}
        onRowClick={(r) => router.push(`/staff/admin/roles/${encodeURIComponent(r.code)}`)}
        search={{ placeholder: "ابحث باسم الدور أو رمزه" }}
        filters={<>
          <div className="w-full min-w-[150px] sm:w-[170px]"><ISelect placeholder="كل الأنواع" size="md" aria-label="نوع الدور" value={kind} onChange={(v) => setKind(v as typeof kind)} searchable={false}
            options={[{ value: "", label: "كل الأنواع" }, { value: "system", label: "أدوار النظام", icon: "shield-check" }, { value: "custom", label: "أدوار مخصصة", icon: "shield-plus" }]} /></div>
          <div className="w-full min-w-[140px] sm:w-[150px]"><ISelect placeholder="كل الحالات" size="md" aria-label="حالة الدور" value={state} onChange={(v) => setState(v as typeof state)} searchable={false}
            options={[{ value: "", label: "كل الحالات" }, { value: "active", label: "فعال" }, { value: "inactive", label: "موقوف" }]} /></div>
        </>}
        actions={canCreate && <Link href="/staff/admin/roles/new" className="inline-flex h-[42px] items-center gap-2 rounded-control bg-primary px-5 text-sm font-semibold text-on-accent hover:bg-primary-strong"><Icon name="plus" size={18} />دور جديد</Link>}
        empty={{ icon: "key-round", title: "لا توجد أدوار مطابقة" }} />
      <Alert tone="info" icon="info">أدوار النظام الثمانية لا تُحذف ولا يتغير رمزها، ويمكن تعديل اسمها ووصفها وصلاحياتها (عدا المدير العام). الدور المخصص يُحذف فقط إذا لم يكن مسنداً لأي موظف.</Alert>
      <DeleteRole role={del} onClose={() => setDel(null)} />
    </div>
  );
}

function DeleteRole({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const close = () => { setErr(null); onClose(); };
  return (
    <Modal open={!!role} onClose={close} title={`حذف الدور ${role?.name_ar ?? ""}`} icon="trash-2"
      footer={<>
        <Button size="md" variant="danger" icon="trash-2" loading={busy} onClick={async () => {
          if (!role) return;
          setBusy(true); setErr(null);
          try { await rolesApi.remove(role.code); toast.success("حُذف الدور"); void qc.invalidateQueries({ queryKey: ["roles"] }); close(); }
          catch (e) { setErr(roleError(e)); } finally { setBusy(false); }
        }}>حذف نهائي</Button>
        <Button size="md" variant="ghost" onClick={close}>إلغاء</Button>
      </>}>
      <p className="text-body">سيُحذف الدور <b>{role?.name_ar}</b> (<span className="num" dir="ltr">{role?.code}</span>) نهائياً. لا يمكن التراجع.</p>
      {err && <Alert tone="danger">{err}</Alert>}
    </Modal>
  );
}

// ------------------------------------------------------------------ إضافة / تعديل دور
const CODE_RE = /^[a-z][a-z0-9_]{2,29}$/;
const COLS: CatalogPermission["action"][] = ["view", "create", "edit", "delete", "all", "special"];

export function RoleForm({ code }: { code: string | null }) {
  const me = useAuth((s) => s.user)!;
  const router = useRouter();
  const qc = useQueryClient();
  const role = useQuery({ queryKey: ["roles", "one", code], queryFn: () => rolesApi.get(code!), enabled: !!code });
  const cat = useQuery({ queryKey: ["permissions", "catalog"], queryFn: rolesApi.catalog, staleTime: 3_600_000 });
  if ((code && role.isPending) || cat.isPending) return <Spinner />;
  if (role.isError) return <Alert tone="danger">{roleError(role.error)}</Alert>;
  if (cat.isError) return <Alert tone="danger">{errorMessage(cat.error)}</Alert>;
  const r = role.data ?? null;
  const canWrite = hasPerm(me, r ? "roles.edit" : "roles.create");
  return <RoleEditor key={r?.updated_at ?? "new"} role={r} catalog={cat.data} readOnly={!canWrite}
    onSaved={(saved) => { void qc.invalidateQueries({ queryKey: ["roles"] }); if (!r) router.replace(`/staff/admin/roles/${encodeURIComponent(saved.code)}`); }} />;
}

function RoleEditor({ role, catalog, readOnly, onSaved }: { role: Role | null; catalog: PermissionCatalog; readOnly: boolean; onSaved: (r: Role) => void }) {
  const locked = !!role?.is_locked;
  const [f, setF] = useState({ code: role?.code ?? "", name_ar: role?.name_ar ?? "", description: role?.description ?? "", home_section: (role?.home_section ?? "") as NavSection | "", is_active: role?.is_active ?? true });
  const [sel, setSel] = useState<Set<string>>(() => new Set(locked ? catalog.sections.flatMap((s) => s.permissions.map((p) => p.code)) : role?.permissions ?? []));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const fe = fieldErrors(err);
  const byCode = useMemo(() => new Map(catalog.sections.flatMap((s) => s.permissions.map((p) => [p.code, p] as const))), [catalog]);
  // الرموز المتضمنة في رمز شامل محدد: تظهر محددة ومقفلة
  const implied = useMemo(() => { const x = new Set<string>(); for (const c of sel) for (const i of byCode.get(c)?.implies ?? []) x.add(i); return x; }, [sel, byCode]);
  const effective = useMemo(() => [...new Set([...sel, ...implied])], [sel, implied]);
  const sections = locked ? (role?.sections ?? []) : deriveSections(effective);
  const codeOk = !!role || CODE_RE.test(f.code);
  const editable = !readOnly && !locked;

  function toggle(p: CatalogPermission) {
    if (!editable || p.admin_only || implied.has(p.code)) return;
    setSel((s) => {
      const n = new Set(s);
      if (n.has(p.code)) {
        n.delete(p.code);
        // إلغاء رمز شامل: نبقي ما كان يتضمنه محدداً حتى يلغي المدير الخلايا التي لا يريدها (العقد 2.1)
        for (const i of p.implies) if (!byCode.get(i)?.admin_only) n.add(i);
      } else n.add(p.code);
      return n;
    });
  }
  function setRow(perms: CatalogPermission[], on: boolean) {
    if (!editable) return;
    setSel((s) => { const n = new Set(s); for (const p of perms) { if (p.admin_only) continue; if (on) n.add(p.code); else { n.delete(p.code); } } return n; });
  }

  async function save() {
    setBusy(true); setErr(null);
    // نرسل المحدد صراحة فقط (المتضمن في رمز شامل لا داعي لإرساله)
    const permissions = [...sel].filter((c) => !implied.has(c) && !byCode.get(c)?.admin_only);
    try {
      let saved: Role;
      if (role) {
        const body: RoleInput = { name_ar: f.name_ar.trim(), description: f.description.trim(), home_section: f.home_section || "" };
        if (!locked) body.permissions = permissions;
        if (!role.is_system && f.is_active !== role.is_active) body.is_active = f.is_active;
        saved = await rolesApi.update(role.code, body);
        toast.success("حُفظ الدور، ويسري فوراً على موظفيه");
      } else {
        saved = await rolesApi.create({ code: f.code.trim(), name_ar: f.name_ar.trim(), description: f.description.trim() || null, home_section: f.home_section || null, permissions });
        toast.success("أُنشئ الدور");
      }
      onSaved(saved);
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/staff/admin/roles" className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><Icon name="arrow-right" size={16} />كل الأدوار</Link>
        <span className="flex-1" />
        {role && (role.is_system ? <Badge tone="primary" icon="shield-check">دور نظام</Badge> : <Badge tone="info" icon="shield-plus">دور مخصص</Badge>)}
        {role && <Badge tone="muted" icon="users"><span className="num">{fmtNum(role.active_user_count)}</span> موظف فعال</Badge>}
      </div>
      {readOnly && <Alert tone="info" icon="eye">عرض فقط: تعديل الأدوار للمدير العام.</Alert>}
      {locked && <Alert tone="info" icon="lock">صلاحيات المدير العام ثابتة (كل الصلاحيات). يمكن تعديل الاسم والوصف فقط.</Alert>}

      <div className="flex flex-col gap-4 min-[1600px]:grid min-[1600px]:grid-cols-[360px_minmax(0,1fr)] min-[1600px]:items-start">
        <Card className="enter grid gap-3.5 p-5 lg:grid-cols-2 min-[1600px]:sticky min-[1600px]:top-24 min-[1600px]:grid-cols-1">
          <h2 className="flex items-center gap-2 text-base font-bold lg:col-span-2 min-[1600px]:col-span-1"><Icon name="id-card" size={18} className="text-primary" />بيانات الدور</h2>
          <Field label="اسم الدور" icon="shield-check" value={f.name_ar} maxLength={100} disabled={readOnly} onChange={(e) => setF({ ...f, name_ar: e.target.value })} error={fe.name_ar} placeholder="سكرتير مختبر" />
          <Field label="الرمز" icon="hash" ltr value={f.code} disabled={!!role || readOnly} maxLength={30}
            onChange={(e) => setF({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
            error={fe.code ?? (!role && f.code && !codeOk ? "حرف إنجليزي صغير أولاً، ثم حروف صغيرة أو أرقام أو _ (3 إلى 30)" : undefined)}
            hint={role ? "الرمز لا يتغير بعد الإنشاء" : "مثال: lab_secretary · لا يتغير بعد الإنشاء"} placeholder="lab_secretary" />
          <label className="flex flex-col gap-1.5">
            <span className="sub">الوصف (اختياري)</span>
            <textarea value={f.description} maxLength={500} rows={3} disabled={readOnly} onChange={(e) => setF({ ...f, description: e.target.value })}
              className={`${controlCls} h-auto py-2.5`} placeholder="ما الذي يفعله موظفو هذا الدور" />
          </label>
          <ISelect placeholder="تلقائي (أول قسم متاح)" label="قسم البداية بعد الدخول" value={f.home_section} disabled={readOnly} onChange={(v) => setF({ ...f, home_section: v as NavSection | "" })} searchable={false}
            options={[{ value: "", label: "تلقائي (أول قسم متاح)", icon: "sparkles" }, ...catalog.nav_sections.map((s) => ({
              value: s, label: SECTION_META[s]?.label ?? s, icon: SECTION_META[s]?.icon, disabled: !sections.includes(s), hint: sections.includes(s) ? undefined : "لا تفتحه الصلاحيات المحددة",
            }))]} hint="يُستخدم فقط إذا كان القسم ضمن ما تفتحه صلاحيات الدور" error={fe.home_section} />
          {role && !role.is_system && (
            <label className="flex items-center gap-2.5 rounded-xl bg-bg px-3 py-2.5 text-sm">
              <input type="checkbox" className="size-5 accent-primary" checked={f.is_active} disabled={readOnly} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
              <span className="flex-1 font-semibold">الدور فعال</span>
              {!f.is_active && <span className="sub-sm">الموقوف لا يُسند لموظف جديد</span>}
            </label>
          )}
          <div className="flex flex-col gap-1.5 rounded-xl bg-bg p-3">
            <span className="sub-sm flex items-center gap-1.5"><Icon name="layout-grid" size={14} />الأقسام التي يفتحها الدور</span>
            <span className="flex flex-wrap gap-1.5">
              {sections.length ? sections.map((s) => <Badge key={s} tone={s === (f.home_section || sections[0]) ? "primary" : "muted"} icon={SECTION_META[s]?.icon}>{SECTION_META[s]?.label ?? s}</Badge>)
                : <span className="text-[13px] text-warn-strong">لا شاشات: سيرى الموظف «لا توجد شاشات متاحة لدورك»</span>}
            </span>
            <span className="sub-sm"><span className="num">{fmtNum(effective.length)}</span> صلاحية فعلية</span>
          </div>
          {role && <span className="sub-sm">آخر تعديل <span className="num">{fmtDateTime(role.updated_at)}</span></span>}
          {err != null && <Alert tone="danger">{roleError(err)}</Alert>}
          {!readOnly && <Button onClick={save} loading={busy} icon={role ? "save" : "check"} disabled={!f.name_ar.trim() || !codeOk}>{role ? "حفظ الدور" : "إنشاء الدور"}</Button>}
        </Card>

        <PermissionMatrix catalog={catalog} sel={sel} implied={implied} editable={editable} onToggle={toggle} onRow={setRow} />
      </div>
    </div>
  );
}

/** مصفوفة الصلاحيات: صف لكل قسم، وعمود لكل إجراء (عرض/إضافة/تعديل/حذف/الكل/خاص). */
function PermissionMatrix({ catalog, sel, implied, editable, onToggle, onRow }: {
  catalog: PermissionCatalog; sel: Set<string>; implied: Set<string>; editable: boolean;
  onToggle: (p: CatalogPermission) => void; onRow: (perms: CatalogPermission[], on: boolean) => void;
}) {
  const head = (a: CatalogPermission["action"]) => catalog.actions.find((x) => x.code === a)?.name_ar ?? a;
  const box = (p: CatalogPermission, label?: boolean) => {
    const imp = implied.has(p.code);
    const checked = sel.has(p.code) || imp;
    const dis = !editable || p.admin_only || imp;
    const tip = p.admin_only ? "للمدير العام فقط: لا تُمنح لأي دور" : imp ? "متضمنة في صلاحية شاملة محددة. ألغِ الشاملة لتعديلها" : (p.description ?? p.name_ar);
    return (
      <label key={p.code} title={tip} className={`inline-flex items-center gap-2 rounded-chip px-1.5 py-1 ${dis ? "cursor-not-allowed" : "cursor-pointer hover:bg-primary-soft"} ${label ? "text-[13px]" : ""}`}>
        <input type="checkbox" className="size-[18px] accent-primary disabled:opacity-50" checked={checked} disabled={dis} onChange={() => onToggle(p)}
          aria-label={p.name_ar} />
        {label && <span className={dis && !checked ? "text-ink-muted" : ""}>{p.name_ar}</span>}
        {p.admin_only && <Icon name="lock" size={13} className="text-ink-muted" aria-hidden />}
        {imp && !p.admin_only && <Icon name="link" size={12} className="text-primary" aria-hidden />}
      </label>
    );
  };
  return (
    <Card className="enter flex min-w-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3.5">
        <h2 className="flex flex-1 items-center gap-2 text-base font-bold"><Icon name="key-round" size={18} className="text-primary" />مصفوفة الصلاحيات</h2>
        <span className="flex flex-wrap items-center gap-3 text-xs text-ink-2">
          <span className="flex items-center gap-1"><Icon name="link" size={12} className="text-primary" />متضمنة في الشاملة</span>
          <span className="flex items-center gap-1"><Icon name="lock" size={12} />للمدير العام فقط</span>
        </span>
      </div>
      <div className="min-w-0 overflow-auto">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm" aria-label="مصفوفة الصلاحيات">
          <thead>
            <tr>
              <th scope="col" className="sticky top-0 z-[1] border-b border-line bg-bg/95 px-4 py-2.5 text-start text-xs font-semibold text-ink-2">القسم</th>
              {COLS.map((a) => <th key={a} scope="col" className="sticky top-0 z-[1] border-b border-line bg-bg/95 px-2 py-2.5 text-center text-xs font-semibold text-ink-2">{a === "all" ? "الكل" : a === "special" ? "خاص" : head(a)}</th>)}
            </tr>
          </thead>
          <tbody>
            {catalog.sections.map((s, i) => {
              const grantable = s.permissions.filter((p) => !p.admin_only);
              const allOn = grantable.length > 0 && grantable.every((p) => sel.has(p.code) || implied.has(p.code));
              return (
                <tr key={s.code} className={i % 2 ? "bg-bg/50" : ""}>
                  <th scope="row" className="border-b border-line px-4 py-2.5 text-start font-semibold">
                    <span className="flex items-center gap-2">
                      <span className="flex-1">{s.name_ar}</span>
                      {editable && grantable.length > 1 && (
                        <button type="button" onClick={() => onRow(grantable, !allOn)} className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary-soft" aria-label={`${allOn ? "إلغاء" : "تحديد"} كل صلاحيات ${s.name_ar}`}>
                          {allOn ? "إلغاء الصف" : "تحديد الصف"}
                        </button>
                      )}
                    </span>
                  </th>
                  {COLS.map((a) => {
                    const ps = s.permissions.filter((p) => p.action === a);
                    return (
                      <td key={a} className="border-b border-line px-2 py-1.5 text-center align-middle">
                        {!ps.length ? <span aria-hidden className="text-ink-muted">·</span>
                          : a === "special" ? <span className="flex flex-col items-start gap-0.5">{ps.map((p) => box(p, true))}</span>
                          : <span className="flex flex-wrap justify-center gap-0.5">{ps.map((p) => box(p, ps.length > 1))}</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

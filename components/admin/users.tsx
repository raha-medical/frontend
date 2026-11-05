"use client";
/** المستخدمون (المواصفة 2.1، العقد 2): قائمة بفلاتر، وصفحة إضافة/تعديل منفصلة. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icon";
import { toast } from "@/components/toast";
import { Alert, Badge, Button, Card, CellStack, DataGrid, Field, ISelect, Modal, ReasonDialog, Spinner, type Column, type ISelectOption } from "@/components/ui";
import { branchesApi, lookupsApi, rolesApi, usersApi, type Role, type User, type UserInput } from "@/lib/api/admin";
import { errorMessage, fieldErrors } from "@/lib/api/errors";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { useAuth } from "@/lib/auth/store";
import { useDebounced } from "@/components/reception/common";
import { hasPerm, SECTION_META } from "@/lib/roles";
import { ROLE_AR, SecretBox, Select, useBranches } from "./kit";

const useRoles = () => useQuery({ queryKey: ["roles", "all"], queryFn: () => rolesApi.list(true), staleTime: 60_000 });
const useCatalog = (enabled = true) => useQuery({ queryKey: ["permissions", "catalog"], queryFn: rolesApi.catalog, staleTime: 3_600_000, enabled });

const roleLabel = (u: Pick<User, "role" | "role_name_ar">, roles?: Role[]) => u.role_name_ar || roles?.find((r) => r.code === u.role)?.name_ar || ROLE_AR[u.role]?.label || u.role;
const roleIcon = (code: string, roles?: Role[]) => ROLE_AR[code]?.icon ?? (roles?.find((r) => r.code === code)?.is_system === false ? "shield-plus" : "user-round");

type StatusF = "" | "active" | "disabled" | "temp";

// ------------------------------------------------------------------ القائمة
export function UsersScreen() {
  const me = useAuth((s) => s.user)!;
  const router = useRouter();
  const [role, setRole] = useState("");
  const [branch, setBranch] = useState("");
  const [status, setStatus] = useState<StatusF>("");
  const [text, setText] = useState("");
  const q = useDebounced(text);
  const list = useQuery({
    queryKey: ["users", { role, branch, status, q }],
    queryFn: () => usersApi.list({ role: role || undefined, branch_id: branch || undefined, is_active: status === "active" ? true : status === "disabled" ? false : undefined, q: q || undefined, page_size: 200 }),
  });
  const roles = useRoles();
  const branches = useBranches();
  const bName = (id: string) => branches.data?.items.find((b) => b.branch_id === id)?.name ?? "—";
  const rows = list.data?.items.filter((u) => status !== "temp" || (u.is_active && u.must_change_password));
  const canCreate = hasPerm(me, "users.create");

  const columns: Column<User>[] = [
    { key: "full_name", header: "الموظف", value: (u) => `${u.full_name} ${u.username} ${u.phone_number ?? ""}`, sortable: true,
      cell: (u) => <CellStack title={u.full_name} sub={<span className="num">{u.username}{u.phone_number ? ` · ${u.phone_number}` : ""}</span>} icon={<span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-strong"><Icon name={roleIcon(u.role, roles.data?.items)} size={17} /></span>} /> },
    { key: "role", header: "الدور والفروع", sortable: true, value: (u) => roleLabel(u, roles.data?.items),
      cell: (u) => <span className="flex max-w-[190px] flex-col"><span className="truncate text-[13px]">{roleLabel(u, roles.data?.items)}</span><span className="truncate text-xs text-ink-2">{u.branch_ids.map(bName).join("، ")}</span></span> },
    { key: "status", header: "الحالة", width: "110px", value: (u) => (!u.is_active ? "معطّل" : u.must_change_password ? "كلمة مؤقتة" : "فعّال"),
      cell: (u) => (!u.is_active ? <Badge tone="danger" icon="user-x">معطّل</Badge> : u.must_change_password ? <Badge tone="warn" icon="key-round">كلمة مؤقتة</Badge> : <Badge tone="success" icon="circle-check">فعّال</Badge>) },
    { key: "last_login_at", header: "آخر دخول", width: "140px", hideBelow: "lg", sortable: true, value: (u) => u.last_login_at ?? "",
      cell: (u) => (u.last_login_at ? <span className="num flex flex-col whitespace-nowrap text-xs text-ink-2"><span>{fmtDate(u.last_login_at)}</span><span>{fmtTime(u.last_login_at)}</span></span> : <span className="text-ink-muted">—</span>) },
    { key: "actions", header: <span className="sr-only">إجراءات</span>, width: "120px", sticky: true, cell: (u) => <UserActions u={u} /> },
  ];

  return (
    <DataGrid<User> aria-label="الموظفون" rows={rows} loading={list.isPending} error={list.isError ? errorMessage(list.error) : undefined}
      rowKey={(u) => u.user_id} columns={columns} minWidth={640}
      onRowClick={(u) => router.push(`/staff/admin/users/${u.user_id}`)}
      filters={<>
        <label className="flex h-[42px] min-w-[200px] flex-1 items-center gap-2 rounded-xl border-[1.5px] border-line-strong bg-surface px-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15 sm:max-w-xs">
          <Icon name="search" size={16} className="shrink-0 text-ink-muted" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="اسم الموظف أو اسم المستخدم" aria-label="بحث عن موظف" className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted" />
          {text && <button type="button" onClick={() => setText("")} aria-label="مسح البحث" className="text-ink-muted hover:text-ink"><Icon name="x" size={15} /></button>}
        </label>
        <div className="w-full sm:w-[170px]"><ISelect placeholder="كل الأدوار" size="md" aria-label="الدور" value={role} onChange={setRole} loading={roles.isPending}
          options={roles.data ? [{ value: "", label: "كل الأدوار" }, ...roles.data.items.filter((r) => me.role === "admin" || r.code !== "admin").map((r) => ({ value: r.code, label: r.name_ar, icon: roleIcon(r.code, roles.data?.items), group: r.is_system ? "أدوار النظام" : "أدوار مخصصة" }))] : undefined} /></div>
        {(branches.data?.items.length ?? 0) > 1 && <div className="w-full sm:w-[170px]"><ISelect placeholder="كل الفروع" size="md" aria-label="الفرع" value={branch} onChange={setBranch}
          options={[{ value: "", label: "كل الفروع" }, ...(branches.data?.items ?? []).map((b) => ({ value: b.branch_id, label: b.name, icon: "building-2" }))]} /></div>}
        <div className="w-full sm:w-[150px]"><ISelect placeholder="كل الحالات" size="md" aria-label="الحالة" value={status} onChange={(v) => setStatus(v as StatusF)} searchable={false}
          options={[{ value: "", label: "كل الحالات" }, { value: "active", label: "فعّال", icon: "circle-check" }, { value: "temp", label: "كلمة مؤقتة", icon: "key-round" }, { value: "disabled", label: "معطّل", icon: "user-x" }]} /></div>
      </>}
      actions={canCreate && <Link href="/staff/admin/users/new" className="inline-flex h-[42px] items-center gap-2 rounded-control bg-primary px-5 text-sm font-semibold text-on-accent hover:bg-primary-strong"><Icon name="user-plus" size={18} />موظف جديد</Link>}
      empty={{ icon: "users", title: "لا يوجد موظفون مطابقون" }} />
  );
}

/** أزرار صف الموظف: تعديل، إعادة تعيين كلمة المرور (تظهر في نافذة مرة واحدة)، تعطيل/تفعيل. */
function UserActions({ u }: { u: User }) {
  const me = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const [temp, setTemp] = useState<string | null>(null);
  const [disable, setDisable] = useState(false);
  const canEdit = hasPerm(me, "users.edit"), canDisable = hasPerm(me, "users.delete");
  return (
    <span className="flex gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Link href={`/staff/admin/users/${u.user_id}`} title="تعديل" aria-label={`تعديل ${u.full_name}`} className="grid size-8 place-items-center rounded-full text-ink-2 hover:bg-bg"><Icon name="pencil" size={16} /></Link>
      {canEdit && <IconBtn icon="key-round" label="إعادة تعيين كلمة المرور" onClick={async () => { try { setTemp((await usersApi.resetPassword(u.user_id)).temporary_password); } catch (e) { toast.error(errorMessage(e)); } }} />}
      {(u.is_active ? canDisable : canEdit) && <IconBtn icon={u.is_active ? "user-x" : "user-check"} label={u.is_active ? "تعطيل" : "تفعيل"} danger={u.is_active}
        onClick={async () => { if (u.is_active) { setDisable(true); return; } try { await usersApi.enable(u.user_id); toast.success("فُعّل الحساب"); void qc.invalidateQueries({ queryKey: ["users"] }); } catch (e) { toast.error(errorMessage(e)); } }} />}
      <Modal open={!!temp} onClose={() => setTemp(null)} title="كلمة مرور مؤقتة" icon="key-round">
        {temp && <SecretBox label={`كلمة المرور المؤقتة لـ ${u.full_name}`} value={temp} />}
      </Modal>
      <ReasonDialog open={disable} title={`تعطيل ${u.full_name}`} icon="user-x" danger requireReason={false} confirmText="تعطيل الحساب" onClose={() => setDisable(false)}
        note={<Alert tone="warn" icon="triangle-alert">تُلغى جلساته الحالية فوراً.{u.role === "doctor" ? " للطبيب: تُلغى وجباته القادمة وحجوزاتها ويتحول المدفوع رصيداً." : ""}</Alert>}
        onConfirm={async () => { const r = await usersApi.disable(u.user_id, u.role === "doctor"); toast.success(u.role === "doctor" ? `عُطّل · أُلغي ${r?.cancelled_bookings ?? 0} حجز` : "عُطّل الحساب"); void qc.invalidateQueries({ queryKey: ["users"] }); }} />
    </span>
  );
}

function IconBtn({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return <button type="button" onClick={onClick} title={label} aria-label={label} className={`grid size-8 place-items-center rounded-full hover:bg-bg ${danger ? "text-danger" : "text-ink-2"}`}><Icon name={icon} size={16} /></button>;
}

/** كلمة مرور مؤقتة عشوائية مقروءة، مثل Temp-4821-kqzm (14 حرفاً). */
function makeTempPassword(): string {
  const a = new Uint32Array(2); crypto.getRandomValues(a);
  const letters = "abcdefghjkmnpqrstuvwxyz";
  let w = ""; let n = a[1];
  for (let i = 0; i < 4; i++) { w += letters[n % letters.length]; n = Math.floor(n / letters.length); }
  return `Temp-${String(a[0] % 10000).padStart(4, "0")}-${w}`;
}

// ------------------------------------------------------------------ صفحة الإضافة / التعديل
export function UserFormPage({ id }: { id: string | null }) {
  const q = useQuery({ queryKey: ["users", "one", id], queryFn: () => usersApi.get(id!), enabled: !!id });
  if (id && q.isPending) return <Spinner />;
  if (q.isError) return <Alert tone="danger">{errorMessage(q.error)}</Alert>;
  return <UserForm key={q.data?.user_id ?? "new"} user={q.data ?? null} />;
}

/** العقد 2: الاختصاص والعنوان يُرسلان بالرمز أو بالاسم العربي، ونستخدم الاسم لأنه ما يعيده السيرفر. */
/** الأدوار التي تخدم نقطة تحصيل/طابور وتحتاج ربطاً بالعيادات والأقسام. */
const CLINIC_ROLES = ["receptionist", "lab_tech", "radiologist", "pharmacist"];

function UserForm({ user }: { user: User | null }) {
  const me = useAuth((s) => s.user)!;
  const router = useRouter();
  const qc = useQueryClient();
  const roles = useRoles();
  const catalog = useCatalog();
  const branches = useBranches();
  const blank = (r = "receptionist", b = [me.branch_id]): UserInput => ({ username: "", full_name: "", phone_number: "", role: r, branch_ids: b, clinic_ids: [], extra_permissions: [] });
  const [f, setF] = useState<UserInput>(() => user ? { full_name: user.full_name, phone_number: user.phone_number, role: user.role, branch_ids: user.branch_ids, clinic_ids: user.clinic_ids, extra_permissions: user.extra_permissions ?? [],
    doctor_profile: user.doctor_profile ? { specialty: user.doctor_profile.specialty, clinic_id: user.doctor_profile.clinic_id, default_slot_minutes: user.doctor_profile.default_slot_minutes, job_title: user.doctor_profile.job_title } : null } : blank());
  const set = (p: Partial<UserInput>) => setF((x) => ({ ...x, ...p }));
  const branchIds = f.branch_ids ?? [];
  const clinicsQ = useQuery({ queryKey: ["clinics", "multi", branchIds], queryFn: async () => (await Promise.all(branchIds.map((b) => branchesApi.clinics(b)))).flatMap((r) => r.items), enabled: branchIds.length > 0 });
  const isDoctor = f.role === "doctor";
  const specs = useQuery({ queryKey: ["lookups", "doctor_specialty"], queryFn: () => lookupsApi.list("doctor_specialty"), staleTime: 600_000, enabled: isDoctor });
  const titles = useQuery({ queryKey: ["lookups", "doctor_job_title"], queryFn: () => lookupsApi.list("doctor_job_title"), staleTime: 600_000, enabled: isDoctor });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [temp, setTemp] = useState<{ name: string; username: string; pw: string } | null>(null);
  const fe = fieldErrors(err);
  const readOnly = !hasPerm(me, user ? "users.edit" : "users.create");

  const role = roles.data?.items.find((r) => r.code === f.role);
  const rolePerms = role?.effective_permissions ?? [];
  const permName = useMemo(() => new Map((catalog.data?.sections ?? []).flatMap((s) => s.permissions.map((p) => [p.code, p.name_ar] as const))), [catalog.data]);
  // الأدوار المتاحة: الفعالة التي يستطيع المستخدم إسنادها (assignable)، مع دور الموظف الحالي حتى لو أُوقف
  const roleOptions: ISelectOption[] | undefined = roles.data?.items
    .filter((r) => (r.is_active && r.assignable && (me.role === "admin" || !["admin", "branch_manager"].includes(r.code))) || r.code === user?.role)
    .map((r) => ({ value: r.code, label: r.name_ar, icon: roleIcon(r.code, roles.data?.items), group: r.is_system ? "أدوار النظام" : "أدوار مخصصة", hint: r.is_active ? (r.description ?? undefined) : "موقوف" }));
  // صلاحيات إضافية: من الكتالوج، بلا admin_only، وبلا ما يملكه الدور، ولا يمنح غير المدير العام ما لا يملكه
  const extraOptions: ISelectOption[] | undefined = catalog.data?.sections.flatMap((s) => s.permissions
    .filter((p) => !p.admin_only && !rolePerms.includes(p.code) && hasPerm(me, p.code))
    .map((p) => ({ value: p.code, label: p.name_ar, group: s.name_ar, hint: p.code })));
  const needsClinics = !!f.role && (CLINIC_ROLES.includes(f.role) || (!!role && !role.is_system && role.sections.some((s) => ["reception", "lab", "radiology", "pharmacy"].includes(s))));

  async function save() {
    setBusy(true); setErr(null);
    try {
      const body: UserInput = { ...f, extra_permissions: (f.extra_permissions ?? []).filter((p) => !rolePerms.includes(p)), doctor_profile: isDoctor ? f.doctor_profile : undefined };
      if (user) {
        await usersApi.update(user.user_id, body);
        toast.success("حُفظت التعديلات");
        void qc.invalidateQueries({ queryKey: ["users"] }); void qc.invalidateQueries({ queryKey: ["roles"] });
        router.push("/staff/admin/users");
      } else {
        // العقد 2: كلمة المرور المؤقتة يرسلها المدير مع الطلب (10 أحرف على الأقل) ويُجبر الموظف على تغييرها بأول دخول
        const tempPw = makeTempPassword();
        const r = await usersApi.create({ ...body, temporary_password: tempPw });
        toast.success("أُنشئ الحساب");
        setTemp({ name: r.full_name, username: r.username, pw: r.temporary_password ?? tempPw });
        setF(blank(f.role, f.branch_ids));
        void qc.invalidateQueries({ queryKey: ["users"] }); void qc.invalidateQueries({ queryKey: ["roles"] });
      }
    } catch (e) { setErr(e); } finally { setBusy(false); }
  }

  const valid = !!f.full_name?.trim() && (!!user || !!f.username) && !!f.role && branchIds.length > 0 && (f.role !== "receptionist" || (f.clinic_ids ?? []).length > 0)
    && (!isDoctor || (!!f.doctor_profile?.specialty && !!f.doctor_profile?.clinic_id));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/staff/admin/users" className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"><Icon name="arrow-right" size={16} />كل الموظفين</Link>
        <span className="flex-1" />
        {user && (!user.is_active ? <Badge tone="danger" icon="user-x">معطّل</Badge> : user.must_change_password ? <Badge tone="warn" icon="key-round">كلمة مؤقتة</Badge> : <Badge tone="success" icon="circle-check">فعّال</Badge>)}
        {user?.last_login_at && <span className="sub-sm">آخر دخول <span className="num">{fmtDateTime(user.last_login_at)}</span></span>}
      </div>
      {temp && (
        <Card className="enter flex flex-col gap-3 p-5">
          <span className="flex items-center gap-2 font-bold"><Icon name="circle-check" size={18} className="text-success" />أُنشئ حساب {temp.name} (<span className="num" dir="ltr">{temp.username}</span>)</span>
          <SecretBox label="كلمة المرور المؤقتة" value={temp.pw} />
          <span className="sub-sm">أعطها للموظف الآن. سيُطلب منه تغييرها عند أول دخول. النموذج أدناه جاهز لإضافة موظف آخر.</span>
        </Card>
      )}
      {readOnly && <Alert tone="info" icon="eye">عرض فقط: لا تملك صلاحية {user ? "تعديل" : "إضافة"} الموظفين.</Alert>}
      <fieldset disabled={readOnly} className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="enter flex flex-col gap-3.5 p-5">
          <h2 className="flex items-center gap-2 text-base font-bold"><Icon name="user-round" size={18} className="text-primary" />البيانات الأساسية</h2>
          {!user && <Field label="اسم المستخدم" icon="at-sign" ltr value={f.username ?? ""} onChange={(e) => set({ username: e.target.value.trim().toLowerCase() })} error={fe.username} placeholder="reception_b1" autoComplete="off" />}
          {user && <Field label="اسم المستخدم" icon="at-sign" ltr value={user.username} disabled readOnly />}
          <Field label="الاسم الكامل" icon="user-round" value={f.full_name ?? ""} onChange={(e) => set({ full_name: e.target.value })} error={fe.full_name} />
          <Field label="الهاتف" icon="smartphone" ltr inputMode="tel" value={f.phone_number ?? ""} onChange={(e) => set({ phone_number: e.target.value })} error={fe.phone_number} placeholder="07XXXXXXXXX" />
        </Card>

        <Card className="enter flex flex-col gap-3.5 p-5">
          <h2 className="flex items-center gap-2 text-base font-bold"><Icon name="key-round" size={18} className="text-primary" />الدور والصلاحيات</h2>
          <ISelect label="الدور" value={f.role ?? ""} onChange={(v) => set({ role: v || undefined, clinic_ids: [] })} options={roleOptions} loading={roles.isPending} error={fe.role} placeholder="اختر الدور" />
          {role && (
            <div className="flex flex-col gap-1.5 rounded-xl bg-bg p-3">
              <span className="sub-sm flex items-center gap-1.5"><Icon name="layout-grid" size={14} />يفتح: {role.sections.length ? role.sections.map((s) => SECTION_META[s]?.label ?? s).join("، ") : "لا شاشات"}</span>
              <div className="flex flex-wrap gap-1">{rolePerms.map((p) => <Badge key={p} size="sm" tone="muted" icon="key" title={p}>{permName.get(p) ?? p}</Badge>)}</div>
              {hasPerm(me, "roles.view") && <Link href={`/staff/admin/roles/${encodeURIComponent(role.code)}`} className="self-start text-xs font-semibold text-primary hover:underline">عرض الدور في مصفوفة الصلاحيات</Link>}
            </div>
          )}
          <ISelect multiple label="صلاحيات إضافية (اختياري)" value={f.extra_permissions ?? []} onChange={(v) => set({ extra_permissions: v })} options={extraOptions} loading={catalog.isPending}
            clearable placeholder="بدون صلاحيات إضافية" hint="فوق صلاحيات الدور لهذا الموظف فقط" error={fe.extra_permissions} maxBadges={4} />
        </Card>

        <Card className="enter flex flex-col gap-3.5 p-5">
          <h2 className="flex items-center gap-2 text-base font-bold"><Icon name="building-2" size={18} className="text-primary" />الفروع والعيادات</h2>
          <ISelect multiple label="الفروع" placeholder="اختر فرعاً أو أكثر" value={branchIds} onChange={(v) => set({ branch_ids: v })} clearable
            loading={branches.isPending} options={branches.data?.items.filter((b) => me.role === "admin" || me.branch_ids.includes(b.branch_id)).map((b) => ({ value: b.branch_id, label: b.name, icon: "building-2" }))} error={fe.branch_ids} />
          {needsClinics && (
            <div className="flex flex-col gap-1.5">
              {!clinicsQ.isLoading && !(clinicsQ.data?.length) && <span className="text-xs text-ink-2">لا توجد عيادات في الفروع المختارة. أضفها من «الأقسام والعيادات» أولاً.</span>}
              {(clinicsQ.isLoading || (clinicsQ.data?.length ?? 0) > 0) && <ISelect multiple label={<>العيادات والأقسام (للطابور ونقطة التحصيل){f.role === "receptionist" && <span className="text-danger-strong"> *</span>}</>} placeholder="اختر العيادات" value={f.clinic_ids ?? []} onChange={(v) => set({ clinic_ids: v })} clearable maxBadges={4}
                loading={clinicsQ.isLoading} options={clinicsQ.data?.map((c) => ({ value: c.clinic_id, label: c.name }))} error={fe.clinic_ids} />}
              {!clinicsQ.isLoading && !(clinicsQ.data?.length) && fe.clinic_ids && <span className="text-xs font-semibold text-danger-strong">{fe.clinic_ids}</span>}
            </div>
          )}
        </Card>

        {isDoctor && (
          <Card className="enter flex flex-col gap-3.5 p-5">
            <h2 className="flex items-center gap-2 text-base font-bold"><Icon name="stethoscope" size={18} className="text-primary" />ملف الطبيب</h2>
            <Select label="الاختصاص" value={f.doctor_profile?.specialty ?? ""} placeholder="اختر" onChange={(v) => set({ doctor_profile: { ...(f.doctor_profile ?? { clinic_id: "", default_slot_minutes: 10 }), specialty: v } })}
              options={(specs.data?.items ?? []).filter((x) => x.is_active || x.name_ar === f.doctor_profile?.specialty).map((x) => ({ value: x.name_ar, label: x.name_ar }))} />
            <Select label="العنوان الوظيفي" value={f.doctor_profile?.job_title ?? ""} placeholder="—" onChange={(v) => set({ doctor_profile: { ...(f.doctor_profile ?? { specialty: "", clinic_id: "", default_slot_minutes: 10 }), job_title: v || null } })}
              options={(titles.data?.items ?? []).filter((x) => x.is_active || x.name_ar === f.doctor_profile?.job_title).map((x) => ({ value: x.name_ar, label: x.name_ar }))} />
            <Select label="العيادة" value={f.doctor_profile?.clinic_id ?? ""} placeholder="اختر" onChange={(v) => set({ doctor_profile: { ...(f.doctor_profile ?? { specialty: "", default_slot_minutes: 10 }), clinic_id: v } })}
              options={(clinicsQ.data ?? []).filter((c) => c.department === "clinic").map((c) => ({ value: c.clinic_id, label: c.name }))} />
            <Field label="مدة المريض (دقيقة)" ltr inputMode="numeric" value={String(f.doctor_profile?.default_slot_minutes ?? 10)} onChange={(e) => set({ doctor_profile: { ...(f.doctor_profile ?? { specialty: "", clinic_id: "" }), default_slot_minutes: Number(e.target.value.replace(/\D/g, "")) || 0 } })} />
          </Card>
        )}
      </fieldset>
      {err != null && <Alert tone="danger">{errorMessage(err)}</Alert>}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} loading={busy} icon={user ? "save" : "user-check"} disabled={!valid}>{user ? "حفظ التعديلات" : "إنشاء الحساب"}</Button>
          <Link href="/staff/admin/users" className="text-sm font-semibold text-ink-2 hover:text-ink">إلغاء</Link>
          {!user && <span className="flex items-center gap-1.5 text-xs text-ink-2"><Icon name="key-round" size={14} />كلمة مرور مؤقتة تُعرض مرة واحدة، ويُطلب تغييرها عند أول دخول</span>}
        </div>
      )}
    </div>
  );
}

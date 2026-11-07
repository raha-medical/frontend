"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BrandMark } from "../brand-mark";
import { Icon } from "../icon";
import { ThemeToggle } from "../theme-toggle";
import { Badge } from "../ui";
import { useScrollLock } from "../ui/overlay";
import { useLiveQueue } from "@/lib/reception/use-live-queue";
import { staffApi } from "@/lib/api/staff";
import { errorMessage } from "@/lib/api/errors";
import { supportApi } from "@/lib/api/session4";
import type { Branch, StaffUser } from "@/lib/api/types";
import { hardwareAgent } from "@/lib/agent";
import { AgentPanel } from "./agent-panel";
import { useAuth } from "@/lib/auth/store";
import { useSync } from "@/lib/offline/sync-provider";
import { useLive } from "@/lib/realtime/provider";
import { CriticalBanner, NotificationBell } from "./notifications";
import { buildNav, findNavItem, hasPerm, roleMeta, type NavGroup, type NavItem } from "@/lib/roles";
import { CASH_DRAWER_ENABLED } from "@/lib/config";

/** إطار واجهات الموظفين: قائمة جانبية قابلة للطي بلون الدور، شريط علوي (العنوان، المسار، الفرع، المستخدم)،
 *  ووصول سريع خاص بعمل الاستقبال والطبيب (UI-78، UI-79). */
export function Shell({ user, children }: { user: StaffUser; children: React.ReactNode }) {
  const meta = roleMeta(user);
  const path = usePathname();
  const sync = useSync();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useCollapsed(user.user_id);
  const section = path.split("/")[2] ?? "";
  const groups = useMemo(() => buildNav(user), [user]);
  const flat = groups.flatMap((g) => g.blocks.flatMap((b) => b.items));
  // الشاشة الحالية: أطول تطابق، حتى لو كانت صفحة تفاصيل تحت شاشة القائمة
  const current: NavItem = path === "/staff/notifications" ? { href: path, label: "الإشعارات", icon: "bell", subtitle: "المقروء وغير المقروء، والحرج في الأعلى" } : findNavItem(path) ?? flat[0] ?? { href: meta.home, label: "الرئيسية", icon: "layout-dashboard" };
  const group = groups.find((g) => g.blocks.some((b) => b.items.some((n) => n.href === current.href)));
  const subPage = path !== current.href;
  const { data } = useQuery({ queryKey: ["branches", "mine"], queryFn: () => staffApi.get<{ items: Branch[] }>("/branches"), staleTime: 5 * 60_000 });
  const branch = data?.items.find((b) => b.branch_id === user.branch_id);
  const navBg = meta.nav === "finance" ? "bg-nav-finance" : "bg-nav-medical";
  const badges = useNavBadges(user);
  const quick = QUICK_NAV[section]?.filter((n) => flat.some((f) => f.href === n.href)) ?? [];

  useEffect(() => { setOpen(false); }, [path]);
  useScrollLock(open);

  const side = (mini: boolean) => (
    <aside className={`flex h-full flex-col gap-4 py-5 text-white transition-[width] duration-base ${mini ? "w-[76px] px-2.5" : "w-64 px-3.5"} ${navBg}`}>
      <div className={`flex items-center gap-2.5 ${mini ? "justify-center" : "px-1.5"}`}>
        <BrandMark size={mini ? 38 : 42} tone="onDark" paper={meta.nav === "finance" ? "rgb(var(--nav-finance))" : "rgb(var(--nav-medical))"} />
        {!mini && <div className="flex min-w-0 flex-col"><span className="text-base font-bold">مجمع الرحمة</span><span className="truncate text-xs font-semibold text-on-nav-3">{meta.label}</span></div>}
      </div>
      <BranchSwitcher user={user} branches={data?.items ?? []} current={branch} mini={mini} />
      <SideNav user={user} groups={groups} current={current} badges={{ ...badges, sync: sync.pending + sync.needsReview }} mini={mini} onNavigate={() => setOpen(false)} />
      <div className="mt-auto flex flex-col gap-2.5">
        <Link href="/hub" title="كل الأقسام" className={`flex items-center gap-3 rounded-xl border border-white/15 py-2.5 text-sm font-semibold text-on-nav-2 hover:bg-white/10 hover:text-white ${mini ? "justify-center px-0" : "px-3"}`}>
          <Icon name="layout-grid" size={18} />{!mini && <span className="flex-1">كل الأقسام</span>}
        </Link>
        <ConnectionPill mini={mini} />
      </div>
    </aside>
  );

  return (
    <div className="scale-staff flex min-h-dvh">
      <div className="sticky top-0 hidden h-dvh lg:block">{side(collapsed)}</div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="القائمة" onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="drawer-nav absolute inset-y-0 start-0">{side(false)}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-bar sticky top-2 z-30 mx-2 mt-2 flex items-center gap-3 rounded-panel px-3 py-2.5 sm:mx-4 sm:px-5">
          <button className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-surface/60 hover:bg-primary-soft lg:hidden" onClick={() => setOpen(true)} aria-label="فتح القائمة"><Icon name="menu" size={20} /></button>
          <button className="hidden size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface/60 hover:bg-primary-soft lg:grid" onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"} title={collapsed ? "توسيع القائمة" : "طي القائمة"} aria-expanded={!collapsed}>
            <Icon name={collapsed ? "panel-right-open" : "panel-right-close"} size={19} />
          </button>
          <div className="flex min-w-[120px] flex-1 flex-col">
            {subPage && (
              <nav aria-label="مسار التنقل" className="sub-sm flex min-w-0 items-center gap-1">
                {group && <><span className="truncate">{group.label}</span><Icon name="chevron-left" size={13} className="shrink-0" /></>}
                <Link href={current.href} className="truncate hover:text-primary-strong">{current.label}</Link>
                <Icon name="chevron-left" size={13} className="shrink-0" /><span className="truncate text-ink">التفاصيل</span>
              </nav>
            )}
            <h1 className="truncate text-[17px] font-bold sm:text-[20px]">{current.label}</h1>
            {current.subtitle && !subPage && <span className="sub hidden truncate sm:block">{current.subtitle}</span>}
          </div>
          {quick.length > 0 && (
            <nav aria-label="وصول سريع" className="hidden shrink-0 items-center gap-1 lg:flex">
              {quick.map((n) => {
                const on = n.href === current.href;
                return <Link key={n.href} href={n.href} title={n.label} aria-label={n.label} aria-current={on ? "page" : undefined} className={`grid size-10 place-items-center rounded-xl transition-colors duration-base ${on ? "bg-primary-soft text-primary-strong" : "text-ink-2 hover:bg-primary-soft hover:text-primary-strong"}`}><Icon name={n.icon} size={18} /></Link>;
              })}
            </nav>
          )}
          {section === "reception" && <AgentChips />}
          {branch && <span className="hidden items-center gap-1.5 rounded-xl bg-bg px-3 py-2 text-[13px] font-semibold text-ink-2 2xl:flex" title="الفرع الحالي"><Icon name="building-2" size={15} className="text-primary" /><span className="max-w-[140px] truncate">{branch.name}</span></span>}
          <NotificationBell />
          <ThemeToggle />
          <UserMenu user={user} roleLabel={meta.label} />
        </header>
        <CriticalBanner />
        {!sync.online && (
          <div className="mx-2 mt-2 flex items-center gap-2.5 rounded-xl border border-warn/30 bg-warn-soft px-4 py-2.5 text-sm text-warn-strong sm:mx-4 sm:px-6" role="status">
            <Icon name="wifi-off" size={18} />
            <span className="flex-1">تعمل أوفلاين. الحضور والتحصيل النقدي وأزرار الطابور تُحفظ محلياً. الاسترجاع والخصومات وفك الحظر غير متاحة.</span>
            <span className="num font-semibold">{sync.pending} في الصادر</span>
          </div>
        )}
        <main key={path} className={`enter flex flex-1 flex-col gap-[18px] px-4 pt-5 sm:px-7 ${quick.length ? "pb-24 lg:pb-12" : "pb-12"}`}>{children}</main>
        {quick.length > 0 && (
          <nav aria-label="وصول سريع" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
            {quick.map((n) => {
              const on = n.href === current.href;
              return <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined} className={`flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-semibold ${on ? "text-primary-strong" : "text-ink-2"}`}><Icon name={n.icon} size={20} /><span className="max-w-full truncate">{n.label}</span></Link>;
            })}
          </nav>
        )}
      </div>
    </div>
  );
}

/** الوصول السريع لما يحتاجه الموظف أثناء عمله، من أي شاشة في قسمه. */
const QUICK_NAV: Record<string, { href: string; label: string; icon: string }[]> = {
  reception: [
    { href: "/staff/reception/queue", label: "الطابور", icon: "list-ordered" },
    { href: "/staff/reception/checkin", label: "تسجيل مراجع", icon: "user-plus" },
    { href: "/staff/reception/collect", label: "التحصيل", icon: "banknote" },
    { href: "/staff/reception/shift", label: "الحساب اليومي", icon: "clock" },
  ],
  doctor: [
    { href: "/staff/doctor/consult", label: "المراجع الحالي", icon: "clipboard-plus" },
    { href: "/staff/doctor/queue", label: "الطابور", icon: "list-ordered" },
    { href: "/staff/doctor/history", label: "سجل المراجع", icon: "history" },
  ],
};

const COLLAPSE_KEY = (uid: string) => `rahma.nav.collapsed.${uid}`;
function useCollapsed(uid: string) {
  const [v, setV] = useState(false);
  useEffect(() => { try { setV(window.localStorage.getItem(COLLAPSE_KEY(uid)) === "1"); } catch { /* تخزين محظور */ } }, [uid]);
  return [v, (n: boolean) => { setV(n); try { window.localStorage.setItem(COLLAPSE_KEY(uid), n ? "1" : "0"); } catch { /* تخزين محظور */ } }] as const;
}

/** نافذة منبثقة صغيرة: تُغلق بالنقر خارجها أو بـ Esc. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return { open, setOpen, ref };
}

/** قائمة المستخدم في الشريط العلوي (UI-75). */
function UserMenu({ user, roleLabel }: { user: StaffUser; roleLabel: string }) {
  const logout = useAuth((s) => s.logout);
  const pop = usePopover();
  return (
    <div ref={pop.ref} className="relative shrink-0">
      <button type="button" onClick={() => pop.setOpen(!pop.open)} aria-haspopup="menu" aria-expanded={pop.open} aria-label={`قائمة المستخدم: ${user.full_name}`}
        className="grid size-11 place-items-center rounded-full bg-primary font-bold text-on-accent hover:bg-primary-strong">
        {user.full_name.replace(/^د\.\s*/, "").trim().charAt(0)}
      </button>
      {pop.open && (
        <div role="menu" className="enter absolute end-0 top-full z-40 mt-2 flex w-64 flex-col gap-1 rounded-card border border-line bg-surface p-2 shadow-pop">
          <div className="flex flex-col px-3 py-2"><span className="truncate font-bold">{user.full_name}</span><span className="sub truncate">{roleLabel}</span></div>
          <div className="h-px bg-line" />
          <Link role="menuitem" href="/staff/change-password" className="flex h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold hover:bg-primary-soft"><Icon name="key-round" size={17} />تغيير كلمة المرور</Link>
          <button role="menuitem" type="button" onClick={() => { void logout(); /* الحارس في layout ينقل لصفحة الدخول عند تحول الحالة إلى anon */ }}
            className="flex h-11 items-center gap-2.5 rounded-xl px-3 text-sm font-semibold text-danger-strong hover:bg-danger-soft"><Icon name="log-out" size={17} />تسجيل الخروج</button>
        </div>
      )}
    </div>
  );
}

/** محدد الفرع أعلى القائمة لمن يعمل على أكثر من فرع (UI-64)، وبطاقة ثابتة لغيره. */
function BranchSwitcher({ user, branches, current, mini }: { user: StaffUser; branches: Branch[]; current?: Branch; mini: boolean }) {
  const switchBranch = useAuth((s) => s.switchBranch);
  const pop = usePopover();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const list = branches.filter((b) => user.branch_ids.includes(b.branch_id));
  const many = list.length > 1;
  async function pick(id: string) {
    if (id === user.branch_id) { pop.setOpen(false); return; }
    setBusy(id); setErr(null);
    try { await switchBranch(id); window.location.reload(); }
    catch (e) { setErr(errorMessage(e)); setBusy(null); }
  }
  const body = (
    <>
      <Icon name="building-2" size={18} className="shrink-0 text-on-nav-3" />
      {!mini && (
        <span className="flex min-w-0 flex-1 flex-col text-start">
          <span className="truncate text-sm font-semibold">{current?.name ?? "—"}</span>
          {current && current.status !== "open" && <span className="text-[11px] font-semibold text-on-nav-warn">{current.status_ar}</span>}
        </span>
      )}
      {!mini && many && <Icon name="chevrons-up-down" size={15} className="shrink-0 text-on-nav-3" />}
    </>
  );
  const cls = `glass-dark flex w-full items-center gap-2.5 rounded-xl py-2.5 ${mini ? "justify-center px-0" : "px-3"}`;
  if (!many) return <div className={cls} title={current?.name}>{body}</div>;
  return (
    <div ref={pop.ref} className="relative">
      <button type="button" onClick={() => pop.setOpen(!pop.open)} aria-haspopup="listbox" aria-expanded={pop.open} aria-label={`تبديل الفرع. الفرع الحالي: ${current?.name ?? ""}`} title={current?.name} className={`${cls} hover:bg-white/15`}>{body}</button>
      {pop.open && (
        <div role="listbox" aria-label="الفروع" className="enter absolute start-0 top-full z-40 mt-2 flex w-56 flex-col gap-1 rounded-card border border-line bg-surface p-2 text-ink shadow-pop">
          {list.map((b) => {
            const on = b.branch_id === user.branch_id;
            return (
              <button key={b.branch_id} type="button" role="option" aria-selected={on} disabled={!!busy} onClick={() => void pick(b.branch_id)}
                className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-start text-sm font-semibold hover:bg-primary-soft disabled:opacity-60 ${on ? "bg-primary-soft text-primary-strong" : ""}`}>
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
                <Icon name={busy === b.branch_id ? "loader-circle" : on ? "check" : "building-2"} size={16} className={busy === b.branch_id ? "animate-spin" : ""} />
              </button>
            );
          })}
          {err && <span role="alert" className="px-3 py-1 text-xs font-semibold text-danger-strong">{err}</span>}
        </div>
      )}
    </div>
  );
}

/** أرقام التنبيه في القائمة (UI-63) من النقاط الموجودة، وبحسب الصلاحية حتى لا تُرسل طلبات مرفوضة. */
function useNavBadges(user: StaffUser) {
  const canSupport = hasPerm(user, "support.manage");
  const canQueue = hasPerm(user, ["queue.manage", "queue.view"]) && hasPerm(user, "payments.collect");
  const support = useQuery({
    queryKey: ["nav-badges", "support"], enabled: canSupport, staleTime: 60_000, refetchInterval: 60_000,
    queryFn: () => supportApi.requests({ status: "open", page: 1, page_size: 1 }),
  });
  const queue = useLiveQueue({ enabled: canQueue });
  const unpaid = (queue.data ?? []).reduce((n, s) => n + s.items.filter((t) => t.status !== "cancelled" && (t.payment_status === "unpaid" || (t.outstanding_amount ?? 0) > 0)).length, 0);
  return { support: canSupport ? support.data?.total ?? 0 : 0, collect: canQueue ? unpaid : 0 };
}

const NAV_KEY = (uid: string) => `rahma.nav.groups.${uid}`;
const readGroups = (uid: string): Record<string, boolean> => {
  try { const v = JSON.parse(window.localStorage.getItem(NAV_KEY(uid)) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
};
const writeGroups = (uid: string, v: Record<string, boolean>) => { try { window.localStorage.setItem(NAV_KEY(uid), JSON.stringify(v)); } catch { /* تخزين محظور: لا بأس */ } };

/** التنقل الجانبي (المواصفة 8.6): مجموعات وظيفية قابلة للطي تُبنى من صلاحيات المستخدم. حالة الطي تُحفظ لكل مستخدم.
 *  المجموعة ذات العنصر الواحد تظهر رابطاً مباشراً، ومجموعة وحيدة تُعرض عناصرها مسطحة. */
function SideNav({ user, groups, current, badges, mini, onNavigate }: { user: StaffUser; groups: NavGroup[]; current: NavItem; badges: Record<NonNullable<NavItem["badge"]>, number>; mini: boolean; onNavigate: () => void }) {
  // true = مفتوحة. بلا قيمة محفوظة: مجموعة الشاشة الحالية مفتوحة وغيرها مطوية.
  const [state, setState] = useState<Record<string, boolean>>({});
  useEffect(() => { setState(readGroups(user.user_id)); }, [user.user_id]);
  const currentGroup = groups.find((g) => g.blocks.some((b) => b.items.some((n) => n.href === current.href)))?.key;
  // الانتقال إلى شاشة في مجموعة مطوية يفتحها حتى تبقى الشاشة الحالية ظاهرة
  useEffect(() => {
    if (currentGroup) setState((s) => (s[currentGroup] === false ? { ...s, [currentGroup]: true } : s));
  }, [currentGroup, current.href]);
  const isOpen = (k: string) => state[k] ?? k === currentGroup;
  const toggle = (k: string) => setState((s) => { const n = { ...s, [k]: !(s[k] ?? k === currentGroup) }; writeGroups(user.user_id, n); return n; });
  const items = groups.flatMap((g) => g.blocks.flatMap((b) => b.items));
  const flat = groups.length === 1;

  const link = (n: NavItem) => {
    const on = n.href === current.href;
    const badge = n.badge ? badges[n.badge] : 0;
    return (
      <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={on ? "page" : undefined} title={mini ? n.label : undefined} aria-label={mini ? n.label : undefined}
        className={`relative flex items-center gap-3 rounded-xl py-[10px] text-[14.5px] transition-colors duration-base ${mini ? "justify-center px-0" : "px-3"} ${on ? "bg-nav-active font-semibold text-white" : "text-on-nav-2 hover:bg-white/10 hover:text-white"}`}>
        <Icon name={n.icon} size={mini ? 20 : 18} />
        {!mini && <span className="min-w-0 flex-1 truncate">{n.label}</span>}
        {badge > 0 && <span className={`num rounded-full px-[7px] py-px text-xs ${mini ? "absolute end-0.5 top-0.5" : ""} ${on ? "bg-white/25" : "bg-danger text-on-accent"}`}>{badge}</span>}
      </Link>
    );
  };

  if (mini) return <nav className="flex min-h-0 flex-col gap-1 overflow-y-auto overflow-x-hidden" aria-label="التنقل">{items.map(link)}</nav>;
  if (flat) return <nav className="flex min-h-0 flex-col gap-[3px] overflow-auto" aria-label="التنقل">{items.map(link)}</nav>;
  return (
    <nav className="-mx-1 flex min-h-0 flex-col gap-1 overflow-auto px-1" aria-label="التنقل">
      {groups.map((g) => {
        const only = g.blocks.length === 1 && g.blocks[0].items.length === 1 ? g.blocks[0].items[0] : null;
        if (only) return link(only);
        const o = isOpen(g.key);
        const id = `nav-g-${g.key}`;
        return (
          <div key={g.key} className="flex flex-col gap-[3px]">
            <button type="button" onClick={() => toggle(g.key)} aria-expanded={o} aria-controls={id}
              className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] font-bold transition-colors duration-base hover:bg-white/10 ${g.key === currentGroup ? "text-white" : "text-on-nav-3"}`}>
              <Icon name={g.icon} size={15} className="text-on-nav-icon" />
              <span className="flex-1 text-start">{g.label}</span>
              <Icon name="chevron-down" size={15} className={`transition-transform duration-base ${o ? "" : "rotate-90"}`} />
            </button>
            <div id={id} hidden={!o} className={`${o ? "enter flex" : "hidden"} flex-col gap-[3px] ps-1.5`}>
              {g.blocks.map((b) => (
                <div key={b.key} className="flex flex-col gap-[3px]">
                  {b.title && g.blocks.length > 1 && <span className="flex items-center gap-1.5 px-3 pb-0.5 pt-1.5 text-[12px] font-semibold text-on-nav-icon">{b.icon && <Icon name={b.icon} size={13} />}{b.title}</span>}
                  {b.items.map(link)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/** حالة الاتصال أسفل القائمة (تصميم: «متصل · آخر مزامنة» / «أوفلاين · 3 في الصادر»). */
function ConnectionPill({ mini }: { mini: boolean }) {
  const { online, pending, needsReview } = useSync();
  const { state } = useLive();
  const bad = !online || state !== "connected";
  const label = !online ? `أوفلاين · ${pending} في الصادر`
    : state === "connected" ? (pending ? `متصل · ${pending} بانتظار الإرسال` : "متصل · التحديث مباشر")
    : state === "reconnecting" || state === "connecting" ? "جارٍ الاتصال بالتحديث اللحظي" : "التحديث اللحظي متوقف";
  if (mini) return <div title={label} role="status" aria-label={label} className={`grid h-10 place-items-center rounded-xl ${bad ? "bg-warn/20 text-on-nav-warn" : "bg-success/15 text-on-nav-success"}`}><Icon name={online ? "wifi" : "wifi-off"} size={17} /></div>;
  return (
    <div className={`flex flex-col gap-1 rounded-xl px-3 py-2.5 text-[13px] ${bad ? "bg-warn/20 text-on-nav-warn" : "bg-success/15 text-on-nav-success"}`}>
      <span className="flex items-center gap-2"><Icon name={online ? "wifi" : "wifi-off"} size={16} /><span className="flex-1">{label}</span></span>
      {needsReview > 0 && <Link href="/staff/reception/sync" className="flex items-center gap-2 text-on-nav-danger hover:text-white"><Icon name="triangle-alert" size={14} />{needsReview} عمليات تحتاج مراجعة</Link>}
    </div>
  );
}

/** حالة الطابعة والدرج من وكيل العتاد (القسم 16)، تتحدث كل 30 ثانية. */
function AgentChips() {
  const { data, isError } = useQuery({ queryKey: ["agent", "status"], queryFn: () => hardwareAgent.status(), refetchInterval: 30_000, retry: false });
  const [open, setOpen] = useState(false);
  const panel = <AgentPanel open={open} onClose={() => setOpen(false)} />;
  if (isError) return <><button type="button" onClick={() => setOpen(true)} aria-label="إعداد الطابعة"><Chip tone="danger" icon="printer">الطابعة غير متصلة</Chip></button>{panel}</>;
  if (!data) return null;
  const paper = data.printer.paper;
  return (
    <>
    <button type="button" onClick={() => setOpen(true)} aria-label="إعداد الطابعة" className="hidden items-center gap-2 md:flex">
      {hardwareAgent.mode === "simulate"
        ? <Chip tone="info" icon="printer">طباعة المتصفح (محاكاة)</Chip>
        : <Chip tone={!data.printer.connected || paper === "out" ? "danger" : paper === "low" ? "warn" : "success"} icon="printer">
            {!data.printer.connected ? "الطابعة غير متصلة" : paper === "out" ? "نفد الورق" : paper === "low" ? "ورق قليل" : "الطابعة جاهزة"}
          </Chip>}
      {CASH_DRAWER_ENABLED && data.drawer.connected && <Chip tone={data.drawer.state === "open" ? "warn" : "success"} icon="archive">{data.drawer.state === "open" ? "الدرج مفتوح" : "الدرج مغلق"}</Chip>}
    </button>
    {panel}
    </>
  );
}

/** شارة حالة العتاد — غلاف متوافق فوق Badge. */
export function Chip({ tone, icon, children }: { tone: "success" | "warn" | "danger" | "info"; icon: string; children: React.ReactNode }) {
  return <Badge tone={tone} icon={icon} size="lg">{children}</Badge>;
}

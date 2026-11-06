"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BrandMark } from "../brand-mark";
import { Icon } from "../icon";
import { ThemeToggle } from "../theme-toggle";
import { Badge } from "../ui";
import { staffApi } from "@/lib/api/staff";
import type { Branch, StaffUser } from "@/lib/api/types";
import { hardwareAgent } from "@/lib/agent";
import { AgentPanel } from "./agent-panel";
import { useAuth } from "@/lib/auth/store";
import { useSync } from "@/lib/offline/sync-provider";
import { useLive } from "@/lib/realtime/provider";
import { CriticalBanner, NotificationBell } from "./notifications";
import { buildNav, findNavItem, roleMeta, type NavGroup, type NavItem } from "@/lib/roles";
import { CASH_DRAWER_ENABLED } from "@/lib/config";

/** إطار واجهات الموظفين (Reception.dc.html): قائمة جانبية بلون الدور مجمّعة حسب الأقسام المسموحة، رأس بعنوان الشاشة وحالة العتاد والاتصال، وشريط أوفلاين. */
export function Shell({ user, children }: { user: StaffUser; children: React.ReactNode }) {
  const meta = roleMeta(user);
  const path = usePathname();
  const logout = useAuth((s) => s.logout);
  const sync = useSync();
  const [open, setOpen] = useState(false);
  const section = path.split("/")[2] ?? "";
  const groups = useMemo(() => buildNav(user), [user]);
  const flat = groups.flatMap((g) => g.blocks.flatMap((b) => b.items));
  // الشاشة الحالية: أطول تطابق، حتى لو كانت صفحة تفاصيل تحت شاشة القائمة
  const current: NavItem = path === "/staff/notifications" ? { href: path, label: "الإشعارات", icon: "bell", subtitle: "المقروء وغير المقروء، والحرج في الأعلى" } : findNavItem(path) ?? flat[0] ?? { href: meta.home, label: "الرئيسية", icon: "layout-dashboard" };
  const { data } = useQuery({ queryKey: ["branches", "mine"], queryFn: () => staffApi.get<{ items: Branch[] }>("/branches"), staleTime: 5 * 60_000 });
  const branch = data?.items.find((b) => b.branch_id === user.branch_id);
  const navBg = meta.nav === "finance" ? "bg-nav-finance" : "bg-nav-medical";

  const side = (
    <aside className={`flex h-full w-64 flex-col gap-4 px-3.5 py-5 text-white ${navBg}`}>
      <div className="flex items-center gap-2.5 px-1.5">
        <BrandMark size={42} tone="onDark" paper={meta.nav === "finance" ? "rgb(var(--nav-finance))" : "rgb(var(--nav-medical))"} />
        <div className="flex min-w-0 flex-col"><span className="text-base font-bold">مجمع الرحمة</span><span className="truncate text-xs font-semibold text-on-nav-3">{meta.label}</span></div>
      </div>
      <div className="glass-dark flex items-center gap-2.5 rounded-xl px-3 py-2.5">
        <Icon name="building-2" size={18} className="text-on-nav-3" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold">{branch?.name ?? "—"}</span>
          {branch && branch.status !== "open" && <span className="text-[11px] font-semibold text-on-nav-warn">{branch.status_ar}</span>}
        </div>
      </div>
      <SideNav user={user} groups={groups} current={current} syncBadge={sync.pending + sync.needsReview} onNavigate={() => setOpen(false)} />
      <div className="mt-auto flex flex-col gap-2.5">
        <Link href="/hub" className="flex items-center gap-3 rounded-xl border border-white/15 px-3 py-2.5 text-sm font-semibold text-on-nav-2 hover:bg-white/10 hover:text-white">
          <Icon name="layout-grid" size={18} /><span className="flex-1">كل الأقسام</span>
        </Link>
        <ConnectionPill />
        <div className="flex items-center gap-2.5 p-1.5">
          <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-nav-active font-bold">{user.full_name.replace(/^د\.\s*/, "").trim().charAt(0)}</span>
          <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-sm font-semibold">{user.full_name}</span><span className="truncate text-xs text-on-nav-3">{meta.label}</span></span>
          <button onClick={() => { void logout(); /* الحارس في layout ينقل لصفحة الدخول عند تحول الحالة إلى anon */ }} title="تسجيل الخروج" aria-label="تسجيل الخروج" className="grid size-9 place-items-center rounded-full text-on-nav-3 hover:bg-white/15 hover:text-white"><Icon name="log-out" size={18} /></button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="scale-staff flex min-h-dvh">
      <div className="sticky top-0 hidden h-dvh lg:block">{side}</div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0">{side}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass-bar sticky top-2 z-30 mx-2 mt-2 flex items-center gap-3.5 rounded-panel px-4 py-3.5 sm:mx-4 sm:px-6">
          <button className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface/60 hover:bg-primary-soft lg:hidden" onClick={() => setOpen(true)} aria-label="فتح القائمة"><Icon name="menu" size={20} /></button>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="truncate text-[21px] font-bold">{current.label}</h1>
            {current.subtitle && <span className="sub truncate">{current.subtitle}</span>}
          </div>
          <NotificationBell />
          <ThemeToggle />
          {section === "reception" && <AgentChips />}
        </header>
        <CriticalBanner />
        {!sync.online && (
          <div className="mx-2 mt-2 flex items-center gap-2.5 rounded-xl border border-warn/30 bg-warn-soft px-4 py-2.5 text-sm text-warn-strong sm:mx-4 sm:px-6" role="status">
            <Icon name="wifi-off" size={18} />
            <span className="flex-1">تعمل أوفلاين. الحضور والتحصيل النقدي وأزرار الطابور تُحفظ محلياً. الاسترجاع والخصومات وفك الحظر غير متاحة.</span>
            <span className="num font-semibold">{sync.pending} في الصادر</span>
          </div>
        )}
        <main className="enter flex flex-1 flex-col gap-[18px] px-4 pb-12 pt-5 sm:px-7">{children}</main>
      </div>
    </div>
  );
}

const NAV_KEY = (uid: string) => `rahma.nav.groups.${uid}`;
const readGroups = (uid: string): Record<string, boolean> => {
  try { const v = JSON.parse(window.localStorage.getItem(NAV_KEY(uid)) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
};
const writeGroups = (uid: string, v: Record<string, boolean>) => { try { window.localStorage.setItem(NAV_KEY(uid), JSON.stringify(v)); } catch { /* تخزين محظور: لا بأس */ } };

/** التنقل الجانبي (المواصفة 8.6): مجموعات وظيفية قابلة للطي تُبنى من صلاحيات المستخدم. حالة الطي تُحفظ لكل مستخدم.
 *  المجموعة ذات العنصر الواحد تظهر رابطاً مباشراً، ومجموعة وحيدة تُعرض عناصرها مسطحة. */
function SideNav({ user, groups, current, syncBadge, onNavigate }: { user: StaffUser; groups: NavGroup[]; current: NavItem; syncBadge: number; onNavigate: () => void }) {
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
    const badge = n.badge === "sync" ? syncBadge : 0;
    return (
      <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={on ? "page" : undefined}
        className={`flex items-center gap-3 rounded-xl px-3 py-[10px] text-[14.5px] transition-colors duration-base ${on ? "bg-nav-active font-semibold text-white" : "text-on-nav-2 hover:bg-white/10 hover:text-white"}`}>
        <Icon name={n.icon} size={18} /><span className="min-w-0 flex-1 truncate">{n.label}</span>
        {badge > 0 && <span className={`num rounded-full px-[7px] py-px text-xs ${on ? "bg-white/25" : "bg-danger text-on-accent"}`}>{badge}</span>}
      </Link>
    );
  };

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
function ConnectionPill() {
  const { online, pending, needsReview } = useSync();
  const { state } = useLive();
  const bad = !online || state !== "connected";
  const label = !online ? `أوفلاين · ${pending} في الصادر`
    : state === "connected" ? (pending ? `متصل · ${pending} بانتظار الإرسال` : "متصل · التحديث مباشر")
    : state === "reconnecting" || state === "connecting" ? "جارٍ الاتصال بالتحديث اللحظي" : "التحديث اللحظي متوقف";
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

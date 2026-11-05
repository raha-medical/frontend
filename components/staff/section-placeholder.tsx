import { Icon } from "../icon";

/** صفحة مؤقتة للقسم حتى تُبنى شاشاته (ترتيب العمل في docs/ROADMAP.md). */
export function SectionPlaceholder({ title, icon, items }: { title: string; icon: string; items: string[] }) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-card border border-line bg-surface p-7">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary-strong"><Icon name={icon} size={24} /></span>
        <div className="flex flex-col"><h1 className="text-2xl font-bold">{title}</h1><span className="sub">قيد البناء — الأساس والدخول والصلاحيات جاهزة</span></div>
      </div>
      <p className="sub">الشاشات المخطط لها في هذا القسم (حسب التصميم وجدول التغطية):</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((t) => <li key={t} className="flex items-center gap-2 rounded-xl bg-bg px-3 py-2.5 text-sm font-semibold"><Icon name="hammer" size={15} className="text-ink-muted" />{t}</li>)}
      </ul>
    </div>
  );
}

"use client";
/** DataGrid — جدول بيانات موحّد:
 *  رأس ثابت (sticky) داخل حاوية تمرير خاصة به (أفقي وعمودي)، محاذاة صحيحة (الأعمدة الرقمية LTR بأرقام جدولية)،
 *  تظليل الصفوف (zebra) ومرور الماوس، بحث مدمج مع تطبيع العربية، خانات فلاتر، فرز اختياري،
 *  ترقيم صفحات من جهة العميل مع حجم الصفحة، حالات التحميل والفراغ والخطأ، واختيار صف بالنقر أو لوحة المفاتيح.
 *  لا يجلب بيانات بنفسه: يعرض rows كما تأتي من react-query. */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "../icon";
import { Empty, Skeleton } from "./core";
import { ISelect, normalizeAr } from "./iselect";

export type Column<T> = {
  key: string;
  header: ReactNode;
  /** محتوى الخلية. الافتراضي: row[key]. */
  cell?: (row: T, index: number) => ReactNode;
  /** قيمة نصية/رقمية للبحث والفرز. الافتراضي: row[key] إن كان نصاً أو رقماً. */
  value?: (row: T) => string | number | null | undefined;
  /** عمود رقمي: محاذاة للنهاية، أرقام جدولية، اتجاه LTR. */
  numeric?: boolean;
  align?: "start" | "center" | "end";
  /** عرض العمود (CSS) مثل "120px" أو "30%". */
  width?: string;
  sortable?: boolean;
  /** يُخفى تحت نقطة كسر. */
  hideBelow?: "sm" | "md" | "lg" | "xl";
  /** عمود الإجراءات: يبقى ظاهراً عند التمرير الأفقي. */
  sticky?: boolean;
  className?: string;
  headerClassName?: string;
};

export type DataGridProps<T> = {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  error?: ReactNode;
  empty?: { icon?: string; title: string; hint?: string };
  /** بحث مدمج. true أو إعدادات. */
  search?: boolean | { placeholder?: string; text?: (row: T) => string };
  /** خانة الفلاتر (ISelect / تواريخ) بجانب البحث. */
  filters?: ReactNode;
  /** أزرار في طرف شريط الأدوات. */
  actions?: ReactNode;
  title?: ReactNode;
  /** 0 = بلا ترقيم صفحات. */
  pageSize?: number;
  pageSizes?: number[];
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  /** صف تفاصيل موسّع تحت الصف (مع onRowClick لفتحه). null = بلا تفاصيل. */
  expanded?: (row: T) => ReactNode;
  rowClassName?: (row: T) => string;
  /** أقل عرض للجدول قبل التمرير الأفقي. */
  minWidth?: number;
  /** أقصى ارتفاع لمنطقة الصفوف (ليعمل الرأس الثابت). */
  maxHeight?: string;
  zebra?: boolean;
  dense?: boolean;
  /** صف ملخص أسفل الجدول (مجاميع). */
  footer?: ReactNode;
  "aria-label"?: string;
  className?: string;
};

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" };
const STICKY_TH = "sticky end-0 z-[2] shadow-[-8px_0_8px_-8px_rgb(var(--shadow-ink)/.18)]";
const STICKY_TD = "sticky end-0 z-[1] bg-surface shadow-[-8px_0_8px_-8px_rgb(var(--shadow-ink)/.18)] group-hover:bg-primary-soft";
const alignCls = (c: { numeric?: boolean; align?: string }) => (c.align === "center" ? "text-center" : c.align === "end" || (c.numeric && !c.align) ? "text-end" : "text-start");

function rawValue<T>(c: Column<T>, row: T): string | number | null | undefined {
  if (c.value) return c.value(row);
  const v = (row as Record<string, unknown>)[c.key];
  return typeof v === "string" || typeof v === "number" ? v : undefined;
}

export function DataGrid<T>({
  rows, columns, rowKey, loading, error, empty = { title: "لا توجد بيانات" }, search, filters, actions, title,
  pageSize: initialPageSize = 20, pageSizes = [10, 20, 50, 100], onRowClick, selectedKey, expanded, rowClassName,
  minWidth = 640, maxHeight = "min(70vh, 760px)", zebra = true, dense, footer, className = "", ...rest
}: DataGridProps<T>) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(initialPageSize);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const searchCfg = typeof search === "object" ? search : search ? {} : null;

  const filtered = useMemo(() => {
    let r = rows ?? [];
    if (searchCfg && q.trim()) {
      const n = normalizeAr(q);
      r = r.filter((row) => normalizeAr(searchCfg.text ? searchCfg.text(row) : columns.map((c) => rawValue(c, row) ?? "").join(" ")).includes(n));
    }
    if (sort) {
      const c = columns.find((x) => x.key === sort.key);
      if (c) r = [...r].sort((a, b) => {
        const x = rawValue(c, a), y = rawValue(c, b);
        if (x == null) return 1; if (y == null) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "ar")) * sort.dir;
      });
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sort, columns]);

  const paged = size > 0;
  const pages = paged ? Math.max(1, Math.ceil(filtered.length / size)) : 1;
  useEffect(() => { if (page > pages - 1) setPage(pages - 1); }, [page, pages]);
  const view = paged ? filtered.slice(page * size, page * size + size) : filtered;
  const showToolbar = !!(title || searchCfg || filters || actions);
  const cellPad = dense ? "px-3 py-2" : "px-4 py-3";

  return (
    <div className={`glass flex min-w-0 flex-col overflow-hidden rounded-card shadow-glass ${className}`}>
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
          {title && <span className="me-auto text-base font-bold">{title}</span>}
          {searchCfg && (
            <label className={`flex h-10 min-w-[200px] flex-1 items-center gap-2 rounded-xl border-[1.5px] border-line-strong bg-surface px-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15 ${title ? "max-w-xs" : "max-w-sm"}`}>
              <Icon name="search" size={16} className="shrink-0 text-ink-muted" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder={searchCfg.placeholder ?? "بحث في الجدول…"} aria-label={searchCfg.placeholder ?? "بحث في الجدول"}
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted" />
              {q && <button type="button" onClick={() => setQ("")} aria-label="مسح البحث" className="text-ink-muted hover:text-ink"><Icon name="x" size={15} /></button>}
            </label>
          )}
          {filters}
          {actions && <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="min-w-0 overflow-auto overscroll-contain" style={{ maxHeight }}>
        <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth }} aria-label={rest["aria-label"]} aria-busy={loading || undefined}>
          <thead>
            <tr>
              {columns.map((c) => {
                const s = sort?.key === c.key ? sort.dir : 0;
                return (
                  <th key={c.key} scope="col" style={{ width: c.width }} aria-sort={s ? (s > 0 ? "ascending" : "descending") : undefined}
                    className={`sticky top-0 whitespace-nowrap border-b border-line bg-bg/95 text-xs font-semibold text-ink-2 backdrop-blur ${c.sticky ? STICKY_TH : "z-[1]"} ${cellPad} ${alignCls(c)} ${c.hideBelow ? HIDE[c.hideBelow] : ""} ${c.headerClassName ?? ""}`}>
                    {c.sortable ? (
                      <button type="button" onClick={() => setSort(s === 0 ? { key: c.key, dir: 1 } : s > 0 ? { key: c.key, dir: -1 } : null)}
                        className="inline-flex items-center gap-1 hover:text-ink">
                        {c.header}<Icon name={s > 0 ? "arrow-up" : s < 0 ? "arrow-down" : "chevrons-up-down"} size={13} className={s ? "text-primary" : "text-ink-muted"} />
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && !rows?.length ? Array.from({ length: 5 }, (_, i) => (
              <tr key={`sk${i}`}>{columns.map((c) => <td key={c.key} className={`border-b border-line ${cellPad} ${c.hideBelow ? HIDE[c.hideBelow] : ""}`}><Skeleton className={`h-4 ${c.numeric ? "ms-auto w-16" : "w-3/4"}`} /></td>)}</tr>
            )) : error ? (
              <tr><td colSpan={columns.length} className="p-4"><div role="alert" className="flex items-center gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-[14px] text-danger-strong"><Icon name="circle-alert" size={17} />{error}</div></td></tr>
            ) : !view.length ? (
              <tr><td colSpan={columns.length}><Empty icon={q ? "search" : empty.icon} title={q ? "لا نتائج مطابقة للبحث" : empty.title} hint={q ? undefined : empty.hint} /></td></tr>
            ) : view.map((row, i) => {
              const k = rowKey(row, i);
              const sel = selectedKey != null && k === selectedKey;
              const detail = expanded?.(row);
              return (
                <Fragment key={k}>
                <tr aria-current={sel || undefined} aria-expanded={expanded ? !!detail : undefined} tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); } } : undefined}
                  className={`group transition-colors duration-fast ${onRowClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" : ""} ${sel ? "bg-primary-soft shadow-[inset_-3px_0_0_rgb(var(--primary))]" : zebra && i % 2 ? "bg-bg/60" : ""} hover:bg-primary-soft/60 ${rowClassName?.(row) ?? ""}`}>
                  {columns.map((c) => (
                    <td key={c.key} className={`border-b border-line align-middle text-ink ${cellPad} ${alignCls(c)} ${c.numeric ? "whitespace-nowrap" : ""} ${c.sticky ? STICKY_TD : ""} ${c.hideBelow ? HIDE[c.hideBelow] : ""} ${c.className ?? ""}`}>
                      {c.numeric ? <span className="num">{c.cell ? c.cell(row, page * size + i) : (rawValue(c, row) ?? "—")}</span> : c.cell ? c.cell(row, page * size + i) : (rawValue(c, row) ?? "—")}
                    </td>
                  ))}
                </tr>
                {detail != null && <tr><td colSpan={columns.length} className="border-b border-line bg-bg p-0">{detail}</td></tr>}
                </Fragment>
              );
            })}
          </tbody>
          {footer && view.length > 0 && <tfoot className="sticky bottom-0 bg-bg/95 font-semibold backdrop-blur">{footer}</tfoot>}
        </table>
      </div>
      {paged && filtered.length > Math.min(...pageSizes, size) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5 text-[13px] text-ink-2">
          <span>عرض <span className="num font-semibold text-ink">{page * size + 1}–{Math.min(filtered.length, (page + 1) * size)}</span> من <span className="num font-semibold text-ink">{filtered.length}</span></span>
          <div className="w-[120px]"><ISelect size="sm" aria-label="عدد الصفوف في الصفحة" value={String(size)} onChange={(v) => { setSize(Number(v) || initialPageSize); setPage(0); }} options={pageSizes.map((n) => ({ value: String(n), label: `${n} صف` }))} searchable={false} /></div>
          <div className="ms-auto flex items-center gap-1" role="navigation" aria-label="الصفحات">
            <PageBtn icon="chevron-right" label="الصفحة السابقة" disabled={page === 0} onClick={() => setPage((p) => p - 1)} />
            <span className="num px-2 font-semibold text-ink">{page + 1} / {pages}</span>
            <PageBtn icon="chevron-left" label="الصفحة التالية" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} />
          </div>
        </div>
      )}
    </div>
  );
}

function PageBtn({ icon, label, disabled, onClick }: { icon: string; label: string; disabled: boolean; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="grid size-9 place-items-center rounded-xl border border-line bg-surface hover:border-primary/50 hover:bg-primary-soft disabled:opacity-40"><Icon name={icon} size={16} /></button>;
}

/** خلية نص رئيسي + نص فرعي (اسم + هاتف…). */
export function CellStack({ title, sub, icon }: { title: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      {icon}
      <span className="flex min-w-0 flex-col"><span className="truncate font-semibold">{title}</span>{sub != null && sub !== "" && <span className="sub-sm truncate">{sub}</span>}</span>
    </span>
  );
}

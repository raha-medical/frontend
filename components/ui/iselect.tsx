"use client";
/** ISelect — قائمة اختيار قابلة للبحث (combobox) بنمط WAI-ARIA:
 *  - اختيار مفرد أو متعدد (multiple)، زر مسح، بحث مع تطبيع العربية (أ/إ/آ، ة/ه، ى/ي).
 *  - لوحة المفاتيح: ↓/↑ تنقل، Home/End، Enter اختيار، Esc إغلاق، Backspace يحذف آخر شارة (متعدد)، Tab يغلق.
 *  - تعمل داخل النماذج: name يولّد input مخفياً (أو عدة حقول في المتعدد) وrequired يُتحقق منه.
 *  - مناسبة للبيانات غير المتزامنة: options قد تكون undefined أثناء التحميل (loading)، وonSearch يُبلغ الأب بالنص
 *    ليجلب الخيارات من السيرفر (filter={false} لتعطيل التصفية المحلية).
 *  - القائمة تُرسم في portal بموضع ثابت، فلا تُقص داخل النوافذ والجداول ذات التمرير. */
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icon";

export type ISelectOption<V extends string = string> = { value: V; label: string; hint?: string; icon?: string; disabled?: boolean; group?: string };

type Common<V extends string> = {
  options: ISelectOption<V>[] | undefined;
  label?: ReactNode;
  placeholder?: string;
  /** افتراضياً يظهر البحث عند أكثر من 6 خيارات أو عند تمرير onSearch. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** يُستدعى مع نص البحث (للجلب من السيرفر). */
  onSearch?: (q: string) => void;
  /** false: لا تصفية محلية (الخيارات مصفاة من السيرفر). */
  filter?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  hint?: string;
  required?: boolean;
  name?: string;
  id?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  noOptionsText?: string;
  "aria-label"?: string;
};
type Single<V extends string> = Common<V> & { multiple?: false; value: V | "" | null | undefined; onChange: (v: V | "") => void };
type Multi<V extends string> = Common<V> & { multiple: true; value: V[]; onChange: (v: V[]) => void; maxBadges?: number };
export type ISelectProps<V extends string = string> = Single<V> | Multi<V>;

/** تطبيع عربي للبحث: يُزيل التشكيل ويوحّد الألف والتاء المربوطة والياء. */
export const normalizeAr = (s: string) => s.toLowerCase().replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي").trim();

const H = { sm: "min-h-9 text-[13px]", md: "min-h-[42px] text-sm", lg: "min-h-12 text-body" };

export function ISelect<V extends string = string>(props: ISelectProps<V>) {
  const { options, label, placeholder = "اختر…", searchPlaceholder = "بحث…", onSearch, filter = true, clearable, disabled, loading, error, hint, required, name, size = "lg", className = "", noOptionsText = "لا توجد نتائج" } = props;
  const multiple = props.multiple === true;
  const selected: V[] = multiple ? (props as Multi<V>).value : (props as Single<V>).value ? [(props as Single<V>).value as V] : [];
  const searchable = props.searchable ?? (!!onSearch || (options?.length ?? 0) > 6);
  const uid = useId();
  const id = props.id ?? `is-${uid}`;
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; up: boolean; maxH: number } | null>(null);

  const byValue = useMemo(() => new Map((options ?? []).map((o) => [o.value, o])), [options]);
  const shown = useMemo(() => {
    const all = options ?? [];
    if (!filter || !q.trim()) return all;
    const n = normalizeAr(q);
    return all.filter((o) => normalizeAr(`${o.label} ${o.hint ?? ""} ${o.group ?? ""}`).includes(n));
  }, [options, q, filter]);

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect();
    if (!r) return;
    const below = innerHeight - r.bottom - 12, above = r.top - 12;
    const up = below < 240 && above > below;
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: Math.max(r.width, 220), up, maxH: Math.max(160, Math.min(340, up ? above : below)) });
  }, []);
  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { const t = e.target as Node; if (!trigger.current?.contains(t) && !pop.current?.contains(t)) close(false); };
    addEventListener("resize", place); addEventListener("scroll", place, true); document.addEventListener("mousedown", onDoc);
    return () => { removeEventListener("resize", place); removeEventListener("scroll", place, true); document.removeEventListener("mousedown", onDoc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place]);
  useEffect(() => { if (open) requestAnimationFrame(() => (searchable ? search.current : list.current)?.focus()); }, [open, searchable]);
  useEffect(() => { setActive((a) => Math.min(Math.max(0, a), Math.max(0, shown.length - 1))); }, [shown.length]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  const openList = () => {
    if (disabled) return;
    const i = selected.length ? shown.findIndex((o) => o.value === selected[0]) : 0;
    setActive(Math.max(0, i)); setOpen(true);
  };
  function close(refocus = true) { setOpen(false); setQ(""); onSearch?.(""); if (refocus) trigger.current?.querySelector<HTMLElement>("[data-trigger]")?.focus(); }
  const pick = (o: ISelectOption<V> | undefined) => {
    if (!o || o.disabled) return;
    if (multiple) {
      const p = props as Multi<V>;
      p.onChange(selected.includes(o.value) ? selected.filter((v) => v !== o.value) : [...selected, o.value]);
    } else { (props as Single<V>).onChange(o.value); close(); }
  };
  const clear = () => { if (multiple) (props as Multi<V>).onChange([]); else (props as Single<V>).onChange(""); };
  const removeOne = (v: V) => (props as Multi<V>).onChange(selected.filter((x) => x !== v));

  const move = (d: number) => {
    if (!shown.length) return;
    let i = active;
    for (let k = 0; k < shown.length; k++) { i = (i + d + shown.length) % shown.length; if (!shown[i].disabled) break; }
    setActive(i);
  };
  const onListKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); pick(shown[active]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") close(false);
    else if (e.key === "Backspace" && multiple && !q && selected.length) removeOne(selected[selected.length - 1]);
  };
  const onTriggerKey = (e: KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); openList(); }
    else if ((e.key === "Backspace" || e.key === "Delete") && clearable && selected.length) { e.preventDefault(); clear(); }
  };

  const maxBadges = multiple ? (props as Multi<V>).maxBadges ?? 3 : 0;
  const display = multiple ? null : selected[0] ? byValue.get(selected[0]) : undefined;
  const activeId = shown[active] ? `${id}-o-${active}` : undefined;

  return (
    <div className={`relative flex min-w-0 flex-col gap-1.5 ${className}`}>
      {label && <label id={`${id}-label`} onClick={() => !disabled && openList()} className="sub">{label}{required && <span className="text-danger-strong"> *</span>}</label>}
      <div ref={trigger} className={`group relative flex items-center gap-1.5 rounded-field border-[1.5px] bg-surface pe-2 ps-3 transition-[border-color,box-shadow] duration-base ${H[size]} ${disabled ? "opacity-60" : "cursor-pointer hover:border-primary/50"} ${open ? "border-primary ring-4 ring-primary/15" : error ? "border-danger" : "border-line-strong"}`}
        onClick={() => (open ? close() : openList())}>
        <div id={id} data-trigger role="combobox" tabIndex={disabled ? -1 : 0} aria-expanded={open} aria-haspopup="listbox" aria-controls={listId}
          aria-label={props["aria-label"]} aria-labelledby={label && !props["aria-label"] ? `${id}-label` : undefined} aria-invalid={error ? true : undefined} aria-required={required || undefined} aria-disabled={disabled || undefined}
          onKeyDown={onTriggerKey}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-1.5 outline-none">
          {multiple ? (
            selected.length ? <>
              {selected.slice(0, maxBadges).map((v) => (
                <span key={v} className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-soft py-0.5 pe-1 ps-2.5 text-[13px] font-semibold text-primary-strong">
                  <span className="truncate">{byValue.get(v)?.label ?? v}</span>
                  <button type="button" tabIndex={-1} aria-label={`إزالة ${byValue.get(v)?.label ?? v}`} onClick={(e) => { e.stopPropagation(); removeOne(v); }} className="grid size-5 place-items-center rounded-full hover:bg-primary/20"><Icon name="x" size={12} /></button>
                </span>
              ))}
              {selected.length > maxBadges && <span className="num rounded-full bg-bg px-2 py-0.5 text-xs font-semibold text-ink-2">+{selected.length - maxBadges}</span>}
            </> : <span className="truncate text-ink-muted">{placeholder}</span>
          ) : display ? (
            <span className="flex min-w-0 items-center gap-2 text-ink">{display.icon && <Icon name={display.icon} size={16} className="shrink-0 text-ink-3" />}<span className="truncate">{display.label}</span></span>
          ) : <span className="truncate text-ink-muted">{selected[0] ?? placeholder}</span>}
        </div>
        {loading && <Icon name="loader-circle" size={16} className="shrink-0 animate-spin text-ink-muted" />}
        {clearable && selected.length > 0 && !disabled && (
          <button type="button" aria-label="مسح الاختيار" onClick={(e) => { e.stopPropagation(); clear(); }} className="grid size-7 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-bg hover:text-ink"><Icon name="x" size={15} /></button>
        )}
        <Icon name="chevron-down" size={16} className={`shrink-0 text-ink-muted transition-transform duration-base ${open ? "rotate-180" : ""}`} />
      </div>
      {name && (multiple ? selected.map((v) => <input key={v} type="hidden" name={name} value={v} />) : <input type="hidden" name={name} value={selected[0] ?? ""} />)}
      {/* حقل مخفي للتحقق الأصلي من required داخل <form> */}
      {required && <input tabIndex={-1} aria-hidden required value={selected.length ? "1" : ""} onChange={() => undefined} className="pointer-events-none absolute h-px w-px opacity-0" />}
      {error ? <span className="text-xs font-semibold text-danger-strong">{error}</span> : hint ? <span className="sub-sm">{hint}</span> : null}

      {open && pos && typeof document !== "undefined" && createPortal(
        <div ref={pop} dir="rtl" onKeyDown={onListKey}
          className="enter fixed z-[70] flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
          style={{ left: pos.left, width: pos.width, ...(pos.up ? { bottom: innerHeight - pos.top } : { top: pos.top }), maxHeight: pos.maxH }}>
          {searchable && (
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Icon name="search" size={16} className="shrink-0 text-ink-muted" />
              <input ref={search} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); onSearch?.(e.target.value); }} placeholder={searchPlaceholder}
                role="searchbox" aria-controls={listId} aria-activedescendant={activeId} aria-label={searchPlaceholder}
                className="h-11 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted" />
            </div>
          )}
          <ul ref={list} id={listId} role="listbox" tabIndex={-1} aria-multiselectable={multiple || undefined} aria-activedescendant={searchable ? undefined : activeId}
            className="min-h-0 flex-1 overflow-y-auto p-1.5 outline-none">
            {options === undefined || (loading && !shown.length) ? <li className="flex items-center gap-2 px-3 py-3 text-sm text-ink-2"><Icon name="loader-circle" size={16} className="animate-spin" />جارٍ التحميل…</li>
              : !shown.length ? <li className="px-3 py-3 text-sm text-ink-2">{noOptionsText}</li>
              : shown.map((o, i) => {
                const on = selected.includes(o.value);
                const prevGroup = i > 0 ? shown[i - 1].group : undefined;
                return (
                  <li key={o.value} role="presentation">
                    {o.group && o.group !== prevGroup && <div className="px-3 pb-1 pt-2 text-[11px] font-bold text-ink-3">{o.group}</div>}
                    <div id={`${id}-o-${i}`} data-i={i} role="option" aria-selected={on} aria-disabled={o.disabled || undefined}
                      onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ${o.disabled ? "cursor-not-allowed opacity-50" : ""} ${i === active ? "bg-primary-soft text-ink" : "text-ink"} ${on ? "font-semibold" : ""}`}>
                      {multiple && <span className={`grid size-[18px] shrink-0 place-items-center rounded-chip border-[1.5px] ${on ? "border-primary bg-primary text-on-accent" : "border-line-strong"}`}>{on && <Icon name="check" size={12} strokeWidth={3} />}</span>}
                      {o.icon && <Icon name={o.icon} size={16} className="shrink-0 text-ink-3" />}
                      <span className="flex min-w-0 flex-1 flex-col"><span className="truncate">{o.label}</span>{o.hint && <span className="truncate text-xs text-ink-3">{o.hint}</span>}</span>
                      {!multiple && on && <Icon name="check" size={16} className="shrink-0 text-primary" />}
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>, document.body)}
    </div>
  );
}

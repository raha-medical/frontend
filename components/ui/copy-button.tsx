"use client";
/** زر نسخ صغير بجانب المعرّفات: رقم الوصل والمراجع والحجز (UI-118). */
import { useEffect, useRef, useState } from "react";
import { Icon } from "../icon";

export function CopyButton({ value, label = "نسخ", className = "" }: { value: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // المتصفح منع الوصول للحافظة: نسخ احتياطي عبر حقل مؤقت
      const t = document.createElement("textarea");
      t.value = value;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1500);
  }

  return (
    <button type="button" onClick={copy} aria-label={done ? "تم النسخ" : label} title={done ? "تم النسخ" : label}
      className={`inline-grid size-7 shrink-0 place-items-center rounded-chip transition-colors duration-fast hover:bg-primary-soft ${done ? "text-success" : "text-ink-muted hover:text-primary-strong"} ${className}`}>
      <Icon name={done ? "check" : "copy"} size={14} />
    </button>
  );
}

/** معرّف بخط الأرقام مع زر نسخه. */
export function CopyId({ value, label }: { value: string; label?: string }) {
  return <span className="inline-flex items-center gap-1"><span className="num">{value}</span><CopyButton value={value} label={label} /></span>;
}

"use client";
import { useEffect, useState } from "react";
import { Icon } from "./icon";

const KEY = "rahma-theme"; // نفس مفتاح theme.js في التصميم

export function ThemeToggle({ label = false, className = "" }: { label?: boolean; className?: string }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
    const onStorage = (e: StorageEvent) => { if (e.key === KEY && e.newValue) { document.documentElement.dataset.theme = e.newValue; setDark(e.newValue === "dark"); } };
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, []);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
    setDark(!dark);
  };
  const text = dark ? "الوضع الفاتح" : "الوضع الداكن";
  return (
    <button type="button" onClick={toggle} title={text} aria-label={text}
      className={`inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-line bg-surface text-[13px] font-semibold text-ink-2 hover:bg-primary-soft ${label ? "px-3.5" : "w-10"} ${className}`}>
      <Icon name={dark ? "sun" : "moon"} size={18} />
      {label && text}
    </button>
  );
}

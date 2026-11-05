"use client";
import { create } from "zustand";
import { Icon } from "./icon";

type T = { id: number; tone: "success" | "danger" | "info" | "warn"; text: string };
const useToasts = create<{ items: T[]; push: (t: Omit<T, "id">) => void; drop: (id: number) => void }>((set) => ({
  items: [],
  push: (t) => { const id = Date.now() + Math.random(); set((s) => ({ items: [...s.items, { ...t, id }] })); setTimeout(() => set((s) => ({ items: s.items.filter((x) => x.id !== id) })), 5000); },
  drop: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

export const toast = {
  success: (text: string) => useToasts.getState().push({ tone: "success", text }),
  error: (text: string) => useToasts.getState().push({ tone: "danger", text }),
  info: (text: string) => useToasts.getState().push({ tone: "info", text }),
  warn: (text: string) => useToasts.getState().push({ tone: "warn", text }),
};

import { TONE_ICON as I, TONE_SOFT as C } from "./ui/tones";

export function ToastHost() {
  const { items, drop } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`enter pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl border border-line/60 px-4 py-3 text-sm font-semibold shadow-pop ${C[t.tone]}`}>
          <Icon name={I[t.tone]} size={18} /><span className="flex-1">{t.text}</span>
          <button onClick={() => drop(t.id)} aria-label="إغلاق"><Icon name="x" size={16} /></button>
        </div>
      ))}
    </div>
  );
}

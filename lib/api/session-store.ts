/** مخزن الجلسة (التوكنات + المستخدم) في localStorage، مع نسخة في الذاكرة. يبقى المستخدم للعمل أوفلاين (العقد 1). */
export interface Session<U> {
  access_token: string;
  refresh_token: string;
  access_expires_at: number; // ms
  refresh_expires_at: number; // ms
  user: U;
}

export interface SessionStore<U> {
  get(): Session<U> | null;
  set(s: Session<U>): void;
  patchUser(u: U): void;
  clear(): void;
  subscribe(fn: (s: Session<U> | null) => void): () => void;
}

export function createSessionStore<U>(key: string): SessionStore<U> {
  let cache: Session<U> | null | undefined;
  const subs = new Set<(s: Session<U> | null) => void>();
  const read = (): Session<U> | null => {
    if (cache !== undefined) return cache;
    try {
      const raw = typeof window === "undefined" ? null : window.localStorage.getItem(key);
      cache = raw ? (JSON.parse(raw) as Session<U>) : null;
    } catch { cache = null; }
    return cache;
  };
  const write = (s: Session<U> | null) => {
    cache = s;
    try {
      if (typeof window !== "undefined") {
        if (s) window.localStorage.setItem(key, JSON.stringify(s)); else window.localStorage.removeItem(key);
      }
    } catch { /* التخزين قد يكون ممنوعاً: نكمل بالذاكرة */ }
    subs.forEach((f) => f(s));
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key !== key) return;
      cache = undefined;
      const s = read();
      subs.forEach((f) => f(s));
    });
  }
  return {
    get: read,
    set: (s) => write(s),
    patchUser: (u) => { const s = read(); if (s) write({ ...s, user: u }); },
    clear: () => write(null),
    subscribe: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}

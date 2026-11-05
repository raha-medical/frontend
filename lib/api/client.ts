import { uuidv7 } from "../id";
import { ApiError } from "./errors";
import type { Session, SessionStore } from "./session-store";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** false = بلا توكن (Public). */
  auth?: boolean;
  /** string = مفتاح محدد (لإعادة المحاولة بنفس المفتاح)، false = بلا مفتاح. الافتراضي: مفتاح جديد لكل POST. */
  idempotencyKey?: string | false;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** نوع الرد غير JSON */
  as?: "blob" | "text";
}

export interface ApiClientConfig<U> {
  baseUrl: string;
  store: SessionStore<U>;
  refreshPath: string;
  /** يحوّل رد refresh إلى جلسة (يختلف بين الموظف والمريض). */
  toSession: (raw: any, prev: Session<U> | null) => Session<U>;
  onExpired?: () => void;
}

type RefreshResult = "ok" | "invalid" | "network";

export interface ApiClient {
  request<T = unknown>(path: string, opts?: RequestOptions): Promise<T>;
  get<T = unknown>(path: string, query?: RequestOptions["query"], opts?: RequestOptions): Promise<T>;
  post<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  put<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  patch<T = unknown>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  del<T = unknown>(path: string, opts?: RequestOptions): Promise<T>;
  /** تجديد فوري (مثلاً بعد تغيير كلمة المرور). */
  refreshNow(): Promise<boolean>;
  getAccessToken(): string | null;
}

const isPublicAuthPath = (p: string) => p.startsWith("/auth/") || p.startsWith("/patient-auth/");

export function createApiClient<U>(cfg: ApiClientConfig<U>): ApiClient {
  let refreshing: Promise<RefreshResult> | null = null;

  async function toProblem(res: Response): Promise<ApiError> {
    let body: any = null;
    try { body = await res.json(); } catch { /* ليس JSON */ }
    const ra = res.headers.get("Retry-After");
    const retryAfter = body?.retry_after ?? (ra ? Number(ra) : undefined);
    const { type, title, status, code, detail, trace_id, errors, ...extra } = body ?? {};
    void type; void status;
    return new ApiError({
      status: res.status,
      code: code ?? (res.status === 401 ? "UNAUTHORIZED" : res.status === 403 ? "FORBIDDEN" : res.status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR"),
      title, detail, errors, traceId: trace_id, retryAfter, extra,
    });
  }

  function doRefresh(): Promise<RefreshResult> {
    if (refreshing) return refreshing;
    refreshing = (async (): Promise<RefreshResult> => {
      const prev = cfg.store.get();
      if (!prev) return "invalid";
      try {
        const res = await fetch(cfg.baseUrl + cfg.refreshPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: prev.refresh_token }),
        });
        if (!res.ok) {
          if (res.status >= 500) return "network";
          return "invalid";
        }
        cfg.store.set(cfg.toSession(await res.json(), prev));
        return "ok";
      } catch {
        return "network";
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
    return refreshing;
  }

  async function ensureFresh() {
    const s = cfg.store.get();
    if (s && s.access_expires_at - Date.now() < 10_000 && (typeof navigator === "undefined" || navigator.onLine)) {
      await doRefresh();
    }
  }

  async function send(path: string, o: RequestOptions, retried: boolean): Promise<Response> {
    const auth = o.auth !== false;
    if (auth && !retried) await ensureFresh();
    const method = o.method ?? "GET";
    const headers: Record<string, string> = { Accept: "application/json", ...o.headers };
    if (o.body !== undefined && !(o.body instanceof FormData)) headers["Content-Type"] = "application/json";
    if (auth) {
      const t = cfg.store.get()?.access_token;
      if (t) headers.Authorization = `Bearer ${t}`;
    }
    if (method === "POST" && o.idempotencyKey !== false && !isPublicAuthPath(path)) {
      headers["Idempotency-Key"] = o.idempotencyKey ?? uuidv7();
    }
    let url = cfg.baseUrl + path;
    if (o.query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(o.query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
      const s = qs.toString();
      if (s) url += (url.includes("?") ? "&" : "?") + s;
    }
    let res: Response;
    try {
      res = await fetch(url, {
        method, headers, signal: o.signal,
        body: o.body === undefined ? undefined : o.body instanceof FormData ? o.body : JSON.stringify(o.body),
      });
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      throw new ApiError({ status: 0, code: "NETWORK", title: "تعذر الاتصال بالخادم" });
    }
    if (res.status === 401 && auth && !retried && cfg.store.get()) {
      const r = await doRefresh();
      if (r === "ok") return send(path, o, true);
      if (r === "invalid") { cfg.store.clear(); cfg.onExpired?.(); }
      if (r === "network") throw new ApiError({ status: 0, code: "NETWORK", title: "تعذر الاتصال بالخادم" });
    }
    return res;
  }

  async function request<T>(path: string, o: RequestOptions = {}): Promise<T> {
    // مفتاح واحد ثابت لكل استدعاء منطقي: إعادة المحاولة بعد 401 تحمل نفس المفتاح
    const opts: RequestOptions = o.method === "POST" && o.idempotencyKey === undefined && !isPublicAuthPath(path) ? { ...o, idempotencyKey: uuidv7() } : o;
    const res = await send(path, opts, false);
    if (!res.ok) throw await toProblem(res);
    if (res.status === 204) return undefined as T;
    if (opts.as === "blob") return (await res.blob()) as T;
    if (opts.as === "text") return (await res.text()) as T;
    const ct = res.headers.get("content-type") ?? "";
    return (ct.includes("json") ? await res.json() : undefined) as T;
  }

  return {
    request,
    get: (p, query, o) => request(p, { ...o, method: "GET", query }),
    post: (p, body, o) => request(p, { ...o, method: "POST", body }),
    put: (p, body, o) => request(p, { ...o, method: "PUT", body }),
    patch: (p, body, o) => request(p, { ...o, method: "PATCH", body }),
    del: (p, o) => request(p, { ...o, method: "DELETE" }),
    refreshNow: async () => (await doRefresh()) === "ok",
    getAccessToken: () => cfg.store.get()?.access_token ?? null,
  };
}

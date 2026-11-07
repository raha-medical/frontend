"use client";
import { create } from "zustand";
import { staffApi, staffSessionFrom, staffStore } from "../api/staff";
import { ApiError, isApiError } from "../api/errors";
import type { LoginRequest, LoginResponse, StaffRole, StaffUser } from "../api/types";
import { API_URL, DEVICE_CODE } from "../config";

const LAST_BRANCH_KEY = "rahma.staff.last_branch";
const readLastBranch = (): string | null => { try { return window.localStorage.getItem(LAST_BRANCH_KEY); } catch { return null; } };
const writeLastBranch = (id: string) => { try { window.localStorage.setItem(LAST_BRANCH_KEY, id); } catch { /* ignore */ } };
import { clearSnapshot } from "../offline/db";
import { hasPerm } from "../roles";

type Status = "loading" | "authed" | "anon";

interface AuthState {
  status: Status;
  user: StaffUser | null;
  hydrate: () => Promise<void>;
  login: (username: string, password: string, branchId?: string) => Promise<StaffUser>;
  logout: () => Promise<void>;
  switchBranch: (branchId: string) => Promise<StaffUser>;
  changePassword: (current: string, next: string) => Promise<StaffUser>;
  can: (permission: string) => boolean;
  hasRole: (...roles: StaffRole[]) => boolean;
  /**
   * الجلسة واحدة لكل متصفح (localStorage). إذا سُجّل الدخول بحساب آخر في تبويب آخر، يبقى هذا التبويب على مستخدمه
   * ويعرض رسالة بدل أن يتحول فجأة لحساب الآخر وينتقل لشاشته. otherAccount = الحساب الجديد.
   */
  otherAccount: StaffUser | null;
  acceptOtherAccount: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "loading",
  user: null,
  otherAccount: null,
  acceptOtherAccount: () => { const s = staffStore.get(); set(s ? { status: "authed", user: s.user, otherAccount: null } : { status: "anon", user: null, otherAccount: null }); },

  async hydrate() {
    const s = staffStore.get();
    if (!s) { set({ status: "anon", user: null }); return; }
    // نبدأ من النسخة المحفوظة (تعمل أوفلاين) ثم نحدّثها من /auth/me
    set({ status: "authed", user: s.user });
    try {
      const me = await staffApi.get<StaffUser>("/auth/me");
      staffStore.patchUser(me);
      set({ user: me, status: "authed" });
    } catch (e) {
      if (isApiError(e) && !e.isNetwork && (e.status === 401)) set({ status: "anon", user: null });
      // خطأ شبكة أو غيره: نبقى على النسخة المحفوظة
    }
  },

  async login(username, password, branchId) {
    // العقد 1: branch_id إلزامي في الدخول. نجرّب الفرع المحدد، ثم آخر فرع دخل عليه هذا الجهاز،
    // ثم الفروع الفعالة من /public/branches، ونتخطى BRANCH_NOT_ASSIGNED حتى نصل لفرع مسند للموظف.
    // بعد الدخول، الموظف المسند لأكثر من فرع يختار فرعه من شاشة اختيار الفرع (switch-branch).
    const candidates: string[] = [];
    const push = (id?: string | null) => { if (id && !candidates.includes(id)) candidates.push(id); };
    push(branchId);
    push(readLastBranch());
    if (!branchId) {
      try {
        const r = await fetch(`${API_URL}/public/branches`);
        if (r.ok) for (const b of ((await r.json()) as { items: { branch_id: string; status: string }[] }).items)
          if (b.status !== "inactive") push(b.branch_id);
      } catch { /* بلا شبكة: نكتفي بآخر فرع محفوظ */ }
    }
    if (!candidates.length) throw new ApiError({ status: 0, code: "NETWORK", title: "تعذر الاتصال بالخادم" });
    let last: unknown = null;
    for (const id of candidates) {
      const body: LoginRequest = { username: username.trim(), password, branch_id: id, ...(DEVICE_CODE ? { device_id: DEVICE_CODE } : {}) };
      try {
        const res = await staffApi.post<LoginResponse>("/auth/login", body, { auth: false });
        writeLastBranch(res.user.branch_id);
        staffStore.set(staffSessionFrom(res));
        set({ status: "authed", user: res.user, otherAccount: null });
        return res.user;
      } catch (e) {
        last = e;
        if (isApiError(e) && e.code === "BRANCH_NOT_ASSIGNED") continue;
        throw e;
      }
    }
    throw last;
  },

  async logout() {
    try { await staffApi.post("/auth/logout", undefined, { idempotencyKey: false }); } catch { /* نخرج محلياً مهما كان الرد */ }
    staffStore.clear();
    set({ status: "anon", user: null });
    try { await clearSnapshot(); } catch { /* ignore */ }
  },

  async switchBranch(branchId) {
    const res = await staffApi.post<LoginResponse>("/auth/switch-branch", { branch_id: branchId }, { idempotencyKey: false });
    writeLastBranch(res.user.branch_id);
    staffStore.set(staffSessionFrom(res));
    set({ user: res.user });
    return res.user;
  },

  async changePassword(current, next) {
    await staffApi.post("/auth/change-password", { current_password: current, new_password: next }, { idempotencyKey: false });
    // العقد: بعد التغيير نستدعي /auth/refresh للحصول على توكن بلا قيد PASSWORD_CHANGE_REQUIRED
    await staffApi.refreshNow();
    const s = staffStore.get();
    const user = s?.user ?? get().user!;
    set({ user });
    return user;
  },

  can: (p) => hasPerm(get().user, p),
  hasRole: (...roles) => !!get().user && (roles as string[]).includes(get().user!.role),
}));

if (typeof window !== "undefined") {
  // مزامنة بين التبويبات / بعد التجديد التلقائي
  staffStore.subscribe((s) => {
    const cur = useAuth.getState();
    if (!s) { if (cur.status === "authed") useAuth.setState({ status: "anon", user: null, otherAccount: null }); return; }
    // حساب آخر دخل في تبويب آخر من نفس المتصفح: لا نبدّل المستخدم هنا ولا ننتقل، بل نعرض رسالة (otherAccount)
    if (cur.status === "authed" && cur.user && cur.user.user_id !== s.user.user_id) {
      if (cur.otherAccount?.user_id !== s.user.user_id) useAuth.setState({ otherAccount: s.user });
      return;
    }
    // نفس المستخدم (تجديد التوكن أو تحديث بياناته): لا نعيد رسم الشاشات إن لم يتغير شيء
    if (cur.status === "authed" && JSON.stringify(cur.user) === JSON.stringify(s.user) && !cur.otherAccount) return;
    useAuth.setState({ status: "authed", user: s.user, otherAccount: null });
  });
}

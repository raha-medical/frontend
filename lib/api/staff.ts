import { API_URL } from "../config";
import { createApiClient } from "./client";
import { createSessionStore, type Session } from "./session-store";
import type { LoginResponse, PatientSessionUser, StaffUser } from "./types";

// لا نستورد الجلسة القديمة من localStorage: كل تبويب يبدأ بدخول مستقل.
export const staffStore = createSessionStore<StaffUser>("rahma.staff.session", "sessionStorage");

export function staffSessionFrom(raw: LoginResponse): Session<StaffUser> {
  const now = Date.now();
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    access_expires_at: now + raw.access_expires_in * 1000,
    refresh_expires_at: now + raw.refresh_expires_in * 1000,
    user: raw.user,
  };
}

export const staffApi = createApiClient<StaffUser>({
  baseUrl: API_URL,
  store: staffStore,
  refreshPath: "/auth/refresh",
  toSession: (raw: LoginResponse) => staffSessionFrom(raw),
  onExpired: () => { if (typeof window !== "undefined" && !location.pathname.startsWith("/staff/login")) location.assign("/staff/login?expired=1"); },
});

// ---- جلسة المريض (توكن منفصل، العقد 1 «مصادقة المريض») ----
export const patientStore = createSessionStore<PatientSessionUser>("rahma.patient.session");
export const patientApi = createApiClient<PatientSessionUser>({
  baseUrl: API_URL,
  store: patientStore,
  refreshPath: "/patient-auth/refresh",
  toSession: (raw: any, prev) => {
    const now = Date.now();
    return {
      access_token: raw.access_token,
      refresh_token: raw.refresh_token,
      access_expires_at: now + (raw.expires_in ?? 900) * 1000,
      refresh_expires_at: now + (raw.refresh_expires_in ?? 2592000) * 1000,
      user: { account: raw.account ?? prev!.user.account, patients: raw.patients ?? prev!.user.patients },
    };
  },
  onExpired: () => { if (typeof window !== "undefined" && !location.pathname.startsWith("/patient")) location.assign("/patient"); },
});

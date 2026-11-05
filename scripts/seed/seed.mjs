#!/usr/bin/env node
/**
 * بيانات تجربة لمجمع الرحمة — عبر الـ API فقط (FRONTEND_ANSWERS.md البند 7). لا يكتب في القاعدة مباشرة.
 * التشغيل:  npm run seed   (يقرأ scripts/seed/.env)
 * آمن للتكرار: يتحقق من الموجود قبل الإنشاء.
 */
import { randomUUID } from "node:crypto";

const API = (process.env.API_URL || "http://localhost:8080/api/v1").replace(/\/$/, "");
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_NEW_PASSWORD = process.env.ADMIN_NEW_PASSWORD || "";
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || "";

if (!ADMIN_PASSWORD) die("ضع ADMIN_PASSWORD في scripts/seed/.env");
if (STAFF_PASSWORD.length < 10) die("ضع STAFF_PASSWORD (10 أحرف على الأقل) في scripts/seed/.env");

function die(m) { console.error("✖ " + m); process.exit(1); }
const log = (m) => console.log("• " + m);
const ok = (m) => console.log("  ✔ " + m);

async function call(token, method, path, body, { idem = method === "POST" && !path.startsWith("/auth/"), allow = [] } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idem) headers["Idempotency-Key"] = randomUUID();
  const res = await fetch(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    if (allow.includes(data?.code) || allow.includes(res.status)) return { __error: data, status: res.status };
    throw new Error(`${method} ${path} → ${res.status} ${data?.code ?? ""} ${data?.detail ?? data?.title ?? text}`.trim());
  }
  return data;
}

async function loginAs(username, password, nextPassword) {
  let r = await call(null, "POST", "/auth/login", { username, password });
  if (r.user.must_change_password) {
    if (!nextPassword) die(`الحساب ${username} يتطلب تغيير كلمة المرور. ضع ADMIN_NEW_PASSWORD.`);
    await call(r.access_token, "POST", "/auth/change-password", { current_password: password, new_password: nextPassword });
    r = await call(null, "POST", "/auth/login", { username, password: nextPassword });
    ok(`غُيّرت كلمة مرور ${username}`);
  }
  return r;
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());

// ------------------------------------------------------------------------------------------
const CLINICS = [
  { key: "internal", name: "عيادة الباطنية", department: "clinic", floor: 2 },
  { key: "peds", name: "عيادة الأطفال", department: "clinic", floor: 1 },
  { key: "lab", name: "المختبر", department: "lab", floor: 1 },
  { key: "rad", name: "الأشعة والسونار", department: "radiology", floor: 0 },
  { key: "pharm", name: "الصيدلية", department: "pharmacy", floor: 0 },
];
const SERVICES = [
  { clinic: "internal", name: "كشفية باطنية - جديد", type: "consultation", visit_kind: "new_visit", price: 25000 },
  { clinic: "internal", name: "كشفية باطنية - مراجعة", type: "consultation", visit_kind: "follow_up", price: 15000 },
  { clinic: "peds", name: "كشفية أطفال - جديد", type: "consultation", visit_kind: "new_visit", price: 20000 },
  { clinic: "peds", name: "كشفية أطفال - مراجعة", type: "consultation", visit_kind: "follow_up", price: 10000 },
  { clinic: "lab", name: "تحليل دم شامل CBC", type: "lab", price: 30000 },
  { clinic: "lab", name: "تحليل السكر التراكمي HbA1c", type: "lab", price: 20000 },
  { clinic: "lab", name: "فيتامين D", type: "lab", price: 25000 },
  { clinic: "rad", name: "سونار بطن", type: "radiology", modality: "ultrasound", price: 35000 },
  { clinic: "rad", name: "أشعة صدر", type: "radiology", modality: "xray", price: 20000 },
];
const DOCTORS = [
  { username: "doc_saad", full_name: "د. سعد الحيدري", phone: "07701000001", clinic: "internal", specialty: ["internal", "باطنية"], slot: 10 },
  { username: "doc_huda", full_name: "د. هدى الربيعي", phone: "07701000002", clinic: "peds", specialty: ["pediatrics", "أطفال", "طب الأطفال"], slot: 10 },
];
const STAFF = [
  { username: "manager_b1", full_name: "مصطفى عادل", phone: "07701000010", role: "branch_manager" },
  { username: "reception_b1", full_name: "علي حسن", phone: "07701000011", role: "receptionist", clinics: ["internal", "peds"] },
  { username: "accountant_b1", full_name: "زينب كاظم", phone: "07701000012", role: "accountant" },
  { username: "lab_b1", full_name: "سارة كريم", phone: "07701000013", role: "lab_tech" },
  { username: "radiology_b1", full_name: "حيدر سلمان", phone: "07701000014", role: "radiologist" },
  { username: "pharmacy_b1", full_name: "نور جاسم", phone: "07701000015", role: "pharmacist" },
];
const PATIENTS = [
  { full_name: "فاطمة حسن", phone_number: "07801234567", gender: "female", birth_date: "1991-04-10" },
  { full_name: "أحمد علي", phone_number: "07801234568", gender: "male", approx_age: 45 },
  { full_name: "مريم جاسم", phone_number: "07801234569", gender: "female", approx_age: 29 },
  { full_name: "سجاد كريم", phone_number: "07801234570", gender: "male", birth_date: "1988-01-22" },
  { full_name: "رقية سالم", phone_number: "07801234571", gender: "female", approx_age: 8 },
  { full_name: "كاظم جبار", phone_number: "07801234572", gender: "male", approx_age: 63 },
];
const WEEK = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// ------------------------------------------------------------------------------------------
async function main() {
  log(`الاتصال بـ ${API}`);
  const admin = await loginAs(ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NEW_PASSWORD);
  if (ADMIN_NEW_PASSWORD) ADMIN_PASSWORD = ADMIN_NEW_PASSWORD;
  const T = admin.access_token;
  const branchId = admin.user.branch_id;
  ok(`دخول ${ADMIN_USERNAME} · الفرع ${branchId}`);

  // 1) العيادات والأقسام
  log("العيادات والأقسام");
  const existingClinics = (await call(T, "GET", `/branches/${branchId}/clinics?include_inactive=true`)).items;
  const clinic = {};
  for (const c of CLINICS) {
    let found = existingClinics.find((x) => x.name === c.name);
    if (!found) { found = await call(T, "POST", `/branches/${branchId}/clinics`, { name: c.name, department: c.department, floor: c.floor }); ok(`أُضيف ${c.name}`); }
    clinic[c.key] = found.clinic_id;
  }

  // 2) الخدمات والأسعار
  log("الخدمات والأسعار");
  const existingSvc = (await call(T, "GET", `/services?include_inactive=true`)).items;
  for (const s of SERVICES) {
    if (existingSvc.some((x) => x.name === s.name)) continue;
    const body = { name: s.name, type: s.type, price: s.price, clinic_id: clinic[s.clinic] };
    if (s.visit_kind) body.visit_kind = s.visit_kind;
    if (s.modality) body.modality = s.modality;
    await call(T, "POST", "/services", body, { allow: ["DUPLICATE_SERVICE"] });
    ok(`أُضيفت ${s.name}`);
  }

  // 3) الاختصاصات من القائمة المنسدلة (لا قيم ثابتة)
  const specs = (await call(T, "GET", "/lookups/doctor_specialty")).items;
  const pickSpec = (cands) => (specs.find((x) => cands.includes(x.code) || cands.includes(x.name_ar)) ?? specs[0])?.code;

  // 4) المستخدمون
  log("الموظفون والأطباء");
  const existingUsers = (await call(T, "GET", `/users?page_size=100`)).items ?? [];
  const created = [];
  const tmp = `${STAFF_PASSWORD}-tmp`;
  for (const d of DOCTORS) {
    if (existingUsers.some((u) => u.username === d.username)) continue;
    await call(T, "POST", "/users", {
      username: d.username, full_name: d.full_name, phone_number: d.phone, role: "doctor", branch_ids: [branchId], clinic_ids: [], extra_permissions: [],
      doctor_profile: { specialty: pickSpec(d.specialty), clinic_id: clinic[d.clinic], default_slot_minutes: d.slot }, temporary_password: tmp,
    });
    created.push(d.username); ok(`أُضيف ${d.full_name}`);
  }
  for (const s of STAFF) {
    if (existingUsers.some((u) => u.username === s.username)) continue;
    await call(T, "POST", "/users", {
      username: s.username, full_name: s.full_name, phone_number: s.phone, role: s.role, branch_ids: [branchId],
      clinic_ids: (s.clinics ?? []).map((k) => clinic[k]), extra_permissions: [], doctor_profile: null, temporary_password: tmp,
    });
    created.push(s.username); ok(`أُضيف ${s.full_name} (${s.role})`);
  }
  // تثبيت كلمة المرور النهائية للحسابات الجديدة (حتى لا يُطلب التغيير في كل تجربة)
  for (const u of created) await loginAs(u, tmp, STAFF_PASSWORD);

  // 5) الأطباء: النسب والجدول (وجبة طويلة كل يوم لتسهيل التجربة في أي وقت)
  log("نسب الأطباء وجداول الدوام");
  const doctors = (await call(T, "GET", "/doctors")).items;
  for (const d of DOCTORS) {
    const doc = doctors.find((x) => x.full_name === d.full_name);
    if (!doc) continue;
    const com = await call(T, "GET", `/doctors/${doc.doctor_id}/commissions`);
    if (!com.current) { await call(T, "POST", `/doctors/${doc.doctor_id}/commissions`, { new_visit_rate: 70, follow_up_rate: 60, effective_from: "2026-01-01" }); ok(`نسبة ${d.full_name} 70/60`); }
    const sch = await call(T, "GET", `/doctors/${doc.doctor_id}/schedule`);
    if (!sch.weekly?.length) {
      await call(T, "PUT", `/doctors/${doc.doctor_id}/schedule`, { weekly: WEEK.map((weekday) => ({ weekday, start: "08:00", end: "23:30", slot_minutes: d.slot, online_quota_percent: 60 })) });
      ok(`جدول ${d.full_name}: يومياً 08:00–23:30`);
    }
  }

  // 6) الأجهزة: حاسوب الاستقبال وشاشة الانتظار
  log("الأجهزة");
  const devices = (await call(T, "GET", "/devices")).items ?? [];
  let pc = devices.find((x) => x.kind === "reception_pc");
  if (!pc) { pc = await call(T, "POST", "/devices", { kind: "reception_pc", name: "حاسوب استقبال 1" }); ok("أُضيف حاسوب الاستقبال"); }
  let display = devices.find((x) => x.kind === "display");
  if (!display) {
    display = await call(T, "POST", "/devices", { kind: "display", name: "شاشة انتظار الباطنية", clinic_id: clinic.internal });
    ok(`أُضيفت شاشة الانتظار · display_id=${display.device_id} · display_key=${display.display_key} (يظهر مرة واحدة فقط، احفظه)`);
  }

  // 7) المرضى + حجوزات هاتفية لليوم (بحساب الاستقبال)
  log("مرضى تجريبيون وحجوزات اليوم");
  const rec = await loginAs("reception_b1", STAFF_PASSWORD);
  const R = rec.access_token;
  const pats = [];
  for (const p of PATIENTS) {
    const found = (await call(R, "GET", `/patients/search?phone=${p.phone_number}`)).items.find((x) => x.full_name === p.full_name);
    if (found) { pats.push(found); continue; }
    const c = await call(R, "POST", "/patients", { patient_id: randomUUID(), ...p });
    pats.push(c); ok(`مريض ${p.full_name} · ${c.file_number}`);
  }
  const saad = doctors.find((x) => x.full_name === DOCTORS[0].full_name);
  if (saad) {
    const ses = (await call(R, "GET", `/doctors/${saad.doctor_id}/sessions?from=${today()}&to=${today()}`)).items?.[0];
    if (ses) {
      for (const p of pats.slice(0, 3)) {
        const r = await call(R, "POST", "/bookings", { booking_id: randomUUID(), patient_id: p.patient_id, session_id: ses.session_id, visit_kind: "auto" }, { allow: ["DUPLICATE_BOOKING", "SESSION_CLOSED", "SESSION_FULL"] });
        if (!r.__error) ok(`حجز هاتفي ${p.full_name} · ${r.ticket_number}`);
      }
    } else log("لا توجد وجبة اليوم للطبيب (تحقق من الجدول)");
  }

  console.log("\n================ جاهز ================");
  console.log(`كلمة مرور الموظفين: قيمة STAFF_PASSWORD في scripts/seed/.env`);
  for (const u of [...DOCTORS, ...STAFF]) console.log(`  ${u.username.padEnd(14)} ${u.role ?? "doctor"}`);
  console.log(`\nضع في .env.local للفرونت:\n  NEXT_PUBLIC_DEVICE_CODE=${pc.device_code}`);
}

main().catch((e) => die(e.message));

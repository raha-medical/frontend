import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../lib/api/session-store.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const storage = () => {
  const entries = new Map();
  return { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: (key) => entries.delete(key) };
};
const shared = storage();
function tab(sessionStorage = storage()) {
  const listeners = [];
  const window = { localStorage: shared, sessionStorage, addEventListener: (_, listener) => listeners.push(listener) };
  const context = { window, exports: {} };
  vm.runInNewContext(source, context);
  return { window, listeners, create: context.exports.createSessionStore };
}
const session = (id) => ({ access_token: `fake-access-${id}`, refresh_token: `fake-refresh-${id}`, access_expires_at: 100, refresh_expires_at: 200, user: { user_id: id } });
const a = tab(), b = tab();
const reception = a.create("rahma.staff.session", "sessionStorage");
const doctor = b.create("rahma.staff.session", "sessionStorage");
reception.set(session("reception"));
doctor.set(session("doctor"));
assert.equal(reception.get().user.user_id, "reception");
assert.equal(doctor.get().user.user_id, "doctor");
assert.equal(shared.getItem("rahma.staff.session"), null);
const reload = tab(a.window.sessionStorage).create("rahma.staff.session", "sessionStorage");
assert.equal(reload.get().user.user_id, "reception");
doctor.set({ ...doctor.get(), access_token: "fake-refreshed" });
assert.equal(reception.get().access_token, "fake-access-reception");
// A legacy localStorage event must not replace the tab's session.
shared.setItem("rahma.staff.session", JSON.stringify(session("legacy")));
a.listeners[0]({ key: "rahma.staff.session", storageArea: shared });
assert.equal(reception.get().user.user_id, "reception");
doctor.clear();
assert.equal(doctor.get(), null);
assert.equal(reception.get().user.user_id, "reception");
const patientA = a.create("rahma.patient.session"), patientB = b.create("rahma.patient.session");
patientA.set(session("patient"));
b.listeners.forEach((fn) => fn({ key: "rahma.patient.session", storageArea: shared }));
assert.equal(patientB.get().user.user_id, "patient");
console.log("PASS: staff isolation, reload, refresh, logout, legacy event isolation, patient localStorage compatibility");

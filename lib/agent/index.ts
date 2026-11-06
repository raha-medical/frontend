import { AGENT_MODE, AGENT_URL } from "../config";
import { fmtDateTime } from "../format";
import { ApiError } from "../api/errors";
import qrcode from "qrcode-generator";
import { esc, printHtml } from "./print-html";
import type { AgentEvent, AgentStatus, HardwareAgent, PrintLabelRequest, PrintReceiptRequest, PrintTicketRequest, ReceiptBlock } from "./types";

export * from "./types";

const KEY_STORAGE = "rahma.agent.key";
/** X-Agent-Key يُسلَّم عند تثبيت الجهاز (القسم 16). */
export const getAgentKey = () => { try { return localStorage.getItem(KEY_STORAGE) ?? ""; } catch { return ""; } };
export const setAgentKey = (k: string) => { try { localStorage.setItem(KEY_STORAGE, k); } catch { /* ignore */ } };

/** الوكيل الحقيقي: https://localhost:9443 بنفس العناوين والأخطاء. */
const realAgent: HardwareAgent = {
  mode: "agent",
  async status() { return call<AgentStatus>("/status"); },
  async printReceipt(req) { return call("/print/receipt", { method: "POST", body: req }); },
  async printTicket(req) { return call("/print/ticket", { method: "POST", body: req }); },
  async printLabel(req) { return call("/print/label", { method: "POST", body: req }); },
  async events(since) { return call<AgentEvent[]>(`/events?since=${since}`); },
  async setReceiptBlock(block) { return call("/receipt-block", { method: "POST", body: { block } }); },
  async ackEvents(upTo) { await call("/events/ack", { method: "POST", body: { up_to: upTo } }); },
};

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(AGENT_URL + path, {
      method: init?.method ?? "GET",
      headers: { "Content-Type": "application/json", "X-Agent-Key": getAgentKey() },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError({ status: 0, code: "AGENT_UNREACHABLE", title: "وكيل الطباعة غير متصل", detail: "تأكد من تشغيل وكيل العتاد على هذا الحاسوب." });
  }
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let b: any = null; try { b = await res.json(); } catch { /* */ }
    throw new ApiError({ status: res.status, code: b?.code ?? "AGENT_ERROR", title: b?.title, detail: b?.detail });
  }
  return (await res.json()) as T;
}

/** وضع المحاكاة: يطبع من المتصفح ولا يفتح درجاً. نفس الواجهة تماماً ليكون التبديل بإعداد واحد. */
const SIM_BLOCK = "rahma.agent.sim_block";
const simBlock = (): ReceiptBlock | null => { try { return JSON.parse(localStorage.getItem(SIM_BLOCK) ?? "null"); } catch { return null; } };
const simulatedAgent: HardwareAgent = {
  mode: "simulate",
  async status() {
    const b = simBlock();
    return { agent_version: "simulated", device_id: b?.device_code ?? "simulated", printer: { connected: true, model: "طباعة المتصفح", paper: "ok" }, drawer: { connected: false, state: "closed" }, pending_events: 0, receipt_block: b ? { ...b, last_used: null } : null, public_key_id: null };
  },
  async setReceiptBlock(block) { try { if (block) localStorage.setItem(SIM_BLOCK, JSON.stringify(block)); else localStorage.removeItem(SIM_BLOCK); } catch { /* ignore */ } return { accepted: true }; },
  async ackEvents() { /* لا أحداث في المحاكاة */ },
  async printReceipt(req: PrintReceiptRequest) {
    await printHtml(receiptHtml(req.print_payload), "إيصال");
    return { printed: true, drawer_opened: false };
  },
  async printTicket(req: PrintTicketRequest) {
    await printHtml(`<h1>مجمع الرحمة الطبي</h1><div class="c">رقم دورك</div><div class="big n">${esc(req.ticket_number)}</div><div class="c">${esc(req.doctor_name)}</div>${req.estimated_time ? `<div class="c">الوقت التقريبي <span class="n">${esc(req.estimated_time)}</span></div>` : ""}`, "تذكرة");
    return { printed: true };
  },
  async printLabel(req: PrintLabelRequest) {
    const one = `<div style="font-weight:700">${esc(req.patient_name)}</div><div class="n">${esc(req.file_number)} · ${esc(req.collected_at ?? "")}</div><div>${esc(req.test_name)}</div><div class="n" style="font-size:16px;font-weight:700;letter-spacing:2px">${esc(req.sample_barcode)}</div>`;
    await printHtml(Array.from({ length: Math.max(1, req.copies ?? 1) }, () => one).join('<div style="page-break-after:always"></div>'), "ملصق عينة", "label");
    return { printed: true };
  },
  async events() { return []; },
};

/** رابط التحقق في الـ QR: إن أعاده السيرفر نسبياً (Receipts:VerifyBaseUrl غير مضبوط) نكمله بأصل الواجهة ليعمل عند المسح. */
const absUrl = (u: string) => (u.startsWith("/") && typeof window !== "undefined" ? window.location.origin + u : u);

/** إيصال حراري 80mm بشكل GET /receipts/{id}/print-payload (العقد 9). */
const METHOD_AR: Record<string, string> = { cash: "نقداً", pos: "POS", online: "إلكتروني", patient_credit: "رصيد" };
/** 7.1-د: صورة QR حقيقية (SVG مرسوم محلياً بلا إنترنت) بدل طباعة الرابط نصاً. */
export function qrSvg(value: string, px = 120) {
  const q = qrcode(0, "M");
  q.addData(value);
  q.make();
  const count = q.getModuleCount(), n = count + 8;
  let d = "";
  for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

/** قالب الوصل نفسه: يُستخدم للطباعة من المتصفح وللمعاينة قبل الطباعة (7.1-ب)، فما يُعاين هو ما يُطبع. */
export function receiptHtml(p: Record<string, any>) {
  const n = (v: unknown) => (typeof v === "number" ? Math.trunc(v).toLocaleString("en-US") : esc(v));
  // اسم الطبيب لكل بند فقط إن تعدد الأطباء في الإيصال، وإلا يُطبع مرة في الرأس
  const lines = Array.isArray(p.lines) ? p.lines.map((l: any) => `<div class="row"><span>${esc(l.text)}${!p.doctor_name && l.doctor_name ? ` · ${esc(l.doctor_name)}${l.ticket_number ? ` <span class="n">(${esc(l.ticket_number)})</span>` : ""}` : ""}</span><span class="n">${n(l.amount)}</span></div>`).join("") : "";
  const head = [p.clinic_name, p.doctor_name].filter(Boolean).map(esc).join(" · ");
  const tenders = Array.isArray(p.tenders) ? p.tenders.map((t: any) => `<div class="row"><span>${esc(METHOD_AR[t.method] ?? t.method)}</span><span class="n">${n(t.amount)}</span></div>`).join("") : "";
  const when = p.issued_at ? fmtDateTime(p.issued_at) : "";
  return `${p.logo_url ? `<div class="c"><img src="${esc(absUrl(String(p.logo_url)))}" alt="" style="height:56px;width:auto"></div>` : ""}<h1>${esc(p.branch_name ?? "مجمع الرحمة الطبي")}</h1>
    <div class="c">${esc(p.type_ar ?? "")}${p.is_copy ? ` · نسخة ${n(p.copy_number)}` : ""}</div><div class="c n">${esc(p.receipt_number)}</div><hr>
    <div class="row"><span>الموظف: ${esc(p.cashier_name)}</span><span class="n">${esc(when)}</span></div>
    <div class="row"><span>${esc(p.patient_name)}</span><span class="n">${esc(p.file_number)}</span></div>
    ${head || p.ticket_number ? `<div class="row"><span>${head}</span>${p.ticket_number ? `<span>دور <b class="n">${esc(p.ticket_number)}</b></span>` : ""}</div>` : ""}<hr>
    ${lines}${p.deposit_used ? `<div class="row"><span>رصيد عربون</span><span class="n">-${n(p.deposit_used)}</span></div>` : ""}<hr>
    <div class="row" style="font-weight:700;font-size:16px"><span>المجموع</span><span class="n">${n(p.total)}</span></div>${tenders}<hr>
    ${p.qr_code ? `<div class="c">${qrSvg(absUrl(String(p.qr_code)))}</div><div class="c" style="font-size:10px">امسح الرمز للتحقق من الوصل</div>` : ""}
    <div class="c" style="font-size:11px">${esc(p.footer ?? "")}</div>`;
}

export const hardwareAgent: HardwareAgent = AGENT_MODE === "agent" ? realAgent : simulatedAgent;

/** عقد وكيل العتاد المحلي — القسم 16 من العقود، حرفياً. */
export interface AgentStatus {
  agent_version: string;
  device_id: string;
  printer: { connected: boolean; model: string; paper: "ok" | "low" | "out" };
  drawer: { connected: boolean; state: "closed" | "open" };
  pending_events: number;
  /** الكتلة المحجوزة لهذا الجهاز وآخر رقم استُخدم منها (null قبل أول إيصال). */
  receipt_block?: (ReceiptBlock & { last_used: number | null }) | null;
  /** key_id للمفتاح العام الذي يتحقق به الوكيل (من GET /agent/drawer-public-key). */
  public_key_id?: string | null;
}
/** رد POST /devices/{device}/receipt-blocks (القسم 17)، يُمرر للوكيل كما هو. */
export interface ReceiptBlock { block_id: string; prefix: string; from: number; to: number; signature: string; device_id: string; device_code: string }
export interface PrintReceiptRequest { print_payload: Record<string, unknown>; drawer_token?: string | null; open_drawer: boolean }
export interface PrintReceiptResult { printed: boolean; drawer_opened: boolean }
export interface PrintTicketRequest { ticket_number: string; doctor_name: string; estimated_time?: string }
/** ملصق عينة المختبر (طابعة ملصقات أو نفس الطابعة الحرارية): الباركود CODE128 يرسمه الوكيل. */
export interface PrintLabelRequest { sample_barcode: string; patient_name: string; file_number: string; test_name: string; collected_at?: string; copies?: number }
export interface AgentEvent { local_event_id: number; type: "receipt.printed" | "drawer.opened" | "drawer.opened_without_receipt" | "printer.error" | "paper.out"; receipt_number: string | null; occurred_at: string }

export type AgentErrorCode = "PRINTER_OFFLINE" | "PAPER_OUT" | "INVALID_DRAWER_TOKEN" | "RECEIPT_NUMBER_NOT_IN_BLOCK" | "INVALID_BLOCK_SIGNATURE" | "AGENT_UNREACHABLE";

export interface HardwareAgent {
  readonly mode: "simulate" | "agent";
  status(): Promise<AgentStatus>;
  printReceipt(req: PrintReceiptRequest): Promise<PrintReceiptResult>;
  printTicket(req: PrintTicketRequest): Promise<{ printed: boolean }>;
  printLabel(req: PrintLabelRequest): Promise<{ printed: boolean }>;
  events(since: number): Promise<AgentEvent[]>;
  /** يسلّم الوكيل كتلة الإيصالات الموقّعة (يتحقق من التوقيع). null = لا كتلة (أُعيدت). */
  setReceiptBlock(block: ReceiptBlock | null): Promise<{ accepted: boolean }>;
  /** الأحداث حتى هذا الرقم رُفعت للسيرفر؛ يحق للوكيل حذفها. */
  ackEvents(upTo: number): Promise<void>;
}

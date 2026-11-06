export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "/api/v1").replace(/\/$/, "");
export const SERVER_URL = API_URL.replace(/\/api\/v1$/, "");
export const HUB_URL = `${SERVER_URL}/hubs/live`;
export const AGENT_MODE: "simulate" | "agent" = process.env.NEXT_PUBLIC_AGENT_MODE === "agent" ? "agent" : "simulate";
export const AGENT_URL = (process.env.NEXT_PUBLIC_AGENT_URL ?? "https://localhost:9443").replace(/\/$/, "");
export const DEVICE_CODE = process.env.NEXT_PUBLIC_DEVICE_CODE?.trim() || null;
/** قرار المالك (7.1-أ): درج النقود موقوف بالكامل، والطابعة فقط. لا يُرسل للوكيل أي طلب فتح، وتُخفى كل نصوص الدرج. */
export const CASH_DRAWER_ENABLED = false;
export const BAGHDAD_TZ = "Asia/Baghdad";

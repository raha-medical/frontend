"use client";
import * as signalR from "@microsoft/signalr";
import { HUB_URL } from "../config";

export type LiveState = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";
type Handler = (...args: any[]) => void;

/**
 * اتصال SignalR واحد على /hubs/live (العقد 0.9). التوكن يمر في access_token ضمن الـ query تلقائياً.
 * عند إعادة الاتصال يستدعي المستمعون onReconnected ليعيدوا تحميل GET /queue/live.
 */
export class LiveConnection {
  private conn: signalR.HubConnection;
  private handlers = new Map<string, Set<Handler>>();
  private reconnectCbs = new Set<() => void>();
  private stateCbs = new Set<(s: LiveState) => void>();
  state: LiveState = "idle";

  constructor(getToken: () => string | null | Promise<string | null>) {
    this.conn = new signalR.HubConnectionBuilder()
      // يُستدعى عند كل اتصال وإعادة اتصال: توكن مجدَّد، وإلا انضم الاتصال بلا هوية ولم تصل أحداث الحساب
      .withUrl(HUB_URL, { accessTokenFactory: async () => (await getToken()) ?? "" })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      // أخطاء البدء نعالجها بأنفسنا (إعادة محاولة بعد 10 ثوانٍ)، فلا نطبعها كأخطاء في الكونسول
      .configureLogging(signalR.LogLevel.None)
      .build();
    this.conn.onreconnecting(() => this.set("reconnecting"));
    this.conn.onreconnected(() => { this.set("connected"); this.reconnectCbs.forEach((f) => f()); });
    this.conn.onclose(() => this.set("disconnected"));
  }

  private set(s: LiveState) { this.state = s; this.stateCbs.forEach((f) => f(s)); }

  private wanted = false;
  async start() {
    this.wanted = true;
    const st = this.conn.state;
    if (st === signalR.HubConnectionState.Connected || st === signalR.HubConnectionState.Connecting || st === signalR.HubConnectionState.Reconnecting) return;
    // React (وضع التطوير) يوقف الاتصال ويعيد تشغيله فوراً: ننتظر انتهاء الإيقاف ثم نبدأ، بدل تجاهل الطلب
    if (st === signalR.HubConnectionState.Disconnecting) { setTimeout(() => { if (this.wanted) void this.start(); }, 300); return; }
    this.set("connecting");
    try { await this.conn.start(); this.set("connected"); this.reconnectCbs.forEach((f) => f()); }
    catch { if (!this.wanted) return; this.set("disconnected"); setTimeout(() => { if (this.wanted) void this.start(); }, 5_000); }
  }
  async stop() { this.wanted = false; this.handlers.forEach((_, ev) => this.conn.off(ev)); this.handlers.clear(); await this.conn.stop(); if (!this.wanted) this.set("idle"); }

  /** الاشتراك بحدث (الأسماء في العقد تحت «Real-time events» لكل وحدة). */
  on(event: string, h: Handler) {
    let set = this.handlers.get(event);
    if (!set) { set = new Set(); this.handlers.set(event, set); this.conn.on(event, (...a) => this.handlers.get(event)?.forEach((f) => f(...a))); }
    set.add(h);
    return () => { set!.delete(h); };
  }
  onReconnected(cb: () => void) { this.reconnectCbs.add(cb); return () => { this.reconnectCbs.delete(cb); }; }
  onState(cb: (s: LiveState) => void) { this.stateCbs.add(cb); cb(this.state); return () => { this.stateCbs.delete(cb); }; }
  invoke<T = unknown>(method: string, ...args: unknown[]) { return this.conn.invoke<T>(method, ...args); }
}

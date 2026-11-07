/** @type {import('next').NextConfig} */
// الواجهة تكلّم الـ API على نفس الأصل (/api/v1 و /hubs) وNext يمرّرها للباك اند.
// هذا يلغي مشاكل CORS ويعمل سواء فُتحت الواجهة على localhost أو 127.0.0.1 أو IP الشبكة.
const API_TARGET = (process.env.API_PROXY_TARGET ?? "http://localhost:8088").replace(/\/$/, "");
// للتطوير فقط: محاكي وكيل الطابعة عبر نفس الأصل (/agent-sim) حين يُضبط AGENT_PROXY_TARGET. الوكيل الحقيقي يُكلَّم مباشرة على https://localhost:9443
const AGENT_TARGET = (process.env.AGENT_PROXY_TARGET ?? "").replace(/\/$/, "");

// Fail a hosted build instead of silently proxying production traffic to localhost.
if (process.env.VERCEL) {
  const target = new URL(process.env.API_PROXY_TARGET ?? "http://localhost");
  if (target.protocol !== "https:" || target.pathname !== "/" || target.search || target.hash || target.username || target.password) {
    throw new Error("Vercel requires API_PROXY_TARGET to be the public HTTPS backend origin.");
  }
  const hub = new URL(process.env.NEXT_PUBLIC_HUB_URL ?? "http://localhost");
  if (hub.protocol !== "https:" || hub.pathname !== "/hubs/live" || hub.search || hub.hash || hub.username || hub.password) {
    throw new Error("Vercel requires NEXT_PUBLIC_HUB_URL=https://BACKEND/hubs/live.");
  }
}

const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      { source: "/api/v1/:path*", destination: `${API_TARGET}/api/v1/:path*` },
      { source: "/hubs/:path*", destination: `${API_TARGET}/hubs/:path*` },
      ...(AGENT_TARGET ? [{ source: "/agent-sim/:path*", destination: `${AGENT_TARGET}/:path*` }] : []),
    ];
  },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};
export default nextConfig;


import type { Metadata, Viewport } from "next";
// خط واحد لكل النظام (عربي ولاتيني وأرقام): Readex Pro محلياً من npm (@fontsource) ليعمل بلا إنترنت داخل الـ PWA
import "@fontsource/readex-pro/300.css";
import "@fontsource/readex-pro/400.css";
import "@fontsource/readex-pro/500.css";
import "@fontsource/readex-pro/600.css";
import "@fontsource/readex-pro/700.css";
import "./globals.css";
import { Providers } from "@/components/providers";


export const metadata: Metadata = {
  title: { default: "مجمع الرحمة الطبي", template: "%s · مجمع الرحمة الطبي" },
  description: "نظام مجمع الرحمة الطبي",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/rahma-mark.svg", apple: "/icons/icon-192.png" },
};
export const viewport: Viewport = {
  // قيم حرفية إلزامياً (وسم meta لا يقرأ متغيرات CSS) — تطابق --bg في globals.css
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F3F7F9" }, { media: "(prefers-color-scheme: dark)", color: "#0B1E2E" }],
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-content",
};

// يضبط الثيم قبل أول رسم لمنع الوميض. المفتاح نفسه المستخدم في التصميم: rahma-theme
const themeInit = `(function(){try{var t=localStorage.getItem('rahma-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme='light'}try{if(sessionStorage.getItem('rahma-splash-seen'))document.documentElement.dataset.splashSeen='1'}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="light" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeInit }} /></head>
      <body className="min-h-dvh font-sans"><Providers>{children}</Providers></body>
    </html>
  );
}

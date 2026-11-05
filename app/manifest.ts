import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "مجمع الرحمة الطبي",
    short_name: "الرحمة",
    description: "نظام مجمع الرحمة الطبي",
    start_url: "/staff/login",
    scope: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    // قيم حرفية إلزامياً (ملف manifest لا يقرأ متغيرات CSS): تطابق --bg الداكن و--primary في globals.css
    background_color: "#0B1E2E",
    theme_color: "#0E747C",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

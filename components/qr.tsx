"use client";
/** رمز QR مرسوم SVG محلياً (بلا إنترنت) لرموز الوصفة والخدمات وشاشة الانتظار: يُمسح بقارئ الاستقبال/الصيدلية أو كاميرتها. */
import { useMemo } from "react";
import qrcode from "qrcode-generator";

export function QrCode({ value, size = 168, label }: { value: string; size?: number; label?: string }) {
  const { path, n } = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(value);
    q.make();
    const count = q.getModuleCount();
    let d = "";
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (q.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
    return { path: d, n: count + 8 };
  }, [value]);
  return (
    <span className="flex flex-col items-center gap-1.5">
      <svg role="img" aria-label={label ?? value} width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" className="rounded-xl bg-white">
        <rect width={n} height={n} fill="var(--qr-light)" />
        <path d={path} fill="var(--qr-dark)" />
      </svg>
      {label && <span className="num text-sm font-bold" dir="ltr">{label}</span>}
    </span>
  );
}

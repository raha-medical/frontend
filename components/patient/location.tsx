"use client";
/** الموقع والفرع الأقرب والتوجيه (4.4، العقد 22.3): الحساب كله في الجهاز، والرفض لا يعطل شيئاً. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui";
import { directionsHref, fmtDistance, haversineKm, type Directions, type LatLng } from "@/lib/geo";

const KEY = "rahma.patient.location";
type Choice = "ask" | "allowed" | "declined";
const readChoice = (): Choice => { try { const v = localStorage.getItem(KEY); return v === "allowed" || v === "declined" ? v : "ask"; } catch { return "ask"; } };
const saveChoice = (c: Choice) => { try { localStorage.setItem(KEY, c); } catch { /* التخزين قد يكون ممنوعاً */ } };

export type GeoState = { choice: Choice; pos: LatLng | null; locating: boolean; failed: boolean; allow: () => void; decline: () => void };

/** الإحداثيات تبقى في ذاكرة الصفحة فقط، والمحفوظ هو قرار المريض بالسماح أو الرفض. */
export function useGeo(): GeoState {
  const [choice, setChoice] = useState<Choice>("ask");
  const [pos, setPos] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);
  const locate = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setFailed(true); return; }
    setLocating(true); setFailed(false);
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false); },
      (e) => { setLocating(false); setFailed(true); if (e.code === e.PERMISSION_DENIED) { saveChoice("declined"); setChoice("declined"); } },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }, []);
  useEffect(() => { const c = readChoice(); setChoice(c); if (c === "allowed") locate(); }, [locate]);
  return {
    choice, pos, locating, failed,
    allow: () => { saveChoice("allowed"); setChoice("allowed"); locate(); },
    decline: () => { saveChoice("declined"); setChoice("declined"); setPos(null); },
  };
}

/** رسالة واضحة قبل طلب إذن المتصفح. بعد الرفض يبقى رابط صغير، ولو كان المنع من إعدادات المتصفح قلنا ذلك. */
export function LocationPrompt({ geo }: { geo: GeoState }) {
  if (geo.choice === "allowed") return null;
  if (geo.choice === "declined") return geo.failed
    ? <span className="sub">الموقع ممنوع في إعدادات المتصفح. اسمح به من هناك لتعرف أقرب فرع.</span>
    : <button type="button" onClick={geo.allow} className="flex min-h-11 items-center gap-1.5 self-start text-[15px] font-semibold text-primary-strong"><Icon name="locate-fixed" size={17} />اعرف أقرب فرع لك</button>;
  return (
    <div className="glass flex flex-col gap-2.5 rounded-2xl p-4 shadow-glass" role="region" aria-label="إذن الموقع">
      <span className="flex items-center gap-2 font-bold"><Icon name="locate-fixed" size={20} className="text-primary" />نعرف أقرب فرع لك؟</span>
      <span className="text-[15px] text-ink-2">نحتاج إذن الموقع لنرتب الفروع حسب قربها منك ونعرض المسافة. يُحسب ذلك في هاتفك فقط، ولا يُرسل موقعك إلى المجمع. يمكنك الحجز بدونه.</span>
      <div className="flex gap-2">
        <Button size="md" className="flex-1" icon="map-pin" onClick={geo.allow}>السماح بالموقع</Button>
        <Button size="md" variant="ghost" onClick={geo.decline}>ليس الآن</Button>
      </div>
    </div>
  );
}

export interface GeoBranch { branch_id: string; latitude?: number | null; longitude?: number | null }

/** الفروع مرتبة بالأقرب عند توفر الموقع، وإلا كما وصلت. الفرع بلا إحداثيات يأتي أخيراً. */
export function useNearest<T extends GeoBranch>(items: T[] | undefined, pos: LatLng | null) {
  return useMemo(() => {
    const list = items ?? [];
    if (!pos) return { list, km: new Map<string, number>(), nearestId: null as string | null };
    const km = new Map<string, number>();
    for (const b of list) if (b.latitude != null && b.longitude != null) km.set(b.branch_id, haversineKm(pos, { lat: Number(b.latitude), lng: Number(b.longitude) }));
    const sorted = [...list].sort((a, b) => (km.get(a.branch_id) ?? Infinity) - (km.get(b.branch_id) ?? Infinity));
    const first = sorted[0];
    return { list: sorted, km, nearestId: first && km.has(first.branch_id) ? first.branch_id : null };
  }, [items, pos]);
}

export { fmtDistance };

/** زر «التوجّه إلى المجمع»: يفتح تطبيق الخرائط في الجهاز بمسار للفرع. */
export function DirectionsButton({ directions, name, compact, className = "" }: { directions?: Directions | null; name?: string; compact?: boolean; className?: string }) {
  if (!directions) return null;
  const go = (e: React.MouseEvent) => { e.stopPropagation(); window.open(directionsHref(directions, navigator.userAgent), "_blank", "noopener"); };
  return compact
    ? <button type="button" onClick={go} aria-label={name ? `التوجّه إلى ${name}` : "التوجّه إلى المجمع"} className={`flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[15px] font-semibold text-primary-strong ${className}`}><Icon name="navigation" size={16} />التوجّه إلى المجمع</button>
    : <Button variant="ghost" size="md" icon="navigation" className={className} onClick={go}>التوجّه إلى المجمع</Button>;
}

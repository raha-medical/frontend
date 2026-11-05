"use client";
/** خريطة موقع الفرع (OpenStreetMap + Leaflet). تُحمّل في المتصفح فقط عبر next/dynamic (ssr: false).
 *  دبوس قابل للسحب، والنقر يضع الدبوس. البحث عن العنوان في الأب (Nominatim). */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const BAGHDAD: [number, number] = [33.3152, 44.3661];
// أيقونة دبوس بلا صور خارجية (الألوان من التوكنز في globals.css: .branch-pin)
const PIN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>';

export default function BranchMap({ lat, lng, onChange, readOnly, label }: { lat: number | null; lng: number | null; onChange: (lat: number, lng: number) => void; readOnly?: boolean; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!el.current || map.current) return;
    const has = lat != null && lng != null;
    const m = L.map(el.current, { center: has ? [lat!, lng!] : BAGHDAD, zoom: has ? 16 : 11, scrollWheelZoom: false, attributionControl: true });
    m.attributionControl.setPrefix(false);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(m);
    const icon = L.divIcon({ className: "branch-pin", html: `<span>${PIN_SVG}</span>`, iconSize: [40, 40], iconAnchor: [20, 44] });
    const mk = L.marker(has ? [lat!, lng!] : BAGHDAD, { draggable: !readOnly, icon, keyboard: true, title: label, alt: label, opacity: has ? 1 : 0 });
    mk.addTo(m);
    mk.on("dragend", () => { const p = mk.getLatLng(); cb.current(p.lat, p.lng); });
    if (!readOnly) m.on("click", (e: L.LeafletMouseEvent) => { mk.setLatLng(e.latlng).setOpacity(1); cb.current(e.latlng.lat, e.latlng.lng); });
    // تفعيل التكبير بعجلة الفأرة بعد النقر داخل الخريطة فقط (لا يسرق تمرير الصفحة)
    m.once("focus", () => m.scrollWheelZoom.enable());
    map.current = m; marker.current = mk;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; marker.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // تحديث خارجي (حقول الإحداثيات، نتيجة البحث، موقعي)
  useEffect(() => {
    const m = map.current, mk = marker.current;
    if (!m || !mk || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const cur = mk.getLatLng();
    if (Math.abs(cur.lat - lat) < 1e-7 && Math.abs(cur.lng - lng) < 1e-7 && mk.options.opacity === 1) return;
    mk.setLatLng([lat, lng]).setOpacity(1);
    m.setView([lat, lng], Math.max(m.getZoom(), 15), { animate: true });
  }, [lat, lng]);

  useEffect(() => {
    const mk = marker.current;
    if (!mk) return;
    if (readOnly) mk.dragging?.disable(); else mk.dragging?.enable();
  }, [readOnly]);

  return <div ref={el} dir="ltr" role="application" aria-label={label} className="h-[340px] w-full overflow-hidden rounded-card border border-line sm:h-[400px]" />;
}

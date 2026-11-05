"use client";
/** خريطة الفروع للمدير العام (OpenStreetMap + Leaflet). تُحمّل في المتصفح فقط عبر next/dynamic (ssr: false).
 *  الحالة لا تعتمد على اللون وحده: لكل حالة شكل مختلف داخل العلامة، واسم الفرع مكتوب تحتها. */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { BranchOverview } from "@/lib/api/finance";

const BAGHDAD: [number, number] = [33.3152, 44.3661];
const svg = (d: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const GLYPH = { open: svg('<path d="M20 6 9 17l-5-5"/>'), late: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3 2 6"/><path d="m22 6-3-3"/>'), closed: svg('<path d="M6 6 18 18"/><path d="M18 6 6 18"/>') };
const kindOf = (s: string): keyof typeof GLYPH => (s === "open" ? "open" : s === "open_after_hours" ? "late" : "closed");
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export default function OverviewMap({ items, selected, onSelect }: { items: BranchOverview[]; selected: string | null; onSelect: (id: string | null) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const cb = useRef(onSelect);
  cb.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { center: BAGHDAD, zoom: 11, zoomControl: false, attributionControl: true });
    m.attributionControl.setPrefix(false);
    L.control.zoom({ position: "bottomright" }).addTo(m);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on("click", () => cb.current(null));
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; layer.current = null; fitted.current = false; };
  }, []);

  // العلامات تُعاد مع كل تحديث للبيانات، وموضع الخريطة لا يتغير إلا أول مرة حتى لا تقفز تحت يد المدير
  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const placed = items.filter((b) => b.latitude != null && b.longitude != null);
    for (const b of placed) {
      const kind = kindOf(b.live_status);
      const icon = L.divIcon({ className: `ov-pin ov-${kind}${selected === b.branch_id ? " ov-on" : ""}`, html: `<span class="ov-dot">${GLYPH[kind]}</span><span class="ov-name">${esc(b.name)}</span>`, iconSize: [44, 44], iconAnchor: [22, 22] });
      const mk = L.marker([Number(b.latitude), Number(b.longitude)], { icon, keyboard: true, title: `${b.name}: ${b.live_status_ar}`, alt: `${b.name}: ${b.live_status_ar}` });
      mk.on("click", (e) => { L.DomEvent.stopPropagation(e); cb.current(b.branch_id); });
      mk.on("keypress", (e) => { if ((e.originalEvent as KeyboardEvent).key === "Enter") cb.current(b.branch_id); });
      g.addLayer(mk);
    }
    if (!fitted.current && placed.length) {
      fitted.current = true;
      m.fitBounds(L.latLngBounds(placed.map((b) => [Number(b.latitude), Number(b.longitude)] as [number, number])).pad(0.4), { maxZoom: 13 });
    }
  }, [items, selected]);

  return <div ref={el} dir="ltr" role="application" aria-label="خريطة الفروع" className="absolute inset-0" />;
}

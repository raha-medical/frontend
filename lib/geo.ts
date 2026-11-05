/** حساب المسافة في جهاز المريض (العقد 22.3). موقع المريض لا يُرسل للسيرفر أبداً. */
export interface LatLng { lat: number; lng: number }

export function haversineKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** المسافة بالعربية: «850 م» أو «4.2 كم». */
export function fmtDistance(km: number): string {
  if (km < 1) return `${Math.max(50, Math.round(km * 20) * 50)} م`;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} كم`;
}

export type Directions = { google_maps_url: string; apple_maps_url: string; waze_url: string; geo_uri: string };

/** رابط المسار المناسب للجهاز (العقد 22.3): Apple Maps على iOS، وخرائط Google على أندرويد والويب. geo يعرض نقطة بلا مسار. */
export function directionsHref(d: Directions, userAgent: string): string {
  if (/iphone|ipad|ipod/i.test(userAgent)) return d.apple_maps_url;
  return d.google_maps_url;
}

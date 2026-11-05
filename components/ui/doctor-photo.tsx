/** صورة الطبيب: المرفوعة من الإدارة إن وجدت، وإلا حرف أول من التوكنز.
 *  لا يوجد حقل جنس للطبيب، فلا نستخدم صور أشخاص افتراضية حتى لا تظهر صورة لا تطابقه. */
export const doctorInitial = (name: string | null | undefined) => (name ?? "").replace(/^د\.\s*/, "").trim().charAt(0) || "د";

export function DoctorPhoto({ src, name, className = "", textClass = "text-lg", sizes }: { src?: string | null; name?: string | null; className?: string; textClass?: string; sizes?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={name ?? ""} loading="lazy" decoding="async" sizes={sizes} className={`bg-primary-soft object-cover object-top ${className}`} />;
  }
  return <span aria-hidden className={`grid shrink-0 place-items-center bg-primary-soft font-bold text-primary-strong ${textClass} ${className}`}>{doctorInitial(name)}</span>;
}

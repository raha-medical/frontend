/**
 * الصور الافتراضية في الواجهة (المواصفة 1.3: صور حقيقية فقط، لا رسوم توضيحية).
 * المصدر الوحيد: lib/photos.ts (صور Pexels في public/photos، والاعتمادات في public/photos/CREDITS.md).
 * الأطباء بلا صورة مرفوعة يظهرون بحرف أول (DoctorPhoto في components/ui)، لأن لا حقل جنس يطابق الصورة بالطبيب.
 */
import { PHOTOS, type Photo } from "./photos";

const pick = (src: string): Photo => PHOTOS.find((p) => p.src === src) ?? PHOTOS[0];

export const MOCK_IMAGES = {
  branches: [pick("/photos/clinic/exterior-01.jpg"), pick("/photos/reception/waiting-01.jpg"), pick("/photos/clinic/corridor-01.jpg")],
  services: {
    clinics: pick("/photos/patients/consultation-01.jpg"),
    lab: pick("/photos/lab/lab-tech-01.jpg"),
    radiology: pick("/photos/radiology/ct-room-01.jpg"),
    pharmacy: pick("/photos/pharmacy/pharmacist-01.jpg"),
  },
  hero: pick("/photos/patients/family-01.jpg"),
  appScreenshot: pick("/photos/patients/phone-app-01.jpg"),
  staffHero: pick("/photos/reception/reception-02.jpg"),
  patientWelcome: pick("/photos/reception/waiting-01.jpg"),
} as const;

/** صور الحالات الفارغة في أقسام الموظفين (Empty image=…). */
export const EMPTY_PHOTOS = {
  lab: pick("/photos/lab/blood-samples-01.jpg"),
  radiology: pick("/photos/radiology/xray-review-01.jpg"),
  pharmacy: pick("/photos/pharmacy/pharmacy-shelves-01.jpg"),
  clinics: pick("/photos/clinic/exam-room-01.jpg"),
  complex: pick("/photos/reception/waiting-01.jpg"),
} as const;

// Curated real-photo manifest (no illustrations). Files live in public/photos/.
// All photos are from Pexels under the Pexels License (free commercial use, no attribution required).
// See public/photos/CREDITS.md for the full credit list.

export type PhotoCategory = "doctors" | "clinic" | "reception" | "lab" | "radiology" | "pharmacy" | "patients";

export interface Photo {
  src: string;
  alt: string;
  category: PhotoCategory;
  orientation: "portrait" | "landscape" | "square";
  gender?: "male" | "female";
  credit: { author: string; source: "Pexels" | "Unsplash"; url: string };
}

const px = (author: string, url: string) => ({ author, source: "Pexels" as const, url });

export const PHOTOS: Photo[] = [
  // ---------- doctors ----------
  { src: "/photos/doctors/dr-female-01.jpg", alt: "طبيبة محجبة ترتدي نظارة وسماعة طبية", category: "doctors", orientation: "square", gender: "female", credit: px("Layth Mushreq", "https://www.pexels.com/photo/portrait-of-confident-female-doctor-with-hijab-37272329/") },
  { src: "/photos/doctors/dr-female-02.jpg", alt: "طبيبة محجبة بالزي الطبي مع سماعة", category: "doctors", orientation: "portrait", gender: "female", credit: px("Layth Mushreq", "https://www.pexels.com/photo/confident-female-doctor-with-hijab-and-stethoscope-37272331/") },
  { src: "/photos/doctors/dr-female-03.jpg", alt: "طبيبة محجبة تحمل كتاباً طبياً", category: "doctors", orientation: "portrait", gender: "female", credit: px("Daniil Kondrashin", "https://www.pexels.com/photo/young-female-doctor-holding-medical-book-32254660/") },
  { src: "/photos/doctors/dr-female-04.jpg", alt: "طبيبة بالمعطف الأبيض والسماعة الطبية", category: "doctors", orientation: "portrait", gender: "female", credit: px("Daniil Kondrashin", "https://www.pexels.com/photo/confident-female-doctor-in-white-coat-with-stethoscope-32254667/") },
  { src: "/photos/doctors/dr-female-05.jpg", alt: "طبيبة بالمعطف الأبيض في العيادة", category: "doctors", orientation: "portrait", gender: "female", credit: px("Daniil Kondrashin", "https://www.pexels.com/photo/confident-female-doctor-in-medical-setting-32115900/") },
  { src: "/photos/doctors/dr-male-01.jpg", alt: "طبيب شاب بالمعطف الأبيض والسماعة", category: "doctors", orientation: "portrait", gender: "male", credit: px("Daniil Kondrashin", "https://www.pexels.com/photo/confident-young-doctor-with-stethoscope-portrait-32160037/") },
  { src: "/photos/doctors/dr-male-02.jpg", alt: "طبيب ملتحٍ بالمعطف الأبيض عاقداً ذراعيه", category: "doctors", orientation: "portrait", gender: "male", credit: px("RDNE Stock project", "https://www.pexels.com/photo/portrait-of-a-doctor-6129500/") },
  { src: "/photos/doctors/dr-male-03.jpg", alt: "طبيب بالمعطف الأبيض ونظارة طبية", category: "doctors", orientation: "portrait", gender: "male", credit: px("Daniil Kondrashin", "https://www.pexels.com/photo/confident-male-doctor-in-white-coat-with-glasses-37407202/") },
  { src: "/photos/doctors/dr-male-04.jpg", alt: "طبيب بالزي الطبي الأزرق والسماعة", category: "doctors", orientation: "portrait", gender: "male", credit: px("Daniil Kondrashin", "https://www.pexels.com/photo/confident-young-healthcare-professional-portrait-32115962/") },
  { src: "/photos/doctors/dr-male-05.jpg", alt: "طبيب بالزي الطبي الرمادي", category: "doctors", orientation: "portrait", gender: "male", credit: px("Cedric Fauntleroy", "https://www.pexels.com/photo/a-man-in-gray-shirt-4270375/") },

  // ---------- clinic ----------
  { src: "/photos/clinic/exam-room-01.jpg", alt: "غرفة فحص حديثة مجهزة بسرير طبي", category: "clinic", orientation: "landscape", credit: px("Ivan Babydov", "https://www.pexels.com/photo/special-medical-bed-in-medical-cabinet-7789620/") },
  { src: "/photos/clinic/exam-room-02.jpg", alt: "عيادة نظيفة بسرير فحص أزرق", category: "clinic", orientation: "landscape", credit: px("Ivan Babydov", "https://www.pexels.com/photo/blue-and-white-clinic-bed-7789603/") },
  { src: "/photos/clinic/corridor-01.jpg", alt: "ممر مستشفى مضاء بأطباء بالمعاطف البيضاء", category: "clinic", orientation: "landscape", credit: px("Oles kanebckuu", "https://www.pexels.com/photo/woman-in-white-shirt-standing-near-glass-window-inside-room-127873/") },
  { src: "/photos/clinic/exterior-01.jpg", alt: "واجهة مبنى طبي حديث بنوافذ زجاجية", category: "clinic", orientation: "portrait", credit: px("Mustafa Fatemi", "https://www.pexels.com/photo/modern-architectural-building-with-blue-windows-29819299/") },

  // ---------- reception ----------
  { src: "/photos/reception/reception-01.jpg", alt: "مراجعون عند مكتب الاستقبال في العيادة", category: "reception", orientation: "landscape", credit: px("Pavel Danilyuk", "https://www.pexels.com/photo/couple-during-registration-in-clinic-7108318/") },
  { src: "/photos/reception/reception-02.jpg", alt: "موظفة استقبال ترحب بمراجعة", category: "reception", orientation: "landscape", credit: px("Cedric Fauntleroy", "https://www.pexels.com/photo/a-receptionist-smiling-at-a-person-4269203/") },
  { src: "/photos/reception/waiting-01.jpg", alt: "صالة انتظار حديثة ومضيئة", category: "reception", orientation: "landscape", credit: px("Los Muertos Crew", "https://www.pexels.com/photo/waiting-room-in-a-hospital-8459996/") },

  // ---------- lab ----------
  { src: "/photos/lab/lab-tech-01.jpg", alt: "أخصائية مختبر محجبة بجانب المجاهر", category: "lab", orientation: "landscape", credit: px("Yusuf Çelik", "https://www.pexels.com/photo/female-scientist-in-modern-laboratory-setting-32213422/") },
  { src: "/photos/lab/lab-tech-02.jpg", alt: "فني مختبر يفحص أنبوب عينة", category: "lab", orientation: "landscape", credit: px("Ivan S", "https://www.pexels.com/photo/a-man-holding-a-test-tube-9629674/") },
  { src: "/photos/lab/blood-samples-01.jpg", alt: "عينات دم في جهاز الطرد المركزي", category: "lab", orientation: "landscape", credit: px("Karola G", "https://www.pexels.com/photo/laboratory-worker-using-modern-hospital-equipment-6627687/") },

  // ---------- radiology ----------
  { src: "/photos/radiology/ultrasound-01.jpg", alt: "فحص بالسونار لمريضة في العيادة", category: "radiology", orientation: "portrait", credit: px("Pavel Danilyuk", "https://www.pexels.com/photo/woman-in-gray-sweater-doing-an-ultrasound-7108420/") },
  { src: "/photos/radiology/ct-room-01.jpg", alt: "غرفة التصوير المقطعي بجهاز حديث", category: "radiology", orientation: "landscape", credit: px("andc1983", "https://www.pexels.com/photo/diagnosis-device-in-hospital-13176452/") },
  { src: "/photos/radiology/xray-review-01.jpg", alt: "طبيبة محجبة تراجع صورة أشعة للصدر", category: "radiology", orientation: "portrait", gender: "female", credit: px("Daniil Kondrashin", "https://www.pexels.com/photo/female-doctor-examines-x-ray-in-hospital-32254661/") },

  // ---------- pharmacy ----------
  { src: "/photos/pharmacy/pharmacist-01.jpg", alt: "صيدلانية بالمعطف الأبيض في الصيدلية", category: "pharmacy", orientation: "portrait", gender: "female", credit: px("BYB BYB", "https://www.pexels.com/photo/young-pharmacist-in-drugstore-19471013/") },
  { src: "/photos/pharmacy/pharmacist-02.jpg", alt: "صيدلانية بين رفوف الأدوية", category: "pharmacy", orientation: "portrait", gender: "female", credit: px("BYB BYB", "https://www.pexels.com/photo/young-pharmacist-texting-19471015/") },
  { src: "/photos/pharmacy/pharmacy-shelves-01.jpg", alt: "صيدلي يرتب رفوف الأدوية", category: "pharmacy", orientation: "portrait", gender: "male", credit: px("Ivan S", "https://www.pexels.com/photo/back-view-of-a-pharmacist-standing-in-front-of-a-cabinet-full-of-medication-9629685/") },

  // ---------- patients ----------
  { src: "/photos/patients/consultation-01.jpg", alt: "طبيبة تستشير مريضاً في العيادة", category: "patients", orientation: "landscape", credit: px("cottonbro studio", "https://www.pexels.com/photo/woman-in-white-suit-with-stethoscope-talking-to-a-person-7579823/") },
  { src: "/photos/patients/elderly-01.jpg", alt: "طبيبة تناقش الحالة الصحية مع مريض مسن", category: "patients", orientation: "landscape", credit: px("Vitaly Gariev", "https://www.pexels.com/photo/doctor-consulting-with-older-patient-in-office-39192358/") },
  { src: "/photos/patients/family-01.jpg", alt: "طبيبة تستقبل رجلاً مسناً وطفلاً في العيادة", category: "patients", orientation: "landscape", credit: px("Vitaly Gariev", "https://www.pexels.com/photo/doctor-consulting-senior-and-child-indoors-39192360/") },
  { src: "/photos/patients/phone-app-01.jpg", alt: "مراجعة محجبة تستخدم تطبيق الهاتف في صالة الانتظار", category: "patients", orientation: "landscape", gender: "female", credit: px("Cedric Fauntleroy", "https://www.pexels.com/photo/a-woman-browsing-her-smartphone-8154449/") },
];

export const photosBy = (c: PhotoCategory) => PHOTOS.filter((p) => p.category === c);

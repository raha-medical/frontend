/** أيقونة لكل تخصص طبي (UI-14) من المجموعة الموحدة. يطابق النص لأن التخصص حقل حر يأتي من الخادم. */
const RULES: [RegExp, string][] = [
  [/أسنان|سنان|تقويم/, "smile"],
  [/أطفال|اطفال|حديثي/, "baby"],
  [/نسائية|نسا|توليد/, "flower-2"],
  [/عيون|بصر/, "scan-eye"],
  [/أنف|انف|أذن|اذن|حنجرة/, "ear"],
  [/قلب/, "heart-pulse"],
  [/عظام|كسور/, "bone"],
  [/جلد/, "hand-heart"],
  [/أعصاب|اعصاب|دماغ/, "activity"],
  [/مختبر|تحليل|تحاليل/, "flask-conical"],
  [/أشعة|اشعة|سونار/, "scan-line"],
  [/صيدلية/, "pill"],
  [/جراحة/, "syringe"],
];

export function specialtyIcon(specialty: string | null | undefined): string {
  const s = specialty ?? "";
  return RULES.find(([re]) => re.test(s))?.[1] ?? "stethoscope";
}

/** الدرجات الدلالية المشتركة بين Badge وAlert وToast وChip. كلها من توكنز globals.css. */
export type Tone = "danger" | "warn" | "info" | "success";
export type BadgeTone = Tone | "primary" | "muted" | "lab" | "pharm";

/** خلفية هادئة + نص قوي (تباين ≥ 7:1 في الوضعين). */
export const TONE_SOFT: Record<BadgeTone, string> = {
  success: "bg-success-soft text-success-strong",
  warn: "bg-warn-soft text-warn-strong",
  danger: "bg-danger-soft text-danger-strong",
  info: "bg-info-soft text-info-strong",
  primary: "bg-primary-soft text-primary-strong",
  muted: "bg-bg text-ink-2",
  lab: "bg-lab-soft text-lab-strong",
  pharm: "bg-pharm-soft text-pharm-strong",
};
/** تعبئة صلبة + نص on-accent (أبيض في الفاتح، داكن في الداكن). */
export const TONE_SOLID: Record<BadgeTone, string> = {
  success: "bg-success text-on-accent",
  warn: "bg-warn text-on-accent",
  danger: "bg-danger text-on-accent",
  info: "bg-info text-on-accent",
  primary: "bg-primary text-on-accent",
  muted: "bg-ink-3 text-surface",
  lab: "bg-lab text-on-accent",
  pharm: "bg-pharm text-on-accent",
};
/** إطار ملون بلا خلفية. */
export const TONE_OUTLINE: Record<BadgeTone, string> = {
  success: "border border-success/50 text-success-strong",
  warn: "border border-warn/50 text-warn-strong",
  danger: "border border-danger/50 text-danger-strong",
  info: "border border-info/50 text-info-strong",
  primary: "border border-primary/50 text-primary-strong",
  muted: "border border-line-strong text-ink-2",
  lab: "border border-lab/50 text-lab-strong",
  pharm: "border border-pharm/50 text-pharm-strong",
};
export const TONE_DOT: Record<BadgeTone, string> = {
  success: "bg-success", warn: "bg-warn", danger: "bg-danger", info: "bg-info", primary: "bg-primary", muted: "bg-ink-muted", lab: "bg-lab", pharm: "bg-pharm",
};
/** أيقونة افتراضية لكل حالة: الشكل يفرّق الحالات أيضاً، لا اللون وحده (مهم لعمى الألوان). */
export const TONE_ICON: Record<Tone, string> = { danger: "circle-alert", warn: "triangle-alert", info: "info", success: "circle-check" };

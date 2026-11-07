import type { Config } from "tailwindcss";

/* كل الألوان من توكنز app/globals.css (فاتح/داكن). لا تضف ألواناً ثابتة هنا ولا داخل المكونات.
   التوثيق: components/ui/README.md */
const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const tone = (n: string) => ({ DEFAULT: c(n), strong: c(`${n}-strong`), soft: c(`${n}-soft`) });

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: c("bg"),
        surface: c("surface"),
        line: { DEFAULT: c("line"), strong: c("line-strong") },
        ink: { DEFAULT: c("ink"), 2: c("ink-2"), 3: c("ink-3"), muted: c("ink-muted") },
        "on-accent": c("on-accent"),
        primary: tone("primary"),
        success: tone("success"),
        warn: tone("warn"),
        danger: tone("danger"),
        info: tone("info"),
        lab: tone("lab"),
        pharm: tone("pharm"),
        gw: { zaincash: c("gw-zaincash"), qicard: c("gw-qicard") },
        brand: { navy: c("brand-navy"), green: c("brand-green"), "green-strong": c("brand-green-strong"), "green-deep": c("brand-green-deep") },
        nav: { medical: c("nav-medical"), finance: c("nav-finance"), active: c("nav-active") },
        "on-nav": { DEFAULT: c("on-nav"), 2: c("on-nav-2"), 3: c("on-nav-3"), icon: c("on-nav-icon"), success: c("on-nav-success"), warn: c("on-nav-warn"), danger: c("on-nav-danger") },
      },
      /* خط واحد للعربي واللاتيني والأرقام: Readex Pro */
      fontFamily: {
        sans: ["var(--font-readex)", "system-ui", "sans-serif"],
        num: ["var(--font-readex)", "system-ui", "sans-serif"],
      },
      /* سُلّم الخط: القيم تتغير حسب التطبيق (scale-staff / scale-patient / scale-display) */
      fontSize: {
        small: ["var(--text-small)", { lineHeight: "1.55" }],
        body: ["var(--text-body)", { lineHeight: "var(--leading-body)" }],
        heading: ["var(--text-heading)", { lineHeight: "1.35", fontWeight: "700" }],
        display: ["var(--text-display)", { lineHeight: "1.1", fontWeight: "700" }],
      },
      /* نصف القطر الموحّد 16–24px للبطاقات والأزرار والحقول.
         xl/2xl/3xl مُعاد تعريفها حتى تتبع الشاشات القديمة نفس النطاق تلقائياً. */
      borderRadius: {
        chip: "8px",
        control: "16px",
        field: "16px",
        card: "20px",
        panel: "24px",
        xl: "16px",
        "2xl": "20px",
        "3xl": "24px",
      },
      boxShadow: {
        float: "0 20px 44px -18px rgb(var(--shadow-ink) / .35)",
        card: "0 30px 60px -30px rgb(var(--shadow-ink) / .35)",
        pop: "0 12px 32px -10px rgb(var(--shadow-ink) / .25)",
        glass: "0 8px 32px -12px rgb(var(--shadow-ink) / .18)",
      },
      transitionDuration: { fast: "150ms", base: "200ms", slow: "250ms" },
      transitionTimingFunction: { out: "cubic-bezier(.2,.7,.2,1)" },
    },
  },
  plugins: [],
};
export default config;

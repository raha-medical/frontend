/** شعار الرحمة (SVG أصلي) بألوان تتبع الثيم: --mark-a كحلي/فاتح، --mark-b أخضر. */
export function BrandMark({ size = 40, className, tone = "auto", paper }: { size?: number; className?: string; tone?: "auto" | "onDark"; paper?: string }) {
  // onDark: فوق خلفية داكنة (القائمة الجانبية/لوحة الدخول) كما في Rahma Mark tone="dark"
  const a = tone === "onDark" ? "var(--mark-ondark-a)" : "var(--mark-a)", b = tone === "onDark" ? "var(--mark-ondark-b)" : "var(--mark-b)";
  const hole = tone === "onDark" ? paper ?? "rgb(var(--nav-finance))" : "var(--mark-hole)";
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} role="img" aria-label="شعار مجمع الرحمة الطبي">
      <path d="M141 33 A82 82 0 1 0 162.8 156.7" fill="none" stroke={a} strokeWidth="13" strokeLinecap="round" />
      <path d="M118.1 36.4 A70 70 0 1 0 163.4 133.6" fill="none" stroke={b} strokeWidth="5" strokeLinecap="round" />
      <g transform="translate(100 108) scale(1.04) translate(-100 -108)">
        <path d="M44 120 H58 L63 106 L69 132 L74 120 H79" fill="none" stroke={a} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M121 120 H127 L132 108 L137 130 L142 120 H156" fill="none" stroke={b} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M100 82 V68" stroke={b} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M100 44 C109 53 109 64 100 71 C91 64 91 53 100 44 Z" fill={b} />
        <path d="M99 75 C92 65 80 63 73 67 C79 76 91 78 99 75 Z" fill={b} />
        <path d="M101 75 C108 65 120 63 127 67 C121 76 109 78 101 75 Z" fill={b} />
        <circle cx="87" cy="93" r="9.5" fill={a} />
        <circle cx="113" cy="93" r="9.5" fill={b} />
        <path d="M100 152 C82 140 71 127 72 115 C73 104 88 101 100 112 Z" fill={a} />
        <path d="M100 152 C118 140 129 127 128 115 C127 104 112 101 100 112 Z" fill={b} />
        <circle cx="100" cy="128" r="6.5" fill={hole} />
        <path d="M58 132 C66 150 82 160 98 160" fill="none" stroke={a} strokeWidth="6" strokeLinecap="round" />
        <path d="M142 132 C134 150 118 160 102 160" fill="none" stroke={b} strokeWidth="6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

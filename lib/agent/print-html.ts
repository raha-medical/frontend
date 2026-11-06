/* مستند طباعة مستقل (نافذة منفصلة بلا globals.css): ألوانه أسود/رمادي حرفية عمداً لطابعات الإيصالات الحرارية. */
export type Paper = "80mm" | "label" | "a4";
const PAGE: Record<Paper, string> = {
  "80mm": "@page{size:80mm auto;margin:4mm} body{width:72mm;font-size:13px}",
  label: "@page{size:50mm 30mm;margin:1.5mm} body{width:47mm;font-size:10px;line-height:1.3}",
  a4: "@page{size:A4;margin:15mm} body{font-size:14px} table{width:100%;border-collapse:collapse} td,th{border-bottom:1px solid #ccc;padding:6px 4px;text-align:start}",
};
/** المستند الكامل للطباعة: نفسه للطباعة وللمعاينة (iframe srcDoc). */
export function printDocument(bodyHtml: string, title = "طباعة", paper: Paper = "80mm") {
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font-family:'Readex Pro',Tahoma,sans-serif;line-height:1.6;color:#000;margin:0}
      ${PAGE[paper]}
      h1{font-size:16px;text-align:center;margin:0 0 4px} .c{text-align:center} .row{display:flex;justify-content:space-between;gap:8px}
      hr{border:0;border-top:1px dashed #000;margin:6px 0} .n{direction:ltr;unicode-bidi:isolate;font-variant-numeric:tabular-nums}
      .big{font-size:34px;font-weight:700;text-align:center}
    </style></head><body>${bodyHtml}</body></html>`;
}

/** طباعة من المتصفح: iframe مخفي. 80mm إيصال حراري (محاكاة الوكيل)، label ملصق عينة، a4 نتيجة/تقرير على طابعة عادية. */
export function printHtml(bodyHtml: string, title = "طباعة", paper: Paper = "80mm") {
  return new Promise<void>((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(printDocument(bodyHtml, title, paper));
    doc.close();
    const done = () => { setTimeout(() => iframe.remove(), 500); resolve(); };
    iframe.contentWindow!.addEventListener("afterprint", done);
    setTimeout(() => { iframe.contentWindow!.focus(); iframe.contentWindow!.print(); }, 150);
    setTimeout(done, 60_000);
  });
}

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

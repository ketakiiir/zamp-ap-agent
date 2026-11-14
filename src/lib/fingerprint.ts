import { createHash } from "node:crypto";

/**
 * Duplicate catcher. Deliberately ignores the invoice number: a vendor who
 * resubmits the same bill under a fresh number still collides. Uses line
 * amounts rather than descriptions because amounts survive OCR and wording
 * changes, descriptions do not.
 */
export function fingerprint(vendorId: string, total: number, invoiceDate: string, lineAmounts: number[]): string {
  const amounts = lineAmounts.map((a) => (Math.round(a * 100) / 100).toFixed(2)).sort().join(",");
  const key = [vendorId, (Math.round(total * 100) / 100).toFixed(2), normaliseDate(invoiceDate), amounts].join("|");
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

export function normaliseDate(d: string): string {
  const iso = d.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return d.trim().toLowerCase();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
}

// Deterministic validation and decision logic. No model calls in this file:
// the same inputs always produce the same decision, and the rule that fired
// can be named on screen.

export const PRINCIPLE = "A payable invoice is legible, identified, matched, authorised and unique.";

/** Below this, a critical field cannot be trusted at all and goes to a human. */
export const READ_FLOOR = 0.6;

export type Verdict = "pass" | "fail" | "uncertain";
export type Decision = "Excellent" | "Good" | "Review Required" | "Reject";

export type Scorer = {
  key: "legible" | "identified" | "matched" | "authorised";
  label: string;
  verdict: Verdict;
  evidence: string;
  /** Pass-with-note items. Any note downgrades Excellent to Good. */
  notes: string[];
  /** Field names that could not be read (Identified only). */
  fields?: string[];
};

export type Field<T> = { value: T | null; confidence: number; source_text: string | null };

export type ExtractedLite = {
  vendor_name: Field<string>;
  invoice_number: Field<string>;
  invoice_date: Field<string>;
  total: Field<number>;
  tax: Field<number>;
  line_items: { amount: number | null }[];
};

export type VendorRow = { vendor_id: string; name: string; status: string; email: string | null };
export type PORow = { po_number: string; vendor_id: string; amount: number; tolerance_pct: number; description: string | null };
export type PriorInvoice = { invoice_id: string; invoice_number: string; invoice_date: string; total: number; run_id: string | null; po_number?: string | null };

export type ResolveResult = {
  vendor: VendorRow | null;
  vendor_match: string;
  po: PORow | null;
  po_match: string;
  candidates: { po_number: string; amount: number; score: number; why: string }[];
  prior_on_po: PriorInvoice[];
  prior_total: number;
  remaining: number | null;
};

export type DupResult = { by_fingerprint: PriorInvoice | null; by_number: PriorInvoice | null; fingerprint: string };

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function scoreLegible(quality: number, hasTextLayer: boolean, notes: string): Scorer {
  const how = hasTextLayer ? "Digital PDF with a text layer." : "No text layer, read by vision.";
  if (quality < 0.5) {
    return { key: "legible", label: "Legible", verdict: "uncertain", evidence: `Quality ${quality.toFixed(2)}. ${how} ${notes}`, notes: [] };
  }
  return { key: "legible", label: "Legible", verdict: "pass", evidence: `Quality ${quality.toFixed(2)}. ${how}`, notes: [] };
}

export function scoreIdentified(x: ExtractedLite): Scorer {
  const critical: [string, Field<unknown>][] = [
    ["invoice number", x.invoice_number],
    ["invoice date", x.invoice_date],
    ["total", x.total],
    ["vendor name", x.vendor_name],
  ];
  const weak = critical.filter(([, f]) => f.value === null || f.value === "" || f.confidence < READ_FLOOR);
  if (weak.length) {
    const desc = weak.map(([n, f]) => (f.value === null || f.value === "" ? `${n} missing` : `${n} unreadable (confidence ${f.confidence.toFixed(2)})`));
    return { key: "identified", label: "Identified", verdict: "uncertain", evidence: `Cannot trust: ${desc.join("; ")}.`, notes: [], fields: weak.map(([n]) => n) };
  }
  const min = Math.min(...critical.map(([, f]) => f.confidence));
  return { key: "identified", label: "Identified", verdict: "pass", evidence: `Invoice ${x.invoice_number.value}, dated ${x.invoice_date.value}, total ${money(x.total.value as number)}. Lowest field confidence ${min.toFixed(2)}.`, notes: [] };
}

export function scoreMatched(x: ExtractedLite, r: ResolveResult): Scorer & { variance?: number } {
  const base = { key: "matched" as const, label: "Matched" };
  if (!r.po || r.remaining === null) {
    return { ...base, verdict: "uncertain", evidence: `No purchase order resolves. ${r.po_match}`, notes: [], fields: ["no_po"] };
  }
  const total = x.total.value;
  if (total === null) return { ...base, verdict: "uncertain", evidence: "No total to match against the PO.", notes: [] };

  const lineSum = x.line_items.reduce((s, l) => s + (l.amount ?? 0), 0) + (x.tax.value ?? 0);
  if (x.line_items.length && Math.abs(lineSum - total) > Math.max(1, total * 0.005)) {
    return { ...base, verdict: "uncertain", evidence: `Line items plus tax sum to ${money(lineSum)} but the stated total is ${money(total)}.`, notes: [], variance: total - lineSum };
  }

  const po = r.po;
  const tolAmt = (po.amount * po.tolerance_pct) / 100;
  const over = total - r.remaining;
  const prior = r.prior_on_po.length
    ? ` ${r.prior_on_po.length} prior invoice(s) on this PO total ${money(r.prior_total)}, so ${money(r.remaining)} remains.`
    : "";

  if (over > tolAmt + 0.005) {
    return { ...base, verdict: "uncertain", evidence: `${money(total)} exceeds the remaining PO balance of ${money(r.remaining)} by ${money(over)}, beyond the ${po.tolerance_pct}% tolerance (${money(tolAmt)}).${prior}`, notes: [], variance: over };
  }
  const notes: string[] = [];
  if (over > 0.005) notes.push(`Over the remaining balance by ${money(over)}, within the ${po.tolerance_pct}% tolerance.`);
  if (r.prior_on_po.length) notes.push(`Split PO: approved against the cumulative balance after ${r.prior_on_po.length} prior invoice(s).`);
  if (over < -0.005) {
    const pct = Math.round((total / po.amount) * 100);
    notes.push(`Partial: covers ${pct}% of the PO, ${money(-over)} will remain open.`);
  }
  return { ...base, verdict: "pass", evidence: `${po.po_number} (${money(po.amount)}).${prior} Invoice ${money(total)} fits.`, notes };
}

export function scoreAuthorised(r: ResolveResult, d: DupResult): Scorer {
  const base = { key: "authorised" as const, label: "Authorised + Unique" };
  if (!r.vendor) return { ...base, verdict: "fail", evidence: `Vendor is not on the approved vendor list. ${r.vendor_match}`, notes: [] };
  if (r.vendor.status !== "approved") return { ...base, verdict: "fail", evidence: `${r.vendor.name} is on file but its status is "${r.vendor.status}", not approved.`, notes: [] };
  if (d.by_fingerprint) return { ...base, verdict: "fail", evidence: `Same vendor, total, date and line amounts as invoice ${d.by_fingerprint.invoice_number} already in the ledger. Different invoice number, same bill.`, notes: [], fields: ["duplicate"] };
  if (d.by_number) return { ...base, verdict: "fail", evidence: `Invoice number ${d.by_number.invoice_number} was already submitted by this vendor.`, notes: [], fields: ["duplicate"] };
  return { ...base, verdict: "pass", evidence: `${r.vendor.name} is approved (${r.vendor_match}). No fingerprint collision.`, notes: [] };
}

export type DecisionResult = {
  decision: Decision;
  rule: string;
  rule_text: string;
  routed_to: string;
  reason: string;
  confidence: number;
  auto_approved: boolean;
};

export const RULES: { id: string; condition: string; outcome: Decision; routed: string }[] = [
  { id: "R1", condition: "Triage: not an invoice", outcome: "Reject", routed: "Sender" },
  { id: "R2", condition: "Fingerprint or invoice number matches an existing invoice", outcome: "Reject", routed: "AP, linked to the original" },
  { id: "R3", condition: "Vendor not on the approved list, or not in approved status", outcome: "Reject", routed: "Procurement" },
  { id: "R4", condition: "Document illegible, or a critical field below the read floor", outcome: "Review Required", routed: "AP, unreadable field named" },
  { id: "R5", condition: "No PO resolves", outcome: "Review Required", routed: "Procurement (our data gap, not the vendor's)" },
  { id: "R6", condition: "Amount over remaining PO balance beyond tolerance, or totals do not add up", outcome: "Review Required", routed: "AP, with variance" },
  { id: "R7", condition: "All pass, with a note (tolerance, partial or split PO)", outcome: "Good", routed: "One-click approve queue" },
  { id: "R8", condition: "All pass, no notes", outcome: "Excellent", routed: "Auto-approve if gate is on and confidence clears it, else approve queue" },
];

export function decide(opts: {
  isInvoice: boolean;
  docType: string;
  scorers: Scorer[];
  minConfidence: number;
  autoApprove: boolean;
  autoThreshold: number;
}): DecisionResult {
  const r = (id: string) => RULES.find((x) => x.id === id)!;
  const mk = (id: string, reason: string, confidence: number, routed?: string, auto = false): DecisionResult => ({
    decision: r(id).outcome, rule: id, rule_text: r(id).condition, routed_to: routed ?? r(id).routed, reason, confidence, auto_approved: auto,
  });

  if (!opts.isInvoice) return mk("R1", `This is a ${opts.docType.replace("_", " ")}, not an invoice. Extraction and matching were skipped.`, 0.95, "Sender");

  const s = Object.fromEntries(opts.scorers.map((x) => [x.key, x])) as Record<Scorer["key"], Scorer>;
  const conf = opts.minConfidence;

  if (s.authorised.verdict === "fail") {
    const dup = s.authorised.fields?.includes("duplicate") ?? false;
    return mk(dup ? "R2" : "R3", s.authorised.evidence, conf);
  }
  if (s.legible.verdict !== "pass" || s.identified.verdict !== "pass") {
    const what = s.identified.verdict !== "pass" ? s.identified.evidence : s.legible.evidence;
    return mk("R4", `Cannot read is not the same as wrong. ${what}`, conf);
  }
  if (s.matched.verdict !== "pass") {
    const noPo = s.matched.fields?.includes("no_po") ?? false;
    return mk(noPo ? "R5" : "R6", s.matched.evidence, conf);
  }
  const notes = opts.scorers.flatMap((x) => x.notes);
  if (notes.length) return mk("R7", notes.join(" "), conf);

  const auto = opts.autoApprove && conf >= opts.autoThreshold;
  const reason = auto
    ? `All four checks pass with no notes and every critical field is above ${opts.autoThreshold.toFixed(2)} confidence. Auto-approved.`
    : opts.autoApprove
      ? `All four checks pass, but the lowest field confidence ${conf.toFixed(2)} is under the auto-approve gate of ${opts.autoThreshold.toFixed(2)}. Sent to the approve queue.`
      : "All four checks pass with no notes. Auto-approve is off, so it goes to the one-click approve queue.";
  return mk("R8", reason, conf, auto ? "Auto-approved" : "One-click approve queue", auto);
}

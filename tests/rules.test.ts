// Run: npm test   (Node 24 strips TypeScript types natively)
import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, scoreAuthorised, type DupResult, scoreIdentified, scoreLegible, scoreMatched, type ResolveResult } from "../src/lib/rules.ts";
import { fingerprint } from "../src/lib/fingerprint.ts";

const f = <T,>(value: T | null, confidence = 0.98) => ({ value, confidence, source_text: null });
const inv = (total: number, over: Partial<Record<string, unknown>> = {}) => ({
  vendor_name: f("Brightwater Cold Chain Inc"), invoice_number: f("BWC-1"), invoice_date: f("2026-11-12"),
  total: f(total), tax: f(0), line_items: [{ amount: total }], ...over,
}) as Parameters<typeof scoreIdentified>[0];
const vendor = { vendor_id: "V-103", name: "Brightwater", status: "approved", email: null };
const po = { po_number: "PO-4503", vendor_id: "V-103", amount: 48500, tolerance_pct: 1, description: null };
const resolved = (prior: number, extra: Partial<ResolveResult> = {}): ResolveResult => ({
  vendor, vendor_match: "name", po, po_match: "explicit", candidates: [],
  prior_on_po: prior ? [{ invoice_id: "p", invoice_number: "BWC-0", invoice_date: "2026-11-02", total: prior, run_id: null }] : [],
  prior_total: prior, remaining: 48500 - prior, ...extra,
});
const noDup: DupResult = { by_fingerprint: null, by_number: null, fingerprint: "x" };
const run = (x: ReturnType<typeof inv>, r: ResolveResult, d = noDup, quality = 0.95, auto = false) =>
  decide({ isInvoice: true, docType: "invoice", scorers: [scoreLegible(quality, true, ""), scoreIdentified(x), scoreMatched(x, r), scoreAuthorised(r, d)], minConfidence: 0.98, autoApprove: auto, autoThreshold: 0.95 });

test("clean full-PO invoice is Excellent and goes to queue when auto-approve is off", () => {
  const d = run(inv(48500), resolved(0));
  assert.equal(d.decision, "Excellent"); assert.equal(d.rule, "R8"); assert.equal(d.auto_approved, false);
});
test("auto-approve only fires when switched on and confidence clears the gate", () => {
  assert.equal(run(inv(48500), resolved(0), noDup, 0.95, true).auto_approved, true);
});
test("split PO: 40% invoice after a 60% prior is Good against cumulative balance", () => {
  const d = run(inv(19400), resolved(29100));
  assert.equal(d.decision, "Good"); assert.equal(d.rule, "R7"); assert.match(d.reason, /Split PO/);
});
test("over remaining balance beyond tolerance is Review Required R6", () => {
  assert.equal(run(inv(25000), resolved(29100)).rule, "R6");
});
test("within tolerance is Good with a note", () => {
  const d = run(inv(48700), resolved(0));
  assert.equal(d.decision, "Good"); assert.match(d.reason, /tolerance/);
});
test("unreadable invoice number is Review Required R4, not Reject", () => {
  const d = run(inv(6205, { invoice_number: f("OLP-8??13", 0.2) }), resolved(0));
  assert.equal(d.decision, "Review Required"); assert.equal(d.rule, "R4"); assert.match(d.reason, /invoice number/);
});
test("no PO is Review Required R5 routed to procurement", () => {
  const d = run(inv(3705), resolved(0, { po: null, remaining: null, po_match: "cites PO-7781 which does not exist" }));
  assert.equal(d.rule, "R5"); assert.match(d.routed_to, /Procurement/);
});
test("fingerprint collision is Reject R2 even with a new invoice number", () => {
  const dup: DupResult = { by_fingerprint: { invoice_id: "o", invoice_number: "TRD-2291", invoice_date: "2026-11-05", total: 8640, run_id: null }, by_number: null, fingerprint: "x" };
  assert.equal(run(inv(8640), resolved(0), dup).rule, "R2");
});
test("unknown vendor is Reject R3 even if the numbers are perfect", () => {
  assert.equal(run(inv(48500), resolved(0, { vendor: null })).rule, "R3");
});
test("suspended vendor is Reject R3", () => {
  assert.equal(run(inv(48500), resolved(0, { vendor: { ...vendor, status: "suspended" } })).rule, "R3");
});
test("not an invoice short-circuits to R1", () => {
  const d = decide({ isInvoice: false, docType: "delivery_note", scorers: [], minConfidence: 0.95, autoApprove: true, autoThreshold: 0.5 });
  assert.equal(d.rule, "R1"); assert.equal(d.decision, "Reject"); assert.equal(d.auto_approved, false);
});
test("fingerprint ignores invoice number and date format, and catches resubmission", () => {
  assert.equal(fingerprint("V-104", 8640, "2026-11-05", [6000, 2640]), fingerprint("V-104", 8640.0, "November 5, 2026", [2640, 6000]));
  assert.notEqual(fingerprint("V-104", 8640, "2026-11-05", [6000, 2640]), fingerprint("V-104", 8640, "2026-11-06", [6000, 2640]));
});

test("a line whose quantity x unit price does not equal its amount goes to a person (R6)", () => {
  const x = inv(48500, { line_items: [{ description: "Linehaul", quantity: 2, unit_price: 20000, amount: 48500 }] });
  const d = run(x, resolved(0));
  assert.equal(d.rule, "R6"); assert.match(d.reason, /multiplies to/);
});
test("correct line maths still passes", () => {
  const x = inv(48500, { line_items: [{ description: "Linehaul", quantity: 2, unit_price: 24250, amount: 48500 }] });
  assert.equal(run(x, resolved(0)).rule, "R8");
});

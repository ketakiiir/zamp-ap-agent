import { put } from "@vercel/blob";
import { extractText, getDocumentProxy } from "unpdf";
import { ensureDb, getSettings, sql } from "./db";
import { fingerprint, normaliseDate } from "./fingerprint";
import { draftMessage, EXTRACT_MODEL, runExtraction, runTriage, TRIAGE_MODEL, type Extraction, type Usage } from "./models";
import {
  decide, scoreAuthorised, scoreIdentified, scoreLegible, scoreMatched,
  type DupResult, type PORow, type PriorInvoice, type ResolveResult, type Scorer, type VendorRow,
} from "./rules";

export const STAGES = [
  { n: 0, key: "upload", name: "Upload", blurb: "Store the PDF, open a run" },
  { n: 1, key: "triage", name: "Ingest and triage", blurb: `Is it an invoice? How legible? (${TRIAGE_MODEL})` },
  { n: 2, key: "extract", name: "Extract", blurb: `Every field with confidence and source text (${EXTRACT_MODEL})` },
  { n: 3, key: "resolve", name: "Resolve", blurb: "Find the vendor and purchase order, with history" },
  { n: 4, key: "validate", name: "Validate", blurb: "Four independent scorers: pass, fail or uncertain" },
  { n: 5, key: "decide", name: "Decide", blurb: "Deterministic rules, first match wins" },
  { n: 6, key: "explain", name: "Explain and route", blurb: "Decision record, routing, outbound draft" },
] as const;

export type StageStatus = "waiting" | "running" | "done" | "skipped" | "error";
export type StageRecord = { stage: number; status: StageStatus; ms?: number; summary?: string; output?: unknown };
export type RunEvent =
  | { type: "run"; run_id: string; filename: string; blob_url: string | null }
  | ({ type: "stage" } & StageRecord)
  | { type: "done"; run_id: string; decision: string; rule: string; ms_total: number; cost_usd: number }
  | { type: "error"; message: string };

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/&/g, " and ").replace(/\b(llc|inc|ltd|co|corp|company|limited|the)\b/g, "").replace(/[^a-z0-9]/g, "");
const normId = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function runPipeline(file: { name: string; bytes: Uint8Array }, send: (e: RunEvent) => void) {
  const t0 = Date.now();
  const runId = `run_${t0.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const usages: Usage[] = [];
  const cost = () => usages.reduce((s, u) => s + u.cost_usd, 0);

  await ensureDb();
  const settings = await getSettings();

  const record = async (rec: StageRecord) => {
    send({ type: "stage", ...rec });
    if (rec.status === "running") return;
    await sql`UPDATE runs SET stages = stages || jsonb_build_object(${String(rec.stage)}::text, ${JSON.stringify(rec)}::jsonb) WHERE run_id = ${runId}`;
  };
  const timed = async <T>(stage: number, fn: () => Promise<{ out: T; summary: string }>): Promise<T> => {
    send({ type: "stage", stage, status: "running" });
    const s = Date.now();
    try {
      const { out, summary } = await fn();
      await record({ stage, status: "done", ms: Date.now() - s, summary, output: out });
      return out;
    } catch (e) {
      await record({ stage, status: "error", ms: Date.now() - s, summary: (e as Error).message });
      throw e;
    }
  };

  // ---------- Stage 0: upload ----------
  send({ type: "stage", stage: 0, status: "running" });
  const s0 = Date.now();
  let blobUrl: string | null = null;
  try {
    const blob = await put(`invoices/${runId}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`, Buffer.from(file.bytes), {
      access: "public", contentType: "application/pdf",
    });
    blobUrl = blob.url;
  } catch (e) {
    console.warn("Blob upload skipped:", (e as Error).message);
  }
  await sql`INSERT INTO runs (run_id, blob_url, filename, status) VALUES (${runId}, ${blobUrl}, ${file.name}, 'running')`;
  send({ type: "run", run_id: runId, filename: file.name, blob_url: blobUrl });
  await record({ stage: 0, status: "done", ms: Date.now() - s0, summary: blobUrl ? "Stored in Blob, run opened" : "Run opened (blob storage unavailable)", output: { run_id: runId, blob_url: blobUrl, bytes: file.bytes.length } });

  try {
    const b64 = Buffer.from(file.bytes).toString("base64");

    // ---------- Stage 1: triage ----------
    const tri = await timed(1, async () => {
      let text = "";
      let pages = 0;
      try {
        const pdf = await getDocumentProxy(new Uint8Array(file.bytes));
        const r = await extractText(pdf, { mergePages: true });
        text = r.text as string;
        pages = r.totalPages;
      } catch {
        /* unreadable PDF structure: let the model judge */
      }
      const has_text_layer = text.replace(/\s/g, "").length > 40;
      const { triage, usage } = await runTriage(b64, has_text_layer);
      usages.push(usage);
      const out = { ...triage, has_text_layer, pages, cost_usd: usage.cost_usd };
      const summary = triage.is_invoice
        ? `Invoice. Quality ${triage.quality_score.toFixed(2)}, ${has_text_layer ? "text layer present" : "image only, vision path"}.`
        : `Not an invoice: ${triage.document_type.replace("_", " ")}. Short circuit to decision.`;
      return { out, summary };
    });

    let scorers: Scorer[] = [];
    let extraction: Extraction | null = null;
    let resolve: ResolveResult | null = null;
    let dup: DupResult | null = null;

    if (!tri.is_invoice) {
      for (const n of [2, 3, 4]) await record({ stage: n, status: "skipped", summary: "Skipped: triage rejected the document before the expensive model ran." });
    } else {
      // ---------- Stage 2: extract ----------
      extraction = await timed(2, async () => {
        let extraction: Extraction;
        try {
          const r = await runExtraction(b64);
          usages.push(r.usage);
          extraction = r.extraction;
        } catch (e) {
          // Never crash on a bad read: an empty, zero-confidence record routes to a human via R4.
          const f = { value: null, confidence: 0, source_text: null };
          extraction = {
            vendor_name: { ...f, value: tri.vendor_hint }, vendor_tax_id: f, invoice_number: f, invoice_date: f, due_date: f,
            po_reference: f, currency: f, subtotal: f, tax: f, total: f, line_items: [], notes: `Extraction failed: ${(e as Error).message}`,
          };
        }
        const low = (["vendor_name", "invoice_number", "invoice_date", "total", "po_reference"] as const)
          .filter((k) => extraction[k].value !== null && extraction[k].confidence < 0.6);
        return {
          out: extraction,
          summary: `${extraction.line_items.length} line items, total ${extraction.total.value ?? "missing"}.${low.length ? ` Low confidence: ${low.join(", ")}.` : ""}`,
        };
      });
      const x = extraction;

      // ---------- Stage 3: resolve ----------
      resolve = await timed(3, async () => {
        const vendors = (await sql`SELECT vendor_id, name, aliases, tax_id, status, email FROM approved_vendors`) as (VendorRow & { aliases: string[]; tax_id: string })[];
        let vendor: VendorRow | null = null;
        let vendor_match = `"${x.vendor_name.value ?? "unknown"}" matched no vendor by tax id, name or alias.`;
        const tid = normId(x.vendor_tax_id.value);
        const byTax = tid ? vendors.find((v) => normId(v.tax_id) === tid) : undefined;
        const n = norm(x.vendor_name.value);
        const byName = n ? vendors.find((v) => [v.name, ...v.aliases].some((a) => norm(a) === n)) : undefined;
        const byContains = n.length > 5 ? vendors.find((v) => [v.name, ...v.aliases].some((a) => norm(a).includes(n) || n.includes(norm(a)))) : undefined;
        const hit = byTax ?? byName ?? byContains;
        if (hit) {
          vendor = { vendor_id: hit.vendor_id, name: hit.name, status: hit.status, email: hit.email };
          vendor_match = byTax ? `matched on tax id ${hit.tax_id}` : byName ? "matched on name or alias" : "matched on partial name";
        }

        let po: PORow | null = null;
        let po_match = "";
        let candidates: ResolveResult["candidates"] = [];
        if (vendor) {
          const open = ((await sql`SELECT po_number, vendor_id, amount::float AS amount, tolerance_pct::float AS tolerance_pct, description FROM purchase_orders WHERE vendor_id = ${vendor.vendor_id} AND status = 'open'`) as PORow[]);
          const ref = normId(x.po_reference.value);
          if (ref) {
            const exact = ((await sql`SELECT po_number, vendor_id, amount::float AS amount, tolerance_pct::float AS tolerance_pct, description FROM purchase_orders`) as PORow[]).find((p) => normId(p.po_number) === ref);
            if (exact && exact.vendor_id === vendor.vendor_id) { po = exact; po_match = `Explicit reference ${exact.po_number} on the invoice.`; }
            else if (exact) po_match = `Invoice cites ${exact.po_number}, but that PO belongs to a different vendor.`;
            else po_match = `Invoice cites "${x.po_reference.value}", which does not exist in the PO system.${open.length ? "" : ` ${vendor.name} has no open POs.`}`;
          } else if (open.length === 1) {
            po = open[0]; po_match = `No PO on the invoice; implied as ${vendor.name}'s only open PO.`;
          } else {
            po_match = open.length ? `No PO on the invoice and ${open.length} open POs, so it is ambiguous.` : `No PO on the invoice and ${vendor.name} has no open POs.`;
          }
          const total = x.total.value ?? 0;
          candidates = open.map((p) => ({ po_number: p.po_number, amount: p.amount, score: Math.max(0, 1 - Math.abs(p.amount - total) / Math.max(p.amount, 1)), why: p.description ?? "" }))
            .sort((a, b) => b.score - a.score);
        } else {
          po_match = "Vendor unknown, so no PO can be trusted.";
        }

        let prior_on_po: PriorInvoice[] = [];
        let prior_total = 0;
        let remaining: number | null = null;
        if (po) {
          prior_on_po = (await sql`SELECT invoice_id, invoice_number, invoice_date, total::float AS total, run_id FROM invoices WHERE po_number = ${po.po_number} AND decision <> 'Reject'`) as PriorInvoice[];
          prior_total = prior_on_po.reduce((s, i) => s + i.total, 0);
          remaining = Math.round((po.amount - prior_total) * 100) / 100;
        }
        const out: ResolveResult = { vendor, vendor_match, po, po_match, candidates, prior_on_po, prior_total, remaining };
        return { out, summary: `${vendor ? vendor.name : "Unknown vendor"}. ${po ? `${po.po_number}, ${remaining?.toFixed(2)} remaining.` : "No PO."}` };
      });

      // ---------- Stage 4: validate ----------
      const r = resolve;
      scorers = await timed(4, async () => {
        const fp = fingerprint(r.vendor?.vendor_id ?? norm(x.vendor_name.value), x.total.value ?? 0, normaliseDate(x.invoice_date.value ?? ""), x.line_items.map((l) => l.amount ?? 0));
        let by_fingerprint: PriorInvoice | null = null;
        let by_number: PriorInvoice | null = null;
        if (r.vendor) {
          const prior = (await sql`SELECT invoice_id, invoice_number, invoice_date, total::float AS total, run_id, po_number, fingerprint FROM invoices WHERE vendor_id = ${r.vendor.vendor_id} AND decision <> 'Reject'`) as (PriorInvoice & { fingerprint: string })[];
          by_fingerprint = prior.find((p) => p.fingerprint === fp) ?? null;
          const num = normId(x.invoice_number.value);
          by_number = num ? prior.find((p) => normId(p.invoice_number) === num) ?? null : null;
        }
        dup = { by_fingerprint, by_number, fingerprint: fp };
        const out = [
          scoreLegible(tri.quality_score, tri.has_text_layer, tri.legibility_notes),
          scoreIdentified(x),
          scoreMatched(x, r),
          scoreAuthorised(r, dup),
        ];
        return { out, summary: out.map((s) => `${s.label}: ${s.verdict}`).join(" · ") };
      });
    }

    // ---------- Stage 5: decide ----------
    const x = extraction;
    const minConfidence = x
      ? Math.min(x.invoice_number.confidence, x.invoice_date.confidence, x.total.confidence, x.vendor_name.confidence)
      : 0.95;
    const decision = await timed(5, async () => {
      const d = decide({
        isInvoice: tri.is_invoice, docType: tri.document_type, scorers, minConfidence,
        autoApprove: settings.auto_approve, autoThreshold: settings.confidence_threshold,
      });
      return { out: { ...d, settings }, summary: `${d.decision} by ${d.rule}. ${d.routed_to}.` };
    });

    // ---------- Stage 6: explain and route ----------
    const d = dup as DupResult | null;
    const final = await timed(6, async () => {
      const vendorName = resolve?.vendor?.name ?? x?.vendor_name.value ?? tri.vendor_hint ?? "the sender";
      let draft: string | null = null;
      let audience = "none";
      if (decision.decision === "Reject" || decision.decision === "Review Required") {
        audience = decision.rule === "R5" || decision.rule === "R3" ? "Procurement (internal)" : decision.rule === "R2" ? "AP (internal)" : "Vendor";
        const brief = [
          `From: Meadowgate Provisions accounts payable. To: ${audience === "Vendor" ? vendorName : audience}.`,
          `Document: ${file.name}. Invoice number: ${x?.invoice_number.value ?? "unreadable"}. Total: ${x?.total.value ?? "unknown"}.`,
          `Outcome: ${decision.decision} (${decision.rule}: ${decision.rule_text}).`,
          `Reason: ${decision.reason}`,
          decision.rule === "R2" && d?.by_fingerprint ? `Original invoice: ${d.by_fingerprint.invoice_number} dated ${d.by_fingerprint.invoice_date}.` : "",
          decision.rule === "R5" ? "Ask procurement to raise or link the PO. Make clear the vendor is not at fault." : "",
          decision.rule === "R4" ? "Ask the vendor to resend a clean copy with the unreadable field legible." : "",
          decision.rule === "R1" ? "Thank the sender and ask them to send the invoice itself." : "",
        ].filter(Boolean).join("\n");
        const m = await draftMessage(brief);
        usages.push(m.usage);
        draft = m.text;
      }
      const amount = x?.total.value ?? null;
      const atRisk = decision.decision === "Reject" ? 0 : amount ?? 0;
      const reviewState = decision.auto_approved ? "auto_approved" : decision.decision === "Reject" ? "closed" : "pending";

      if (tri.is_invoice && x) {
        const fp = d?.fingerprint ?? null;
        await sql`INSERT INTO invoices (invoice_id, run_id, po_number, vendor_id, invoice_number, invoice_date, total, fingerprint, decision)
          VALUES (${`inv_${runId}`}, ${runId}, ${resolve?.po?.po_number ?? null}, ${resolve?.vendor?.vendor_id ?? null}, ${x.invoice_number.value}, ${x.invoice_date.value}, ${amount}, ${fp}, ${decision.decision})`;
      }
      const msTotal = Date.now() - t0;
      await sql`UPDATE runs SET status = 'complete', decision = ${decision.decision}, confidence = ${decision.confidence}, rule_fired = ${decision.rule},
        routed_to = ${decision.routed_to}, reason = ${decision.reason}, vendor_name = ${vendorName}, invoice_number = ${x?.invoice_number.value ?? null},
        amount = ${amount}, amount_at_risk = ${atRisk}, auto_approved = ${decision.auto_approved}, review_state = ${reviewState},
        cost_usd = ${cost()}, ms_total = ${msTotal} WHERE run_id = ${runId}`;
      const out = { routed_to: decision.routed_to, audience, draft, review_state: reviewState, cost_usd: cost(), usages, audit: `Rule ${decision.rule} fired. ${decision.reason}` };
      return { out, summary: decision.auto_approved ? "Auto-approved and logged." : `Routed to ${decision.routed_to}.${draft ? " Message drafted." : ""}` };
    });

    send({ type: "done", run_id: runId, decision: decision.decision, rule: decision.rule, ms_total: Date.now() - t0, cost_usd: final.cost_usd });
  } catch (e) {
    const msg = (e as Error).message;
    await sql`UPDATE runs SET status = 'error', reason = ${msg}, ms_total = ${Date.now() - t0}, cost_usd = ${cost()} WHERE run_id = ${runId}`;
    send({ type: "error", message: msg });
  }
}

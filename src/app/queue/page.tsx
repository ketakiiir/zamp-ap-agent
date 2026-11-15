import { ensureDb, sql } from "@/lib/db";
import { QueueList, type QueueItem } from "./QueueList";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  await ensureDb();
  const rows = (await sql`SELECT run_id, filename, blob_url, vendor_name, invoice_number, amount::float AS amount, amount_at_risk::float AS amount_at_risk,
    decision, rule_fired, routed_to, reason, stages, created_at FROM runs
    WHERE status = 'complete' AND review_state = 'pending' AND decision IN ('Review Required', 'Good', 'Excellent')
    ORDER BY amount_at_risk DESC NULLS LAST, created_at`) as any[];
  const items: QueueItem[] = rows.map((r) => {
    const x = r.stages?.["2"]?.output ?? null;
    const s4 = r.stages?.["4"]?.output ?? [];
    return {
      run_id: r.run_id, filename: r.filename, blob_url: r.blob_url, vendor_name: r.vendor_name, invoice_number: r.invoice_number,
      amount: r.amount, amount_at_risk: r.amount_at_risk, decision: r.decision, rule: r.rule_fired, routed_to: r.routed_to, reason: r.reason,
      draft: r.stages?.["6"]?.output?.draft ?? null, audience: r.stages?.["6"]?.output?.audience ?? null,
      fields: x ? (["invoice_number", "invoice_date", "total", "po_reference", "vendor_name"] as const).map((k) => ({
        key: k, value: x[k]?.value === null || x[k]?.value === undefined ? "" : String(x[k].value), confidence: x[k]?.confidence ?? 0, source: x[k]?.source_text ?? null,
      })) : [],
      flags: (s4 as any[]).filter((s) => s.verdict !== "pass" || s.notes?.length).map((s) => ({ label: s.label, verdict: s.verdict, text: s.verdict !== "pass" ? s.evidence : s.notes.join(" ") })),
      created_at: new Date(r.created_at).toISOString(),
    };
  });
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-semibold">Review queue</h1>
        <p className="text-sm text-zinc-500">Invoices waiting for a person, biggest amount first. Pick one on the left, check the flagged fields against the document, correct anything the agent could not read, then approve or reject.</p>
      </div>
      <div data-tour="queue"><QueueList items={items} /></div>
    </main>
  );
}

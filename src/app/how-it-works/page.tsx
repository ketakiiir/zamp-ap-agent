import { PRINCIPLE, READ_FLOOR, RULES } from "@/lib/rules";
import { POS, PRIOR_INVOICES, VENDORS } from "@/lib/seed";
import { SAMPLES } from "@/lib/samples";
import { DecisionChip, money } from "@/components/ui";

const PIPE = [
  { n: 0, name: "Upload", what: "PDF stored, run opened", model: null },
  { n: 1, name: "Triage", what: "Invoice or not? Legible?", model: "Haiku" },
  { n: 2, name: "Extract", what: "Fields + confidence + source text", model: "Opus" },
  { n: 3, name: "Resolve", what: "Vendor, PO, prior invoices", model: null },
  { n: 4, name: "Validate", what: "Four independent scorers", model: null },
  { n: 5, name: "Decide", what: "Rules R1 to R8, first match", model: null },
  { n: 6, name: "Explain", what: "Route, audit, draft email", model: "Haiku" },
];

const SCORERS = [
  { name: "Legible", q: "Can the document be read at all?", fail: "never fails; poor quality is uncertain" },
  { name: "Identified", q: "Are invoice number, date, total and vendor present and confidently read?", fail: `uncertain below ${READ_FLOOR} confidence, named field` },
  { name: "Matched", q: "Does the total fit the remaining PO balance within tolerance, and do the lines add up?", fail: "uncertain on no PO or variance beyond tolerance" },
  { name: "Authorised + Unique", q: "Is the vendor approved, and is this bill new?", fail: "fails on unapproved vendor or fingerprint collision" },
];

export default function HowItWorks() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">How it works</h1>
        <p className="mt-2 max-w-3xl text-zinc-600">
          An AP agent is not a reader, it is a decider. The model reads the document. Plain code makes the decision, so the same invoice always gets the same answer and the rule that fired can be named.
        </p>
        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-900"><b>Principle:</b> {PRINCIPLE}</div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">The pipeline</h2>
        <div className="flex flex-wrap items-stretch gap-2">
          {PIPE.map((p, i) => (
            <div key={p.n} className="flex items-center gap-2">
              <div className={`w-36 rounded-lg border p-3 ${p.model ? "border-violet-200 bg-violet-50" : "border-zinc-200 bg-white"}`}>
                <div className="font-mono text-xs text-zinc-400">{p.n}</div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-zinc-600">{p.what}</div>
                <div className="mt-1 text-[11px] font-medium text-violet-700">{p.model ? `model: ${p.model}` : "deterministic"}</div>
              </div>
              {i < PIPE.length - 1 && <span className="text-zinc-300">→</span>}
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-zinc-600">
          Triage can short-circuit straight to a decision. A delivery note never reaches the expensive extraction call: stages 2 to 4 visibly skip and the run costs a fraction of a cent.
          One streaming request runs the whole pipeline, and every stage is saved as it completes, so a past run reopens exactly as it ran.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {SCORERS.map((s) => (
          <div key={s.name} className="rounded-xl border border-zinc-200 bg-white p-4">
            <div className="font-medium">{s.name}</div>
            <div className="mt-1 text-sm text-zinc-700">{s.q}</div>
            <div className="mt-1 text-xs text-zinc-500">{s.fail}</div>
          </div>
        ))}
        <p className="text-sm text-zinc-600 md:col-span-2">
          Fail means definitely wrong. Uncertain means the agent cannot tell. Any fail leads to Reject, any uncertain leads to Review Required. Keeping the two apart is the point: cannot read is not the same as wrong.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Decision rules (first match wins)</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs text-zinc-500"><tr><th className="px-3 py-2">Rule</th><th className="px-3 py-2">Condition</th><th className="px-3 py-2">Outcome</th><th className="px-3 py-2">Routed to</th></tr></thead>
            <tbody>{RULES.map((r) => (
              <tr key={r.id} className="border-t border-zinc-100"><td className="px-3 py-2 font-mono">{r.id}</td><td className="px-3 py-2">{r.condition}</td><td className="px-3 py-2"><DecisionChip decision={r.outcome} /></td><td className="px-3 py-2 text-zinc-600">{r.routed}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Edge cases built</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {SAMPLES.map((s) => (
            <div key={s.file} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2"><span className="font-medium">{s.title}</span><span className="flex items-center gap-1"><DecisionChip decision={s.expect} /><span className="font-mono text-xs text-zinc-400">{s.rule}</span></span></div>
              <p className="mt-1 text-sm text-zinc-600">{s.why}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Reference data (fictional)</h2>
          <table className="w-full text-left text-xs">
            <thead className="text-zinc-500"><tr><th className="py-1">PO</th><th>Vendor</th><th className="text-right">Amount</th><th className="text-right">Tol.</th></tr></thead>
            <tbody>{POS.map((p) => (
              <tr key={p.po_number} className="border-t border-zinc-100"><td className="py-1 font-mono">{p.po_number}</td><td>{VENDORS.find((v) => v.vendor_id === p.vendor_id)?.name}</td><td className="text-right">{money(p.amount)}</td><td className="text-right">{p.tolerance_pct}%</td></tr>
            ))}</tbody>
          </table>
          <p className="mt-2 text-xs text-zinc-500">Already in the ledger: {PRIOR_INVOICES.map((i) => `${i.invoice_number} (${money(i.total)} on ${i.po_number})`).join(", ")}. Quillon Haulage is on file but suspended.</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Assumptions</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
            <li>Auto-approve ships switched off. An agent that is right 95% of the time still should not release money on day one; it is turned on deliberately, with a high confidence gate, after watching it run.</li>
            <li>Duplicates are caught by fingerprint (vendor, total, date, line amounts), not invoice number, because a resubmission usually carries a fresh number.</li>
            <li>A split PO is judged against the cumulative balance: prior non-rejected invoices on the same PO are subtracted first.</li>
            <li>No matching PO is our data gap, so it goes to procurement, not back to the vendor.</li>
            <li>An unknown or suspended vendor is rejected to procurement for onboarding, whatever the numbers say.</li>
            <li>Manual baseline: 4 minutes per invoice. Stated, not measured.</li>
            <li>All companies, people and numbers are invented for this demo.</li>
          </ul>
        </div>
      </section>
    </main>
  );
}

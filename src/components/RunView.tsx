"use client";

import { useState } from "react";
import { DecisionChip, VerdictChip, money } from "./ui";

export type StageRecord = { stage: number; status: "waiting" | "running" | "done" | "skipped" | "error"; ms?: number; summary?: string; output?: any };

export const STAGES = [
  { n: 0, short: "Receive", name: "Receive the invoice", plain: "Saves a copy of the PDF and opens a case file for it." },
  { n: 1, short: "Screen", name: "Is it really an invoice?", plain: "A fast, cheap AI check: is this an invoice at all, and is it readable?" },
  { n: 2, short: "Read", name: "Read every field", plain: "A stronger AI reads each field and says how sure it is, and where on the page it saw it." },
  { n: 3, short: "Look up", name: "Find the supplier and PO", plain: "Matches the supplier to our approved list and finds the purchase order (PO) it bills against." },
  { n: 4, short: "Check", name: "Run four checks", plain: "Readable? Complete? Do the amounts fit the PO? Approved supplier and not a duplicate?" },
  { n: 5, short: "Decide", name: "Decide", plain: "Fixed rules, not the AI, turn the four checks into one decision, and name the rule used." },
  { n: 6, short: "Route", name: "Send it to the right place", plain: "Queues it for approval, or drafts a note to whoever needs to act." },
];

export const VERDICT_COPY: Record<string, { headline: string; tone: string; icon: string }> = {
  Excellent: { headline: "Ready to pay", tone: "border-emerald-300 bg-emerald-50", icon: "✓" },
  Good: { headline: "Ready to pay, with a note", tone: "border-sky-300 bg-sky-50", icon: "✓" },
  "Review Required": { headline: "Needs a person to look", tone: "border-amber-300 bg-amber-50", icon: "?" },
  Reject: { headline: "Rejected", tone: "border-rose-300 bg-rose-50", icon: "✕" },
};

export function RunView({ stages, pdfUrl, filename, runId, error }: {
  stages: Record<number, StageRecord>;
  pdfUrl: string | null;
  filename: string;
  runId?: string | null;
  startedAt?: number | null;
  error?: string | null;
}) {
  const decision = stages[5]?.status === "done" ? stages[5].output : null;
  const route = stages[6]?.output;
  const totalMs = Object.values(stages).reduce((s, x) => s + (x.ms ?? 0), 0);

  return (
    <div className="space-y-4">
      <Stepper stages={stages} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div data-tour="pdf" className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 lg:sticky lg:top-20 lg:h-[calc(100vh-8rem)]">
          <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
            <span className="truncate font-medium">The invoice: {filename}</span>
            {runId && <span className="font-mono text-zinc-400">{runId}</span>}
          </div>
          {pdfUrl ? (
            <iframe src={`${pdfUrl}#toolbar=0&view=FitH`} className="h-full min-h-[420px] w-full flex-1" title="Invoice preview" />
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-zinc-400">No preview stored for this run</div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          {decision && <Verdict d={decision} route={route} totalMs={totalMs} />}
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Something went wrong: {error}. The steps that finished are kept below.</div>}
          {STAGES.map((st) => {
            const rec = stages[st.n] ?? { stage: st.n, status: "waiting" as const };
            return <StageCard key={st.n} meta={st} rec={rec} />;
          })}
        </div>
      </div>
    </div>
  );
}

function Stepper({ stages }: { stages: Record<number, StageRecord> }) {
  return (
    <ol data-tour="stepper" className="flex items-center gap-1 overflow-x-auto rounded-xl border border-zinc-200 bg-white px-3 py-3">
      {STAGES.map((s, i) => {
        const st = stages[s.n]?.status ?? "waiting";
        const dot = st === "done" ? "bg-emerald-500 text-white" : st === "running" ? "bg-indigo-600 text-white ring-4 ring-indigo-100" : st === "skipped" ? "bg-zinc-200 text-zinc-500" : st === "error" ? "bg-rose-500 text-white" : "bg-zinc-100 text-zinc-400";
        return (
          <li key={s.n} className="flex min-w-fit items-center gap-1">
            <span className="flex items-center gap-2">
              <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold transition ${dot}`}>
                {st === "done" ? "✓" : st === "skipped" ? "–" : st === "running" ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : i + 1}
              </span>
              <span className={`text-xs font-medium ${st === "waiting" ? "text-zinc-400" : "text-zinc-800"}`}>{s.short}</span>
            </span>
            {i < STAGES.length - 1 && <span className={`mx-1 h-px w-6 sm:w-10 ${st === "done" || st === "skipped" ? "bg-emerald-300" : "bg-zinc-200"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

function Verdict({ d, route, totalMs }: { d: any; route: any; totalMs: number }) {
  const c = VERDICT_COPY[d.decision] ?? VERDICT_COPY["Review Required"];
  const headline = d.auto_approved ? "Approved automatically" : c.headline;
  const next = d.auto_approved
    ? "No one needs to touch it. It passed every check and cleared the confidence bar."
    : d.decision === "Reject"
      ? `It will not be paid. ${route?.draft ? "A note has been drafted below explaining why." : ""}`
      : d.decision === "Review Required"
        ? `It is waiting in the Review queue. Owner: ${d.routed_to}.`
        : "It is waiting in the Review queue for a one-click approval.";
  return (
    <div data-tour="decision" className={`rounded-xl border-2 p-4 ${c.tone}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-2xl font-semibold tracking-tight text-zinc-900">{c.icon} {headline}</span>
        <DecisionChip decision={d.decision} />
        <span className="ml-auto text-xs text-zinc-600">{(totalMs / 1000).toFixed(1)} seconds{route?.cost_usd !== undefined && ` · AI cost $${route.cost_usd.toFixed(3)}`}</span>
      </div>
      <p className="mt-2 text-sm text-zinc-800"><b>Why:</b> {d.reason}</p>
      <p className="mt-1 text-sm text-zinc-700"><b>What happens next:</b> {next}</p>
      <p className="mt-2 text-xs text-zinc-500">
        Decided by rule <span className="font-mono">{d.rule}</span>: {d.rule_text}. <a href="/how-it-works#rules" className="underline hover:text-zinc-800">See all rules</a>
      </p>
    </div>
  );
}

function StageCard({ meta, rec }: { meta: (typeof STAGES)[number]; rec: StageRecord }) {
  const [toggled, setOpen] = useState<boolean | null>(null);
  const open = toggled ?? (rec.status === "done" && [2, 4, 6].includes(meta.n));
  const hasBody = rec.status === "done" && rec.output !== undefined;
  const badge = {
    waiting: <span className="text-xs text-zinc-400">waiting</span>,
    running: <span className="text-xs font-medium text-indigo-600">working…</span>,
    done: <span className="text-xs text-zinc-400">{rec.ms !== undefined ? `${(rec.ms / 1000).toFixed(1)}s` : "done"}</span>,
    skipped: <span className="text-xs text-zinc-500">skipped</span>,
    error: <span className="text-xs font-medium text-rose-600">failed</span>,
  }[rec.status];

  return (
    <div data-tour={`stage-${meta.n}`} className={`rounded-xl border bg-white transition ${rec.status === "running" ? "border-indigo-300 shadow-sm shadow-indigo-100" : rec.status === "skipped" ? "border-dashed border-zinc-200 opacity-70" : "border-zinc-200"}`}>
      <button disabled={!hasBody} onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${rec.status === "done" ? "bg-emerald-100 text-emerald-700" : rec.status === "running" ? "bg-indigo-100 text-indigo-700" : "bg-zinc-100 text-zinc-500"}`}>{meta.n + 1}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-zinc-900">{meta.name}</span>
          <span className="block text-xs text-zinc-500">{meta.plain}</span>
          {rec.summary && <span className="mt-1 block text-sm text-zinc-700">→ {rec.summary}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">{badge}{hasBody && <span className="text-xs text-indigo-600">{open ? "Hide" : "Details"}</span>}</span>
      </button>
      {open && hasBody && <div className="border-t border-zinc-100 px-4 py-3 text-sm">{renderBody(meta.n, rec.output)}</div>}
    </div>
  );
}

function renderBody(n: number, o: any) {
  switch (n) {
    case 0: return <KV rows={[["Case number", o.run_id], ["File size", `${(o.bytes / 1024).toFixed(0)} KB`], ["Copy stored", o.blob_url ? "Yes" : "No"]]} />;
    case 1: return <KV rows={[["Is it an invoice?", o.is_invoice ? "Yes" : `No, it is a ${String(o.document_type).replace("_", " ")}`], ["Readability", `${Math.round(o.quality_score * 100)} / 100`], ["Typed text or a scan?", o.has_text_layer ? "Typed (digital PDF)" : "A scan or photo, read from the image"], ["Pages", o.pages], ["Notes", o.legibility_notes], ["AI cost", `$${o.cost_usd?.toFixed(4)}`]]} />;
    case 2: return <Extraction x={o} />;
    case 3: return <Resolve r={o} />;
    case 4: return <Scorers s={o} />;
    case 5: return <KV rows={[["Decision", o.decision], ["Rule used", `${o.rule}: ${o.rule_text}`], ["Sent to", o.routed_to], ["Lowest confidence", `${Math.round(Number(o.confidence) * 100)}%`], ["Auto-approve", o.settings?.auto_approve ? `On (needs ${Math.round(o.settings.confidence_threshold * 100)}% confidence)` : "Off"]]} />;
    case 6: return (
      <div className="space-y-3">
        <KV rows={[["Sent to", o.routed_to], ["Status", ({ pending: "Waiting in the Review queue", closed: "Closed, no payment", auto_approved: "Approved automatically" } as Record<string, string>)[o.review_state] ?? o.review_state], ["Total AI cost", `$${o.cost_usd?.toFixed(4)}`]]} />
        {o.draft && (
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-500">Drafted note to {o.audience}</div>
            <pre className="whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 font-sans text-sm text-zinc-800 ring-1 ring-zinc-200">{o.draft}</pre>
          </div>
        )}
      </div>
    );
  }
  return <pre className="text-xs">{JSON.stringify(o, null, 2)}</pre>;
}

function KV({ rows }: { rows: [string, any][] }) {
  return (
    <dl className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-4 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="contents"><dt className="text-zinc-500">{k}</dt><dd className="text-zinc-800">{v ?? "n/a"}</dd></div>
      ))}
    </dl>
  );
}

function Conf({ c }: { c: number }) {
  const low = c < 0.6;
  return (
    <span className="inline-flex items-center gap-1.5" title="How sure the AI is that it read this correctly">
      <span className="h-1.5 w-12 overflow-hidden rounded bg-zinc-200"><span className={`block h-full ${low ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.round(c * 100)}%` }} /></span>
      <span className={`font-mono text-xs ${low ? "font-semibold text-amber-700" : "text-zinc-500"}`}>{Math.round(c * 100)}%</span>
    </span>
  );
}

const FIELD_LABEL: Record<string, string> = {
  vendor_name: "Supplier", vendor_tax_id: "Supplier tax ID", invoice_number: "Invoice number", invoice_date: "Invoice date", due_date: "Due date",
  po_reference: "PO number", currency: "Currency", subtotal: "Subtotal", tax: "Tax", total: "Total",
};

function Extraction({ x }: { x: any }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">Amber rows are fields the AI could not read with confidence. They are never guessed; they go to a person.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500"><tr><th className="py-1 font-medium">Field</th><th className="font-medium">What it read</th><th className="font-medium">How sure</th><th className="hidden font-medium md:table-cell">Seen on the page as</th></tr></thead>
          <tbody>
            {Object.keys(FIELD_LABEL).map((f) => {
              const v = x[f]; if (!v) return null;
              const low = v.value === null || v.confidence < 0.6;
              return (
                <tr key={f} className={`border-t border-zinc-100 ${low ? "bg-amber-50" : ""}`}>
                  <td className="py-1 pr-2 text-zinc-500">{FIELD_LABEL[f]}{low && <span className="ml-1 text-amber-700">⚑</span>}</td>
                  <td className="pr-2 font-medium text-zinc-900">{v.value === null ? <span className="text-zinc-400">not found</span> : String(v.value)}</td>
                  <td className="pr-2"><Conf c={v.confidence} /></td>
                  <td className="hidden max-w-[14rem] truncate text-xs text-zinc-400 md:table-cell" title={v.source_text ?? ""}>{v.source_text ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {x.line_items?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500"><tr><th className="py-1 font-medium">Line item</th><th className="text-right font-medium">Qty</th><th className="text-right font-medium">Unit price</th><th className="text-right font-medium">Amount</th></tr></thead>
            <tbody>
              {x.line_items.map((l: any, i: number) => (
                <tr key={i} className="border-t border-zinc-100"><td className="py-1 pr-2">{l.description}</td><td className="text-right">{l.quantity ?? ""}</td><td className="text-right">{l.unit_price ?? ""}</td><td className="text-right font-medium">{money(l.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {x.notes && <p className="text-xs text-zinc-500">AI note: {x.notes}</p>}
    </div>
  );
}

function Resolve({ r }: { r: any }) {
  return (
    <div className="space-y-2">
      <KV rows={[
        ["Supplier", r.vendor ? `${r.vendor.name} (${r.vendor.status === "approved" ? "approved" : r.vendor.status})` : "Not on our approved list"],
        ["Matched by", r.vendor_match],
        ["Purchase order", r.po ? `${r.po.po_number} for ${money(r.po.amount)} (allows ${r.po.tolerance_pct}% over)` : "None found"],
        ["How the PO was found", r.po_match],
        ["Already billed on this PO", r.prior_on_po?.length ? r.prior_on_po.map((p: any) => `${p.invoice_number}: ${money(p.total)}`).join(", ") : "Nothing yet"],
        ["Left to bill", r.remaining === null ? "n/a" : money(r.remaining)],
      ]} />
    </div>
  );
}

const CHECK_HELP: Record<string, string> = {
  legible: "Can the document be read at all?",
  identified: "Are the invoice number, date, total and supplier clearly there?",
  matched: "Does the total fit what is left on the purchase order?",
  authorised: "Is the supplier approved, and have we not seen this bill before?",
};

function Scorers({ s }: { s: any[] }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">Each check answers pass, fail (definitely wrong) or uncertain (cannot tell). Uncertain goes to a person; fail is rejected.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {s.map((x) => (
          <div key={x.key} className="rounded-lg border border-zinc-200 p-3">
            <div className="flex items-center justify-between gap-2"><span className="font-medium">{x.label}</span><VerdictChip verdict={x.verdict} /></div>
            <p className="mt-0.5 text-xs italic text-zinc-400">{CHECK_HELP[x.key]}</p>
            <p className="mt-1 text-xs text-zinc-700">{x.evidence}</p>
            {x.notes?.map((n: string) => <p key={n} className="mt-1 text-xs text-sky-700">Note: {n}</p>)}
          </div>
        ))}
      </div>
    </div>
  );
}

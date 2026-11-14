"use client";

import { useEffect, useState } from "react";
import { DecisionChip, VerdictChip, money } from "./ui";

export type StageRecord = { stage: number; status: "waiting" | "running" | "done" | "skipped" | "error"; ms?: number; summary?: string; output?: any };

const STAGES = [
  { n: 0, name: "Upload", blurb: "Store the PDF, open a run" },
  { n: 1, name: "Ingest and triage", blurb: "Is it an invoice? How legible? Cheap model." },
  { n: 2, name: "Extract", blurb: "Every field with confidence and the text it came from" },
  { n: 3, name: "Resolve", blurb: "Find the vendor and purchase order, with history" },
  { n: 4, name: "Validate", blurb: "Four independent scorers" },
  { n: 5, name: "Decide", blurb: "Deterministic rules, first match wins" },
  { n: 6, name: "Explain and route", blurb: "Decision record, routing, outbound draft" },
];

export function RunView({ stages, pdfUrl, filename, runId, startedAt, error }: {
  stages: Record<number, StageRecord>;
  pdfUrl: string | null;
  filename: string;
  runId?: string | null;
  startedAt?: number | null;
  error?: string | null;
}) {
  const decision = stages[5]?.output;
  const route = stages[6]?.output;
  const running = Object.values(stages).some((s) => s.status === "running");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [running]);
  const totalMs = Object.values(stages).reduce((s, x) => s + (x.ms ?? 0), 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)]">
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
          <span className="truncate font-medium">{filename}</span>
          {runId && <span className="font-mono text-zinc-400">{runId}</span>}
        </div>
        {pdfUrl ? (
          <iframe src={`${pdfUrl}#toolbar=0&view=FitH`} className="h-full min-h-[420px] w-full flex-1" title="Invoice preview" />
        ) : (
          <div className="grid flex-1 place-items-center text-sm text-zinc-400">No preview stored for this run</div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {decision && <DecisionBanner d={decision} route={route} totalMs={totalMs} />}
        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Run failed: {error}. Stages that completed are kept below.</div>}
        {STAGES.map((st) => {
          const rec = stages[st.n] ?? { stage: st.n, status: "waiting" as const };
          return <StageCard key={st.n} meta={st} rec={rec} live={rec.status === "running" && startedAt ? now : null} />;
        })}
      </div>
    </div>
  );
}

function DecisionBanner({ d, route, totalMs }: { d: any; route: any; totalMs: number }) {
  const tone: Record<string, string> = {
    Excellent: "border-emerald-200 bg-emerald-50", Good: "border-sky-200 bg-sky-50",
    "Review Required": "border-amber-200 bg-amber-50", Reject: "border-rose-200 bg-rose-50",
  };
  return (
    <div className={`rounded-xl border p-4 ${tone[d.decision] ?? "border-zinc-200 bg-white"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <DecisionChip decision={d.decision} size="lg" />
        <span className="rounded bg-white/70 px-2 py-0.5 font-mono text-xs text-zinc-700 ring-1 ring-zinc-200">Rule {d.rule}</span>
        {d.auto_approved && <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">AUTO-APPROVED</span>}
        <span className="ml-auto text-xs text-zinc-600">
          {(totalMs / 1000).toFixed(1)}s{route?.cost_usd !== undefined && ` · $${route.cost_usd.toFixed(4)}`}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-800">{d.reason}</p>
      <p className="mt-1 text-xs text-zinc-600">{d.rule}: {d.rule_text}. Routed to <b>{d.routed_to}</b>.</p>
    </div>
  );
}

function StageCard({ meta, rec, live }: { meta: (typeof STAGES)[number]; rec: StageRecord; live: number | null }) {
  const [toggled, setOpen] = useState<boolean | null>(null);
  const open = toggled ?? (rec.status === "done" && [2, 4, 6].includes(meta.n));
  const icon = {
    waiting: <span className="h-2.5 w-2.5 rounded-full bg-zinc-300" />,
    running: <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />,
    done: <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-[10px] text-white">✓</span>,
    skipped: <span className="grid h-4 w-4 place-items-center rounded-full bg-zinc-300 text-[10px] text-white">–</span>,
    error: <span className="grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-[10px] text-white">!</span>,
  }[rec.status];
  const hasBody = rec.status === "done" && rec.output !== undefined;

  return (
    <div className={`rounded-xl border bg-white transition ${rec.status === "running" ? "border-indigo-300 shadow-sm shadow-indigo-100" : rec.status === "skipped" ? "border-dashed border-zinc-200 opacity-70" : "border-zinc-200"}`}>
      <button disabled={!hasBody} onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className="mt-1 flex w-4 justify-center">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-xs text-zinc-400">{meta.n}</span>
            <span className="font-medium text-zinc-900">{meta.name}</span>
            <span className="hidden text-xs text-zinc-400 sm:inline">{meta.blurb}</span>
          </span>
          {rec.summary && <span className="mt-0.5 block text-sm text-zinc-600">{rec.summary}</span>}
        </span>
        <span className="shrink-0 font-mono text-xs text-zinc-400">
          {rec.status === "running" && live ? "running" : rec.ms !== undefined ? `${rec.ms} ms` : rec.status === "skipped" ? "skipped" : ""}
        </span>
        {hasBody && <span className="text-xs text-zinc-400">{open ? "▾" : "▸"}</span>}
      </button>
      {open && hasBody && <div className="border-t border-zinc-100 px-4 py-3 text-sm">{renderBody(meta.n, rec.output)}</div>}
    </div>
  );
}

function renderBody(n: number, o: any) {
  switch (n) {
    case 0: return <KV rows={[["Run", o.run_id], ["Size", `${(o.bytes / 1024).toFixed(0)} KB`], ["Stored", o.blob_url ? "Vercel Blob" : "not stored"]]} />;
    case 1: return <KV rows={[["Invoice?", o.is_invoice ? "Yes" : `No, ${o.document_type}`], ["Quality", o.quality_score?.toFixed(2)], ["Text layer", o.has_text_layer ? "Yes" : "No (vision path)"], ["Pages", o.pages], ["Notes", o.legibility_notes], ["Cost", `$${o.cost_usd?.toFixed(4)}`]]} />;
    case 2: return <Extraction x={o} />;
    case 3: return <Resolve r={o} />;
    case 4: return <Scorers s={o} />;
    case 5: return <KV rows={[["Decision", o.decision], ["Rule", `${o.rule}: ${o.rule_text}`], ["Routed to", o.routed_to], ["Confidence", Number(o.confidence).toFixed(2)], ["Auto-approve", o.settings?.auto_approve ? `on, gate ${o.settings.confidence_threshold}` : "off"]]} />;
    case 6: return (
      <div className="space-y-3">
        <KV rows={[["Routed to", o.routed_to], ["Queue state", o.review_state], ["Audit", o.audit], ["Model cost", `$${o.cost_usd?.toFixed(4)}`]]} />
        {o.draft && (
          <div>
            <div className="mb-1 text-xs font-medium text-zinc-500">Drafted message to {o.audience}</div>
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
    <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="contents"><dt className="text-zinc-500">{k}</dt><dd className="text-zinc-800">{v ?? "n/a"}</dd></div>
      ))}
    </dl>
  );
}

function Conf({ c }: { c: number }) {
  const low = c < 0.6;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-12 overflow-hidden rounded bg-zinc-200"><span className={`block h-full ${low ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.round(c * 100)}%` }} /></span>
      <span className={`font-mono text-xs ${low ? "font-semibold text-amber-700" : "text-zinc-500"}`}>{c.toFixed(2)}</span>
    </span>
  );
}

function Extraction({ x }: { x: any }) {
  const fields = ["vendor_name", "vendor_tax_id", "invoice_number", "invoice_date", "due_date", "po_reference", "currency", "subtotal", "tax", "total"];
  return (
    <div className="space-y-3">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-zinc-500"><tr><th className="py-1 font-medium">Field</th><th className="font-medium">Value</th><th className="font-medium">Confidence</th><th className="hidden font-medium md:table-cell">Read from</th></tr></thead>
        <tbody>
          {fields.map((f) => {
            const v = x[f]; if (!v) return null;
            const low = v.value !== null && v.confidence < 0.6;
            return (
              <tr key={f} className={`border-t border-zinc-100 ${low ? "bg-amber-50" : ""}`}>
                <td className="py-1 pr-2 text-zinc-500">{f.replace(/_/g, " ")}{low && <span className="ml-1 text-amber-700">⚑</span>}</td>
                <td className="pr-2 font-medium text-zinc-900">{v.value === null ? <span className="text-zinc-400">missing</span> : String(v.value)}</td>
                <td className="pr-2"><Conf c={v.confidence} /></td>
                <td className="hidden max-w-[14rem] truncate text-xs text-zinc-400 md:table-cell" title={v.source_text ?? ""}>{v.source_text ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {x.line_items?.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500"><tr><th className="py-1 font-medium">Line item</th><th className="text-right font-medium">Qty</th><th className="text-right font-medium">Unit</th><th className="text-right font-medium">Amount</th></tr></thead>
          <tbody>
            {x.line_items.map((l: any, i: number) => (
              <tr key={i} className="border-t border-zinc-100"><td className="py-1 pr-2">{l.description}</td><td className="text-right">{l.quantity ?? ""}</td><td className="text-right">{l.unit_price ?? ""}</td><td className="text-right font-medium">{money(l.amount)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      {x.notes && <p className="text-xs text-zinc-500">Model note: {x.notes}</p>}
    </div>
  );
}

function Resolve({ r }: { r: any }) {
  return (
    <div className="space-y-2">
      <KV rows={[
        ["Vendor", r.vendor ? `${r.vendor.name} (${r.vendor.vendor_id}, ${r.vendor.status})` : "Not found"],
        ["How", r.vendor_match],
        ["PO", r.po ? `${r.po.po_number}, ${money(r.po.amount)}, tolerance ${r.po.tolerance_pct}%` : "None"],
        ["Why", r.po_match],
        ["Prior on PO", r.prior_on_po?.length ? r.prior_on_po.map((p: any) => `${p.invoice_number} ${money(p.total)}`).join(", ") : "none"],
        ["Remaining", r.remaining === null ? "n/a" : money(r.remaining)],
      ]} />
      {r.candidates?.length > 0 && (
        <div className="text-xs text-zinc-500">Open POs for vendor: {r.candidates.map((c: any) => `${c.po_number} (${money(c.amount)}, score ${c.score.toFixed(2)})`).join(" · ")}</div>
      )}
    </div>
  );
}

function Scorers({ s }: { s: any[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {s.map((x) => (
        <div key={x.key} className="rounded-lg border border-zinc-200 p-3">
          <div className="flex items-center justify-between"><span className="font-medium">{x.label}</span><VerdictChip verdict={x.verdict} /></div>
          <p className="mt-1 text-xs text-zinc-600">{x.evidence}</p>
          {x.notes?.map((n: string) => <p key={n} className="mt-1 text-xs text-sky-700">Note: {n}</p>)}
        </div>
      ))}
    </div>
  );
}

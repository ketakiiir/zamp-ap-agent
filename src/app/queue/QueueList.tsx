"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { apiFetch } from "@/components/api";
import { DecisionChip, VerdictChip, money } from "@/components/ui";

export type QueueItem = {
  run_id: string; filename: string; blob_url: string | null; vendor_name: string | null; invoice_number: string | null;
  amount: number | null; amount_at_risk: number | null; decision: string; rule: string; routed_to: string; reason: string;
  draft: string | null; audience: string | null;
  fields: { key: string; value: string; confidence: number; source: string | null }[];
  flags: { label: string; verdict: string; text: string }[];
  created_at: string;
};

export function QueueList({ items }: { items: QueueItem[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [sel, setSel] = useState<string | null>(items[0]?.run_id ?? null);
  const view = useMemo(() => items.filter((i) => (!filter || i.decision === filter) &&
    (!q || [i.vendor_name, i.invoice_number, i.filename, i.reason].some((v) => (v ?? "").toLowerCase().includes(q.toLowerCase())))), [items, q, filter]);
  const current = items.find((i) => i.run_id === sel) ?? view[0] ?? null;

  if (!items.length) return <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-zinc-500">Queue is empty. Review Required and Good invoices land here.</div>;

  return (
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <div className="rounded-xl border border-zinc-200 bg-white">
        <div className="space-y-2 border-b border-zinc-100 p-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm">
            <option value="">All ({items.length})</option>
            {["Review Required", "Good", "Excellent"].map((d) => <option key={d} value={d}>{d} ({items.filter((i) => i.decision === d).length})</option>)}
          </select>
        </div>
        <ul>
          {view.map((i) => (
            <li key={i.run_id}>
              <button onClick={() => setSel(i.run_id)} className={`flex w-full items-start justify-between gap-2 border-b border-zinc-100 px-3 py-2.5 text-left hover:bg-zinc-50 ${current?.run_id === i.run_id ? "bg-indigo-50/60" : ""}`}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{i.vendor_name ?? i.filename}</span>
                  <span className="block truncate text-xs text-zinc-500">{i.invoice_number ?? "number unreadable"} · {i.rule}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-semibold">{money(i.amount_at_risk)}</span>
                  <DecisionChip decision={i.decision} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {current && <Detail key={current.run_id} item={current} />}
    </div>
  );
}

function Detail({ item }: { item: QueueItem }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function act(action: "approve" | "reject") {
    setBusy(true); setErr("");
    const changed = Object.fromEntries(Object.entries(edits).filter(([k, v]) => v !== (item.fields.find((f) => f.key === k)?.value ?? "")));
    const r = await apiFetch("/api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run_id: item.run_id, action, edited_fields: changed, note, reviewer }) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json()).error ?? "Failed"); return; }
    router.refresh();
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="h-[70vh] overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
        {item.blob_url ? <iframe src={`${item.blob_url}#toolbar=0&view=FitH`} className="h-full w-full" title="Source document" /> : <div className="grid h-full place-items-center text-sm text-zinc-400">No preview</div>}
      </div>
      <div className="space-y-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <DecisionChip decision={item.decision} size="lg" />
            <span className="font-mono text-xs text-zinc-500">{item.rule}</span>
            <Link href={`/runs/${item.run_id}`} className="ml-auto text-xs text-indigo-600 hover:underline">Full run →</Link>
          </div>
          <p className="mt-2 text-sm text-zinc-700">{item.reason}</p>
          <p className="mt-1 text-xs text-zinc-500">Routed to {item.routed_to}. Amount at risk {money(item.amount_at_risk)}.</p>
        </div>
        {item.flags.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold">Flags</h3>
            <ul className="space-y-2">{item.flags.map((f) => <li key={f.label} className="flex gap-2 text-sm"><VerdictChip verdict={f.verdict === "pass" ? "pass" : f.verdict} /><span><b>{f.label}:</b> {f.text}</span></li>)}</ul>
          </div>
        )}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold">Extracted fields <span className="font-normal text-zinc-400">(edit to correct)</span></h3>
          <div className="space-y-2">
            {item.fields.map((f) => {
              const low = f.confidence < 0.6;
              return (
                <label key={f.key} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-2 text-sm">
                  <span className={low ? "font-medium text-amber-700" : "text-zinc-500"}>{f.key.replace(/_/g, " ")}{low && " ⚑"}</span>
                  <input value={edits[f.key] ?? f.value} onChange={(e) => setEdits({ ...edits, [f.key]: e.target.value })}
                    className={`rounded-md border px-2 py-1 ${low ? "border-amber-400 bg-amber-50" : "border-zinc-300"}`} placeholder={low ? "unreadable, type from the document" : ""} />
                  <span className={`text-right font-mono text-xs ${low ? "text-amber-700" : "text-zinc-400"}`}>{f.confidence.toFixed(2)}</span>
                </label>
              );
            })}
          </div>
        </div>
        {item.draft && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold">Drafted message to {item.audience}</h3>
            <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-700">{item.draft}</pre>
          </div>
        )}
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <input id="reviewer-name" value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Your name (recorded with the decision)" className="mb-2 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" />
          <textarea id="reviewer-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reviewer note (optional)" className="mb-3 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm" rows={2} />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => act("approve")} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Approve</button>
            <button disabled={busy} onClick={() => act("reject")} className="rounded-md border border-rose-300 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50">Reject</button>
            {err && <span className="self-center text-sm text-rose-600">{err}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DecisionChip, money } from "@/components/ui";

export type RunRow = {
  run_id: string; filename: string; vendor_name: string | null; invoice_number: string | null; amount: number | null;
  decision: string | null; rule_fired: string | null; routed_to: string | null; reason: string | null; auto_approved: boolean;
  review_state: string | null; ms_total: number | null; cost_usd: number | null; status: string; created_at: string;
};

type SortKey = "created_at" | "amount" | "ms_total" | "vendor_name";

export function RunsTable({ rows, initialDecision }: { rows: RunRow[]; initialDecision: string }) {
  const [q, setQ] = useState("");
  const [decision, setDecision] = useState(initialDecision);
  const [sort, setSort] = useState<SortKey>("created_at");
  const [desc, setDesc] = useState(true);

  const view = useMemo(() => {
    const term = q.toLowerCase();
    const f = rows.filter((r) => (!decision || r.decision === decision) &&
      (!term || [r.filename, r.vendor_name, r.invoice_number, r.rule_fired, r.reason].some((v) => (v ?? "").toLowerCase().includes(term))));
    return f.sort((a, b) => {
      const av = a[sort] ?? "", bv = b[sort] ?? "";
      return (av < bv ? -1 : av > bv ? 1 : 0) * (desc ? -1 : 1);
    });
  }, [rows, q, decision, sort, desc]);

  const th = (k: SortKey, label: string, cls = "") => (
    <th className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-zinc-800 ${cls}`} onClick={() => (sort === k ? setDesc(!desc) : (setSort(k), setDesc(true)))}>
      {label}{sort === k ? (desc ? " ↓" : " ↑") : ""}
    </th>
  );

  return (
    <section className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-3">
        <h2 className="mr-auto text-sm font-semibold">Run history <span className="font-normal text-zinc-400">({view.length})</span></h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search vendor, invoice, file, reason" className="w-64 rounded-md border border-zinc-300 px-2 py-1 text-sm" />
        <select value={decision} onChange={(e) => setDecision(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1 text-sm">
          <option value="">All decisions</option>
          {["Excellent", "Good", "Review Required", "Reject"].map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs text-zinc-500">
            <tr>{th("created_at", "When")}<th className="px-3 py-2 font-medium">Document</th>{th("vendor_name", "Vendor")}<th className="px-3 py-2 font-medium">Invoice</th>{th("amount", "Amount", "text-right")}<th className="px-3 py-2 font-medium">Decision</th><th className="px-3 py-2 font-medium">Rule</th><th className="px-3 py-2 font-medium">Routed to</th>{th("ms_total", "Time", "text-right")}<th className="px-3 py-2 text-right font-medium">Cost</th></tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.run_id} className="border-t border-zinc-100 hover:bg-zinc-50">
                <td className="whitespace-nowrap px-3 py-2 text-zinc-500"><Link href={`/runs/${r.run_id}`} className="hover:underline">{new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Link></td>
                <td className="max-w-[12rem] truncate px-3 py-2"><Link href={`/runs/${r.run_id}`} className="text-indigo-700 hover:underline">{r.filename}</Link></td>
                <td className="max-w-[12rem] truncate px-3 py-2">{r.vendor_name ?? ""}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.invoice_number ?? ""}</td>
                <td className="px-3 py-2 text-right">{r.amount !== null ? money(r.amount) : ""}</td>
                <td className="px-3 py-2">{r.status === "error" ? <span className="text-xs text-rose-600">error</span> : <DecisionChip decision={r.decision} />}{r.auto_approved && <span className="ml-1 text-[10px] font-semibold text-emerald-700">AUTO</span>}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.rule_fired ?? ""}</td>
                <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-zinc-600" title={r.reason ?? ""}>{r.routed_to ?? ""}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{r.ms_total ? `${(r.ms_total / 1000).toFixed(1)}s` : ""}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{r.cost_usd ? `$${r.cost_usd.toFixed(4)}` : ""}</td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={10} className="px-3 py-8 text-center text-zinc-400">No runs yet. Run a test invoice from the Run page.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

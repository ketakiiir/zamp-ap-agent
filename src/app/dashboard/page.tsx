import { ensureDb, sql } from "@/lib/db";
import { RULES } from "@/lib/rules";
import { DECISION_STYLE, money } from "@/components/ui";
import { RunsTable, type RunRow } from "./RunsTable";

export const dynamic = "force-dynamic";

const BASELINE_MIN = 4; // stated manual baseline per invoice
const RESIDUAL_MIN: Record<string, number> = { Excellent: 0.5, Good: 0.5, "Review Required": 2, Reject: 0.5 };
const ORDER = ["Excellent", "Good", "Review Required", "Reject"];
const LABEL: Record<string, string> = { Excellent: "ready to pay", Good: "pay, with a note", "Review Required": "a person looks", Reject: "not paid" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ decision?: string }> }) {
  const { decision } = await searchParams;
  await ensureDb();
  const runs = (await sql`SELECT run_id, filename, vendor_name, invoice_number, amount::float AS amount, decision, rule_fired, routed_to,
    reason, auto_approved, review_state, ms_total, cost_usd::float AS cost_usd, status, created_at FROM runs ORDER BY created_at DESC LIMIT 500`) as RunRow[];
  const done = runs.filter((r) => r.status === "complete");
  const n = done.length;
  const count = (d: string) => done.filter((r) => r.decision === d).length;
  const avgMs = n ? done.reduce((s, r) => s + (r.ms_total ?? 0), 0) / n : 0;
  const avgCost = n ? done.reduce((s, r) => s + (r.cost_usd ?? 0), 0) / n : 0;
  const auto = done.filter((r) => r.auto_approved).length;
  const savedMin = done.reduce((s, r) => s + BASELINE_MIN - (r.auto_approved ? 0 : RESIDUAL_MIN[r.decision ?? ""] ?? BASELINE_MIN), 0);
  const human = done.filter((r) => r.decision === "Review Required" || r.decision === "Reject");
  const byRule = RULES.filter((x) => x.outcome === "Review Required" || x.outcome === "Reject")
    .map((x) => ({ ...x, n: human.filter((r) => r.rule_fired === x.id).length }));
  const maxRule = Math.max(1, ...byRule.map((x) => x.n));

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-5 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-zinc-500">Everything the agent has processed: how much needed nobody, what needed a person and why, and how fast and cheap it was.</p>
        </div>
      </div>

      <div data-tour="kpis" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Invoices processed" value={String(n)} sub="since the last reset" />
        <Kpi label="Ready to pay" value={n ? `${Math.round(((count("Excellent") + count("Good")) / n) * 100)}%` : "n/a"} sub={`Excellent or Good · ${auto} approved automatically`} />
        <Kpi label="Needed a person" value={String(count("Review Required"))} sub={`plus ${count("Reject")} rejected`} />
        <Kpi label="Time per invoice" value={n ? `${(avgMs / 1000).toFixed(1)}s` : "n/a"} sub="average, start to decision" />
        <Kpi label="AI cost per invoice" value={n ? `$${avgCost.toFixed(3)}` : "n/a"} sub="average" />
        <Kpi label="Hours saved" value={`${(savedMin / 60).toFixed(1)} h`} sub={`vs ${BASELINE_MIN} min manual baseline`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold">How invoices were decided</h2><p className="mb-3 text-xs text-zinc-500">Click an outcome to filter the history below.</p>
          <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-zinc-100">
            {ORDER.map((d) => count(d) > 0 && <div key={d} className={DECISION_STYLE[d].bar} style={{ width: `${(count(d) / n) * 100}%` }} />)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ORDER.map((d) => (
              <a key={d} href={decision === d ? "/dashboard" : `/dashboard?decision=${encodeURIComponent(d)}`}
                className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50 ${decision === d ? "border-zinc-900" : "border-zinc-200"}`}>
                <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${DECISION_STYLE[d].dot}`} />{d}<span className="text-xs text-zinc-400">{LABEL[d]}</span></span>
                <span className="font-semibold">{count(d)}</span>
              </a>
            ))}
          </div>
        </section>
        <section data-tour="reasons" className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold">Why a person was needed</h2><p className="mb-3 text-xs text-zinc-500">Every invoice that was rejected or sent to a person, counted by the rule that stopped it.</p>
          <div className="space-y-2">
            {byRule.map((x) => (
              <div key={x.id} className="grid grid-cols-[2.5rem_1fr_2rem] items-center gap-2 text-sm">
                <span className="font-mono text-xs text-zinc-500">{x.id}</span>
                <div>
                  <div className="text-xs text-zinc-700">{x.condition} <span className="text-zinc-400">→ {x.routed}</span></div>
                  <div className="mt-1 h-1.5 rounded bg-zinc-100"><div className={`h-full rounded ${DECISION_STYLE[x.outcome].bar}`} style={{ width: `${(x.n / maxRule) * 100}%` }} /></div>
                </div>
                <span className="text-right font-semibold">{x.n}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div data-tour="history"><RunsTable rows={runs.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }))} initialDecision={decision ?? ""} /></div>
      <p className="text-xs text-zinc-400">
        Manhours saved assumes {BASELINE_MIN} minutes per invoice done by hand, and residual human time of 30 seconds for a one-click approve or reject and 2 minutes for a pre-filled review. Auto-approved invoices take no human time. These are stated assumptions, not measurements. Total model spend so far: {money(done.reduce((s, r) => s + (r.cost_usd ?? 0), 0))}.
      </p>
    </main>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="text-xs text-zinc-400">{sub}</div>}
    </div>
  );
}

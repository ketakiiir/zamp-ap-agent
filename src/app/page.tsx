"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/components/api";
import { RunView, VERDICT_COPY, type StageRecord } from "@/components/RunView";
import { DecisionChip } from "@/components/ui";
import { InboxPanel } from "@/components/InboxPanel";
import { SAMPLES } from "@/lib/samples";
import fixture from "@/lib/tour-fixture.json";

const SCENARIO: Record<string, string> = {
  "01-clean-invoice-A.pdf": "Everything matches",
  "02-scanned-unreadable-number.pdf": "Blurry scan",
  "03-split-po-40pct.pdf": "Billed in two parts",
  "04-duplicate-new-number.pdf": "Sent twice",
  "05-no-matching-po.pdf": "No purchase order",
  "06-delivery-note.pdf": "Not an invoice",
  "07-clean-invoice-B.pdf": "Everything matches (2)",
};

export default function Home() {
  const [stages, setStages] = useState<Record<number, StageRecord>>({});
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replay, setReplay] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const runRef = useRef<HTMLDivElement>(null);
  const watchToken = useRef(0);
  const [source, setSource] = useState<string | null>(null);

  // Follow a run that is being processed on the server (an emailed invoice) by polling its saved steps.
  const watch = useCallback(async (id: string) => {
    const token = ++watchToken.current;
    setReplay(false); setError(null); setRunId(id); setStages({}); setSource(null);
    setTimeout(() => runRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    for (let i = 0; i < 400 && token === watchToken.current; i++) {
      const r = await fetch(`/api/runs/${id}`, { cache: "no-store" }).catch(() => null);
      if (r?.ok) {
        const j = await r.json();
        if (token !== watchToken.current) return;
        setFilename(j.filename); setPdfUrl(j.blob_url);
        setSource(j.source === "email" ? `Emailed by ${j.sender ?? "unknown sender"}${j.subject ? `: "${j.subject}"` : ""}` : null);
        const st = Object.fromEntries(Object.entries(j.stages ?? {}).map(([k, v]) => [Number(k), v])) as Record<number, StageRecord>;
        if (j.status === "running") {
          const next = [0, 1, 2, 3, 4, 5, 6].find((n) => !st[n]);
          if (next !== undefined) st[next] = { stage: next, status: "running" };
        }
        setStages(st);
        if (j.status === "error") setError(j.reason);
        if (j.status !== "running") return;
      }
      await new Promise((res) => setTimeout(res, 1000));
    }
  }, []);

  useEffect(() => { (window as any).__currentRunId = runId; }, [runId]);

  // Guided tour: replay a real stored run, no API call and no cost.
  useEffect(() => {
    let cancelled = false;
    const play = async () => {
      watchToken.current++;
      setReplay(true); setSource(null); setError(null); setRunId(null);
      setFilename(fixture.filename); setPdfUrl(fixture.pdf); setStages({});
      const all = fixture.stages as unknown as Record<string, StageRecord>;
      for (let i = 0; i <= 6 && !cancelled; i++) {
        const rec = all[String(i)];
        setStages((s) => ({ ...s, [i]: { stage: i, status: "running" } }));
        await new Promise((r) => setTimeout(r, i === 2 ? 900 : 450));
        setStages((s) => ({ ...s, [i]: rec }));
      }
    };
    window.addEventListener("tour:replay", play);
    return () => { cancelled = true; window.removeEventListener("tour:replay", play); };
  }, []);

  async function run(file: File) {
    if (busy) return;
    watchToken.current++;
    setBusy(true); setReplay(false); setSource(null); setError(null); setRunId(null); setFilename(file.name);
    setPdfUrl(URL.createObjectURL(file));
    setStages({ 0: { stage: 0, status: "running" } });
    setTimeout(() => runRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await apiFetch("/api/process", { method: "POST", body: fd });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(res.status === 401 ? "The demo passcode is needed to run an invoice. Enter it, then click the invoice again." : j.error ?? "Request failed");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const p of parts) {
          const line = p.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const e = JSON.parse(line.slice(6));
          if (e.type === "stage") setStages((s) => ({ ...s, [e.stage]: e }));
          else if (e.type === "run") setRunId(e.run_id);
          else if (e.type === "error") setError(e.message);
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setStages((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.status === "running" ? { ...v, status: "error" } : v])));
    } finally {
      setBusy(false);
    }
  }

  async function runSample(f: string) {
    const blob = await (await fetch(`/samples/${f}`)).blob();
    run(new File([blob], f, { type: "application/pdf" }));
  }

  const started = Object.keys(stages).length > 0;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Turn a supplier invoice into a decision, with every step shown</h1>
        <p className="mt-1 max-w-3xl text-zinc-600">The agent reads the invoice, checks it against the purchase order, and decides: pay it, pay it with a note, ask a person, or reject it. People only see the invoices that need them.</p>
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["1", "An invoice arrives", "By email to the AP inbox, or click a test invoice, or drop in a PDF."],
            ["2", "Watch it work", "Seven steps light up as they finish, about 10 to 15 seconds."],
            ["3", "Read the decision", "Plain-English verdict, the reason, and what happens next."],
          ].map(([n, t, d]) => (
            <li key={n} className="flex gap-3 rounded-xl bg-zinc-50 p-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-600 text-sm font-semibold text-white">{n}</span>
              <span><span className="block font-medium text-zinc-900">{t}</span><span className="block text-sm text-zinc-600">{d}</span></span>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <InboxPanel onOpen={watch} activeId={runId} />
        <div
          data-tour="upload"
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) run(f); }}
          onClick={() => input.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") input.current?.click(); }}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${drag ? "border-indigo-500 bg-indigo-50" : "border-zinc-300 bg-white hover:border-indigo-300"} ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); e.target.value = ""; }} />
          <div className="text-3xl" aria-hidden>📄</div>
          <div className="mt-2 font-semibold text-zinc-900">{busy ? "Processing…" : "Or drop your own invoice PDF"}</div>
          <div className="mt-1 text-sm text-zinc-500">Click to choose a file. Any supplier invoice works.</div>
          <div className="mt-3 text-xs text-zinc-400">Same seven steps as an emailed invoice.</div>
        </div>
      </section>

      <section>
        <div data-tour="samples" className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold text-zinc-900">Try a test invoice</h2>
            <span className="text-xs text-zinc-500">Each tests a different situation. Click one to run it live.</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SAMPLES.map((s) => (
              <div key={s.file} className="flex flex-col rounded-xl border border-zinc-200 p-3 transition hover:border-indigo-300 hover:shadow-sm">
                <div className="text-sm font-semibold text-zinc-900">{SCENARIO[s.file]}</div>
                <div className="text-xs text-zinc-500">{s.vendor}</div>
                <p className="mt-1 flex-1 text-xs text-zinc-600">{s.why}</p>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">Should end as <DecisionChip decision={s.expect} /></div>
                <div className="mt-2 flex gap-2">
                  <button disabled={busy} onClick={() => runSample(s.file)} className="flex-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">Run it</button>
                  <a href={`/samples/${s.file}`} target="_blank" rel="noreferrer" className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50">View PDF</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div ref={runRef} className="scroll-mt-24">
        {started ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{busy ? "Processing" : stages[5]?.status === "done" ? "Result" : "Run"}: {filename}</h2>
              {replay && <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700">Tour replay of a real run, no cost</span>}
              {source && <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-medium text-sky-700">✉️ {source}</span>}
              {stages[5]?.status === "done" && !replay && (
                <span className="text-xs text-zinc-500">{VERDICT_COPY[stages[5].output.decision]?.headline}</span>
              )}
              {runId && !busy && (
                <span className="ml-auto flex gap-3 text-sm">
                  <Link className="text-indigo-600 hover:underline" href={`/runs/${runId}`}>Open saved run</Link>
                  <Link className="text-indigo-600 hover:underline" href="/queue">Go to review queue</Link>
                </span>
              )}
            </div>
            <RunView stages={stages} pdfUrl={pdfUrl} filename={filename} runId={runId} error={error} />
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
            The live view of the agent at work will appear here when you run an invoice.
            <button onClick={() => window.dispatchEvent(new Event("tour:start"))} className="ml-1 font-medium text-indigo-600 hover:underline">New here? Take the one-minute tour.</button>
          </section>
        )}
      </div>
    </main>
  );
}

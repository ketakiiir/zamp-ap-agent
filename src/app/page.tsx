"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { apiFetch } from "@/components/api";
import { RunView, type StageRecord } from "@/components/RunView";
import { DecisionChip } from "@/components/ui";
import { SAMPLES } from "@/lib/samples";

export default function Home() {
  const [stages, setStages] = useState<Record<number, StageRecord>>({});
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function run(file: File) {
    if (busy) return;
    setBusy(true); setError(null); setRunId(null); setFilename(file.name);
    setPdfUrl(URL.createObjectURL(file));
    setStages({ 0: { stage: 0, status: "running" } });
    setStartedAt(Date.now());
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await apiFetch("/api/process", { method: "POST", body: fd });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(j.error ?? "Request failed");
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
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
      <section className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) run(f); }}
          onClick={() => input.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${drag ? "border-indigo-500 bg-indigo-50" : "border-zinc-300 bg-white hover:border-zinc-400"} ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); e.target.value = ""; }} />
          <div className="text-base font-medium text-zinc-900">{busy ? "Processing…" : "Drop an invoice PDF here"}</div>
          <div className="mt-1 text-sm text-zinc-500">or click to choose a file. Any vendor invoice works; the agent reads it, matches it and decides.</div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-zinc-900">Test invoices</h2>
            <span className="text-xs text-zinc-500">Click to run. Download to inspect.</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {SAMPLES.map((s) => (
              <div key={s.file} className="group flex items-start gap-2 rounded-lg border border-zinc-200 p-2 hover:border-indigo-300 hover:bg-indigo-50/40">
                <button disabled={busy} onClick={() => runSample(s.file)} className="min-w-0 flex-1 text-left disabled:opacity-50" title={s.why}>
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-zinc-900">{s.title}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-500">
                    <span className="truncate">{s.vendor}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5"><span className="text-[11px] text-zinc-400">expect</span><DecisionChip decision={s.expect} /><span className="font-mono text-[11px] text-zinc-400">{s.rule}</span></div>
                </button>
                <a href={`/samples/${s.file}`} download className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:bg-white hover:text-zinc-700" title="Download PDF">↓</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {started ? (
        <>
          {runId && !busy && (
            <div className="mb-3 text-right text-xs text-zinc-500">
              Saved as <Link className="font-mono text-indigo-600 hover:underline" href={`/runs/${runId}`}>{runId}</Link>
            </div>
          )}
          <RunView stages={stages} pdfUrl={pdfUrl} filename={filename} runId={runId} startedAt={startedAt} error={error} />
        </>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
          <p className="text-lg font-medium text-zinc-900">An AP agent is not a reader. It is a decider.</p>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-600">
            Every invoice goes through six visible stages and lands in one of four outcomes: Excellent, Good, Review Required or Reject.
            A model reads the document; deterministic rules make the decision, and the rule that fired is named.
          </p>
          <p className="mt-3 text-xs text-zinc-500">A payable invoice is legible, identified, matched, authorised and unique.</p>
        </div>
      )}
    </main>
  );
}

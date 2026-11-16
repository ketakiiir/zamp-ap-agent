"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";
import { DecisionChip } from "./ui";

type Item = { run_id: string; sender: string | null; subject: string | null; filename: string; status: string; decision: string | null; created_at: string; steps_done: number };

function ago(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function InboxPanel({ onOpen, activeId }: { onOpen: (runId: string) => void; activeId: string | null }) {
  const [items, setItems] = useState<Item[]>([]);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [address, setAddress] = useState("");
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch("/api/inbox", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (stop) return;
        setConnected(j.connected); setAddress(j.address); setItems(j.items); setNow(Date.now());
        const ids = new Set<string>(j.items.map((i: Item) => i.run_id));
        if (seen.current) {
          // A brand-new email arrived while the page is open: open it so you can watch it run.
          const fresh = j.items.find((i: Item) => !seen.current!.has(i.run_id));
          if (fresh) onOpen(fresh.run_id);
        }
        seen.current = ids;
      } catch { /* keep polling */ }
    };
    load();
    const t = setInterval(load, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [onOpen]);

  async function checkNow() {
    setChecking(true); setNote("");
    const r = await apiFetch("/api/inbox/check", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setChecking(false);
    setNote(r.ok ? "Checked. New invoice emails appear here within a few seconds." : r.status === 401 ? "Enter the demo passcode first." : `Could not reach the mailbox: ${j.detail ?? r.statusText}`);
    setTimeout(() => setNote(""), 6000);
  }

  return (
    <div data-tour="inbox" className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-zinc-900">AP inbox</h2>
        {connected === true && <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Watching</span>}
        {connected === false && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">Not connected</span>}
        <button onClick={checkNow} disabled={checking || connected === false} className="ml-auto rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">
          {checking ? "Checking…" : "Check inbox now"}
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Suppliers email invoices as PDFs{address ? <> to <span className="font-mono text-zinc-700">{address}</span></> : ""}, with &quot;Invoice&quot; in the subject. Each one runs through the agent automatically, and a reply is drafted in the email thread for a person to send.
      </p>
      {note && <p className="mt-1 text-xs text-indigo-700">{note}</p>}
      <ul className="mt-3 flex-1 space-y-1.5 overflow-y-auto" style={{ maxHeight: 260 }}>
        {items.length === 0 && <li className="rounded-lg border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-400">No invoice emails yet. Send one and it appears here.</li>}
        {items.map((i) => {
          const running = i.status === "running";
          return (
            <li key={i.run_id}>
              <button onClick={() => onOpen(i.run_id)} className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left hover:border-indigo-300 ${activeId === i.run_id ? "border-indigo-400 bg-indigo-50/50" : "border-zinc-200"}`}>
                <span className="mt-0.5 text-base" aria-hidden>✉️</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-900">{i.subject ?? i.filename}</span>
                  <span className="block truncate text-xs text-zinc-500">{i.sender ?? "unknown sender"} · {ago(i.created_at, now)}</span>
                </span>
                <span className="shrink-0">
                  {running ? <span className="text-xs font-medium text-indigo-600">step {Math.min(7, i.steps_done + 1)} of 7…</span>
                    : i.status === "error" ? <span className="text-xs text-rose-600">error</span>
                    : <DecisionChip decision={i.decision} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

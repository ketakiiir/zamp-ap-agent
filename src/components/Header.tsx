"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, getPasscode, setPasscode } from "./api";

const NAV = [
  { href: "/", label: "Process an invoice" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/queue", label: "Review queue" },
  { href: "/how-it-works", label: "How it works" },
];

export function Header() {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(() => (typeof window === "undefined" ? "" : getPasscode()));
  const [auto, setAuto] = useState(false);
  const [threshold, setThreshold] = useState(0.95);
  const [msg, setMsg] = useState("");
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => (r.ok ? r.json() : null)).then((s) => {
      if (s) { setAuto(s.auto_approve); setThreshold(s.confidence_threshold); }
    }).catch(() => {});
  }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 3000); };

  async function save(patch: { auto_approve?: boolean; confidence_threshold?: number }) {
    const r = await apiFetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (!r.ok) { flash((await r.json()).error ?? "Not saved"); return; }
    const s = await r.json();
    setAuto(s.auto_approve); setThreshold(s.confidence_threshold);
    flash("Saved");
  }

  async function reset() {
    if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
    setArmed(false);
    const r = await apiFetch("/api/reset", { method: "POST" });
    if (!r.ok) { flash((await r.json()).error ?? "Reset failed"); return; }
    setAuto(false); setThreshold(0.95);
    flash("Demo data reset to the starting state");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-zinc-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-xs font-bold text-white">AP</span>
          <span className="leading-tight">
            <span className="block font-semibold tracking-tight">Invoice Agent</span>
            <span className="block text-[11px] text-zinc-500">Meadowgate Provisions · accounts payable</span>
          </span>
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`rounded-lg px-3 py-1.5 ${active ? "bg-indigo-50 font-medium text-indigo-700" : "text-zinc-600 hover:bg-zinc-100"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          {msg && <span className="text-xs text-zinc-500">{msg}</span>}
          <span className={`hidden rounded-full px-2.5 py-1 text-xs font-medium md:inline ${auto ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}
            title="Whether perfect invoices can be approved with no person involved">
            Auto-pay {auto ? `on (≥ ${Math.round(threshold * 100)}% sure)` : "off"}
          </span>
          <button data-tour="tour-btn" onClick={() => window.dispatchEvent(new Event("tour:start"))} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 font-medium text-indigo-700 hover:bg-indigo-100">
            Take the tour
          </button>
          <button data-tour="settings" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50">
            Settings
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-zinc-200 bg-zinc-50">
          <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 text-sm md:grid-cols-4">
            <div>
              <label htmlFor="hdr-passcode" className="font-medium text-zinc-800">Demo passcode</label>
              <p className="text-xs text-zinc-500">Needed to run invoices and ask questions.</p>
              <input id="hdr-passcode" type="password" value={code} onChange={(e) => { setCode(e.target.value); setPasscode(e.target.value); }}
                className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1" placeholder="Enter passcode" />
            </div>
            <div>
              <label className="flex items-center gap-2 font-medium text-zinc-800">
                <input id="hdr-auto" type="checkbox" checked={auto} onChange={(e) => save({ auto_approve: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
                Approve perfect invoices automatically
              </label>
              <p className="mt-1 text-xs text-zinc-500">Off by default. When on, only invoices that pass every check with no notes are approved with no person involved.</p>
            </div>
            <div>
              <label htmlFor="hdr-gate" className="font-medium text-zinc-800">How sure it must be: {Math.round(threshold * 100)}%</label>
              <p className="text-xs text-zinc-500">Auto-approve also needs every key field read with at least this confidence.</p>
              <input id="hdr-gate" type="range" min={0.5} max={1} step={0.01} value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                onMouseUp={() => save({ confidence_threshold: threshold })} onTouchEnd={() => save({ confidence_threshold: threshold })} onKeyUp={() => save({ confidence_threshold: threshold })}
                className="mt-1 w-full accent-indigo-600" />
            </div>
            <div>
              <div className="font-medium text-zinc-800">Start the demo over</div>
              <p className="text-xs text-zinc-500">Clears every processed invoice and puts the starting data back.</p>
              <button onClick={reset} className={`mt-1 rounded-md border px-3 py-1.5 ${armed ? "border-rose-500 bg-rose-600 text-white" : "border-rose-300 bg-white text-rose-700 hover:bg-rose-50"}`}>
                {armed ? "Click again to confirm" : "Reset demo data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

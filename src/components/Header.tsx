"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch, getPasscode, setPasscode } from "./api";

const NAV = [
  { href: "/", label: "Run" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/queue", label: "Queue" },
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

  useEffect(() => {
    fetch("/api/settings").then((r) => (r.ok ? r.json() : null)).then((s) => {
      if (s) { setAuto(s.auto_approve); setThreshold(s.confidence_threshold); }
    }).catch(() => {});
  }, []);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };

  async function save(patch: { auto_approve?: boolean; confidence_threshold?: number }) {
    const r = await apiFetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (!r.ok) { flash((await r.json()).error ?? "Not saved"); return false; }
    const s = await r.json();
    setAuto(s.auto_approve); setThreshold(s.confidence_threshold);
    flash("Saved");
    return true;
  }

  async function reset() {
    const r = await apiFetch("/api/reset", { method: "POST" });
    if (!r.ok) { flash((await r.json()).error ?? "Reset failed"); return; }
    setAuto(false); setThreshold(0.95);
    flash("Demo data reset");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-zinc-900">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-indigo-600 text-xs font-bold text-white">AP</span>
          <span>Meadowgate AP Agent</span>
        </Link>
        <nav className="flex gap-1 text-sm">
          {NAV.map((n) => {
            const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link key={n.href} href={n.href} className={`rounded-md px-3 py-1.5 ${active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className={`hidden rounded-full px-2.5 py-1 text-xs font-medium sm:inline ${auto ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
            Auto-approve {auto ? `on ≥ ${threshold.toFixed(2)}` : "off"}
          </span>
          {msg && <span className="text-xs text-zinc-500">{msg}</span>}
          <button onClick={() => setOpen((o) => !o)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50">
            Settings
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-zinc-200 bg-zinc-50">
          <div className="mx-auto flex max-w-7xl flex-wrap items-end gap-6 px-4 py-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-zinc-500">Demo passcode</span>
              <input type="password" value={code} onChange={(e) => { setCode(e.target.value); setPasscode(e.target.value); }}
                className="w-40 rounded-md border border-zinc-300 bg-white px-2 py-1" placeholder="Enter passcode" />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={auto} onChange={(e) => save({ auto_approve: e.target.checked })} className="h-4 w-4 accent-indigo-600" />
              <span>Auto-approve Excellent invoices</span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-zinc-500">Auto-approve confidence gate: {threshold.toFixed(2)}</span>
              <input type="range" min={0.5} max={1} step={0.01} value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                onMouseUp={() => save({ confidence_threshold: threshold })} onTouchEnd={() => save({ confidence_threshold: threshold })} onKeyUp={() => save({ confidence_threshold: threshold })}
                className="w-56 accent-indigo-600" />
            </label>
            <button onClick={reset} className="ml-auto rounded-md border border-rose-300 bg-white px-3 py-1.5 text-rose-700 hover:bg-rose-50">
              Reset demo data
            </button>
          </div>
        </div>
      )}
    </header>
  );
}

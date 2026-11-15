"use client";

import { useEffect, useState } from "react";
import { getPasscode, setPasscode } from "./api";

export function PasscodeDialog() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    const show = () => { setValue(getPasscode()); setOpen(true); };
    window.addEventListener("need-passcode", show);
    return () => window.removeEventListener("need-passcode", show);
  }, []);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-zinc-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="pc-title">
      <form
        onSubmit={(e) => { e.preventDefault(); setPasscode(value.trim()); setOpen(false); }}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 id="pc-title" className="text-lg font-semibold">Enter the demo passcode</h2>
        <p className="mt-1 text-sm text-zinc-600">Running invoices and asking the assistant use a paid AI service, so they are passcode protected. Everything else on the site is open.</p>
        <input id="passcode" autoFocus type="password" value={value} onChange={(e) => setValue(e.target.value)}
          className="mt-4 w-full rounded-lg border border-zinc-300 px-3 py-2" placeholder="Passcode" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100">Cancel</button>
          <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Save, then try again</button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

type Step = {
  page: string;
  target?: string;
  title: string;
  body: string;
  /** Fired when the step opens (e.g. start the replay). */
  event?: string;
  /** How long to wait for the target to appear, ms. */
  wait?: number;
};

const STEPS: Step[] = [
  { page: "/", title: "Welcome to the AP invoice agent", body: "Suppliers send invoices. Someone in accounts payable has to check each one against the purchase order and decide whether to pay it. This agent does that check, shows every step, and hands people only the invoices that need them. This tour takes about a minute and costs nothing to run." },
  { page: "/", target: '[data-tour="inbox"]', title: "Invoices arrive by email", body: "Suppliers email their invoices as PDFs to the AP inbox, with \"Invoice\" in the subject. Each one appears here and runs through the agent by itself, and a reply is drafted in the email thread for a person to send." },
  { page: "/", target: '[data-tour="samples"]', title: "Seven ready-made test invoices", body: "Each one tests a different real-world situation: a clean invoice, a blurry scan, a duplicate, a missing purchase order, and more. The label shows what the agent should decide." },
  { page: "/", target: '[data-tour="upload"]', title: "Or bring your own", body: "Drop any invoice PDF here. It goes through exactly the same steps as the test invoices." },
  { page: "/", target: '[data-tour="stepper"]', event: "tour:replay", wait: 4000, title: "Watch an invoice being processed", body: "This is a replay of a real run of the clean test invoice. Each step lights up as it finishes. A live run takes about 10 to 15 seconds." },
  { page: "/", target: '[data-tour="pdf"]', title: "The invoice itself", body: "The original document stays on screen, so you can check anything the agent says against the page." },
  { page: "/", target: '[data-tour="stage-2"]', wait: 8000, title: "Step 3: read every field", body: "The AI reads each field, says how sure it is, and records the exact text it saw. Anything it cannot read clearly is flagged in amber and never guessed." },
  { page: "/", target: '[data-tour="stage-4"]', wait: 8000, title: "Step 5: four separate checks", body: "Readable? Complete? Does the amount fit the purchase order? Approved supplier, and not a duplicate? Each check is independent, so one problem cannot hide behind good numbers elsewhere." },
  { page: "/", target: '[data-tour="decision"]', wait: 12000, title: "The decision, in plain words", body: "Fixed rules, not the AI, make the final call, so the same invoice always gets the same answer. You see the decision, why, what happens next, and the exact rule that was used." },
  { page: "/dashboard", target: '[data-tour="kpis"]', title: "The dashboard", body: "How many invoices went through, how many needed nobody, how many needed a person, the average time and AI cost, and the hours saved against doing it by hand." },
  { page: "/dashboard", target: '[data-tour="reasons"]', title: "Why a person was needed", body: "Every invoice sent to a person is counted by reason. This is how you spot whether the problem is bad scans, missing purchase orders or something else." },
  { page: "/dashboard", target: '[data-tour="history"]', title: "Every run, searchable", body: "Click any row to reopen that invoice exactly as it was processed." },
  { page: "/queue", target: '[data-tour="queue"]', title: "The review queue", body: "Invoices that need a person land here, most money at risk first. A reviewer fixes anything the agent could not read, then approves or rejects with one click. A drafted note to the supplier is ready to send." },
  { page: "/queue", target: '[data-tour="chat"]', title: "Ask anything", body: "Not sure why something happened? Ask in plain English, like \"why did the scanned invoice need a person?\". Answers come from the live data in this app." },
  { page: "/queue", target: '[data-tour="settings"]', title: "Settings and safety", body: "Paying automatically is switched off by default. It can be turned on with a high confidence bar once the team trusts the results. Reset demo data puts everything back to the start." },
  { page: "/", title: "That is the whole flow", body: "Pick a test invoice to run it live, or drop in your own. You can replay this tour any time from \"Take the tour\" at the top." },
];

const DISMISS_KEY = "tour-dismissed";

export function Tour() {
  const router = useRouter();
  const path = usePathname();
  const [step, setStep] = useState<number | null>(null);
  // Spotlight state is tagged with its step, so a new step starts clean without resetting state in an effect.
  const [found, setFound] = useState<{ i: number; rect: DOMRect | null; missing: boolean } | null>(null);
  const [invite, setInvite] = useState(false);

  useEffect(() => {
    const start = () => { setInvite(false); setStep(0); };
    window.addEventListener("tour:start", start);
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* ignore */ }
    const t = dismissed ? null : setTimeout(() => setInvite(true), 900);
    return () => { window.removeEventListener("tour:start", start); if (t) clearTimeout(t); };
  }, []);

  const s = step === null ? null : STEPS[step];

  // Navigate, fire the step's event, then wait for the target to exist.
  useEffect(() => {
    if (!s) return;
    if (path !== s.page) { router.push(s.page); return; }
    if (s.event) window.dispatchEvent(new Event(s.event));
    if (!s.target) return;
    const i = step!;
    const started = Date.now();
    let raf = 0;
    const find = () => {
      const el = document.querySelector(s.target!);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        setTimeout(() => setFound({ i, rect: el.getBoundingClientRect(), missing: false }), 350);
        return;
      }
      if (Date.now() - started > (s.wait ?? 3000)) { setFound({ i, rect: null, missing: true }); return; }
      raf = window.setTimeout(find, 150) as unknown as number;
    };
    find();
    return () => clearTimeout(raf);
  }, [s, step, path, router]);

  // Keep the spotlight on the target while the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!s?.target) return;
    const update = () => {
      const el = document.querySelector(s.target!);
      if (el && step !== null) setFound({ i: step, rect: el.getBoundingClientRect(), missing: false });
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const t = setInterval(update, 400);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); clearInterval(t); };
  }, [s, step]);

  const close = useCallback(() => {
    setStep(null);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  }, []);
  const go = useCallback((d: number) => {
    setStep((i) => {
      if (i === null) return null;
      const n = i + d;
      if (n < 0) return 0;
      if (n >= STEPS.length) { close(); return null; }
      return n;
    });
  }, [close]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, go, close]);

  if (invite && step === null) {
    return (
      <div className="fixed bottom-5 left-5 z-40 w-[min(340px,calc(100vw-2.5rem))] rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl">
        <div className="font-semibold">New here?</div>
        <p className="mt-1 text-sm text-zinc-600">Take a one-minute guided tour of how an invoice goes from PDF to decision.</p>
        <div className="mt-3 flex gap-2">
          <button onClick={() => { setInvite(false); setStep(0); }} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Start the tour</button>
          <button onClick={() => { setInvite(false); try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ } }} className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">Not now</button>
        </div>
      </div>
    );
  }
  if (!s) return null;

  const rect = found?.i === step ? found.rect : null;
  const missing = found?.i === step ? found.missing : false;
  const pad = 8;
  const hasSpot = !!(s.target && rect && !missing);
  const spot = hasSpot ? { top: rect!.top - pad, left: rect!.left - pad, width: rect!.width + pad * 2, height: rect!.height + pad * 2 } : null;

  // Popover placement: below the target if it fits, else above, else centred.
  const W = Math.min(380, typeof window !== "undefined" ? window.innerWidth - 32 : 380);
  let pop: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: W };
  if (spot && typeof window !== "undefined") {
    const vh = window.innerHeight, vw = window.innerWidth;
    const left = Math.max(16, Math.min(vw - W - 16, spot.left + spot.width / 2 - W / 2));
    if (spot.top + spot.height + 220 < vh) pop = { left, top: spot.top + spot.height + 12, width: W };
    else if (spot.top - 220 > 0) pop = { left, top: spot.top - 12, transform: "translateY(-100%)", width: W };
    else pop = { left, bottom: 16, width: W };
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {spot ? (
        <div className="pointer-events-none fixed rounded-xl ring-2 ring-indigo-400 transition-all duration-300"
          style={{ ...spot, boxShadow: "0 0 0 9999px rgba(24,24,27,0.55)" }} />
      ) : (
        <div className="fixed inset-0 bg-zinc-900/55" />
      )}
      <div className="fixed rounded-2xl bg-white p-5 shadow-2xl" style={pop}>
        <div className="mb-1 text-xs font-medium text-indigo-600">Step {step! + 1} of {STEPS.length}</div>
        <h2 id="tour-title" className="text-lg font-semibold text-zinc-900">{s.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-700">{s.body}</p>
        {missing && <p className="mt-2 text-xs text-zinc-400">(This part of the page is not showing right now. Press Next to continue.)</p>}
        <div className="mt-4 flex items-center gap-2">
          <button onClick={close} className="text-sm text-zinc-500 hover:text-zinc-800">Skip tour</button>
          <span className="ml-auto" />
          {step! > 0 && <button onClick={() => go(-1)} className="rounded-lg px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100">Back</button>}
          <button autoFocus onClick={() => go(1)} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            {step === STEPS.length - 1 ? "Finish" : "Next"}
          </button>
        </div>
        <div className="mt-3 flex gap-1">{STEPS.map((_, i) => <span key={i} className={`h-1 flex-1 rounded ${i <= step! ? "bg-indigo-500" : "bg-zinc-200"}`} />)}</div>
      </div>
    </div>
  );
}

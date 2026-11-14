export const DECISION_STYLE: Record<string, { chip: string; bar: string; dot: string }> = {
  Excellent: { chip: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  Good: { chip: "bg-sky-50 text-sky-800 ring-sky-600/20", bar: "bg-sky-500", dot: "bg-sky-500" },
  "Review Required": { chip: "bg-amber-50 text-amber-900 ring-amber-600/25", bar: "bg-amber-500", dot: "bg-amber-500" },
  Reject: { chip: "bg-rose-50 text-rose-800 ring-rose-600/20", bar: "bg-rose-500", dot: "bg-rose-500" },
};

export function DecisionChip({ decision, size = "sm" }: { decision: string | null; size?: "sm" | "lg" }) {
  if (!decision) return <span className="text-xs text-zinc-400">running</span>;
  const s = DECISION_STYLE[decision]?.chip ?? "bg-zinc-100 text-zinc-700 ring-zinc-500/20";
  return (
    <span className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${s} ${size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}>
      {decision}
    </span>
  );
}

export function VerdictChip({ verdict }: { verdict: string }) {
  const s = verdict === "pass" ? "bg-emerald-50 text-emerald-700" : verdict === "fail" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800";
  const icon = verdict === "pass" ? "✓" : verdict === "fail" ? "✕" : "?";
  return <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${s}`}>{icon} {verdict}</span>;
}

export const money = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === "" ? "n/a" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-zinc-200 bg-white ${className}`}>{children}</div>;
}

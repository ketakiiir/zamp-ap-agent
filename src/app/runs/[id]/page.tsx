import Link from "next/link";
import { notFound } from "next/navigation";
import { ensureDb, sql } from "@/lib/db";
import { RunView } from "@/components/RunView";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureDb();
  const rows = (await sql`SELECT * FROM runs WHERE run_id = ${id}`) as any[];
  if (!rows.length) notFound();
  const r = rows[0];
  const stages = Object.fromEntries(Object.entries(r.stages ?? {}).map(([k, v]) => [Number(k), v])) as any;
  const reviews = (await sql`SELECT action, edited_fields, reviewer_note, acted_at FROM reviews WHERE run_id = ${id} ORDER BY acted_at`) as any[];
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Link href="/dashboard" className="text-zinc-500 hover:text-zinc-800">← Dashboard</Link>
        <span className="text-zinc-300">/</span>
        <span className="font-mono text-zinc-700">{id}</span>
        <span className="text-zinc-400">{new Date(r.created_at).toLocaleString()}</span>
        {r.review_state && <span className="ml-auto rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-700">Queue state: {r.review_state}</span>}
      </div>
      {reviews.length > 0 && (
        <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-3 text-sm">
          {reviews.map((v, i) => (
            <div key={i} className="text-zinc-700">
              <b className="capitalize">{v.action}d</b> by {v.edited_fields?.reviewer ?? "a reviewer"} on {new Date(v.acted_at).toLocaleString()}
              {v.edited_fields && Object.keys(v.edited_fields).filter((k) => k !== "reviewer").length > 0 && <> · corrected {Object.entries(v.edited_fields).filter(([k]) => k !== "reviewer").map(([k, val]) => `${k.replace(/_/g, " ")} to ${val}`).join(", ")}</>}
              {v.reviewer_note && <> · “{v.reviewer_note}”</>}
            </div>
          ))}
        </div>
      )}
      <RunView stages={stages} pdfUrl={r.blob_url} filename={r.filename} runId={id} error={r.status === "error" ? r.reason : null} />
    </main>
  );
}

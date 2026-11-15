import { ensureDb, sql } from "@/lib/db";
import { checkPasscode } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { run_id: string; action: "approve" | "reject"; edited_fields?: Record<string, string>; note?: string; reviewer?: string };

export async function POST(req: Request) {
  const denied = checkPasscode(req);
  if (denied) return denied;
  await ensureDb();
  const b = (await req.json()) as Body;
  if (!b.run_id || !["approve", "reject"].includes(b.action)) return Response.json({ error: "run_id and action required" }, { status: 400 });

  const edited = Object.fromEntries(Object.entries(b.edited_fields ?? {}).filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k, v.trim().slice(0, 200)]));
  const reviewer = (b.reviewer ?? "").trim().slice(0, 80) || "Reviewer";
  const state = b.action === "approve" ? "approved" : "rejected";

  // Only a pending item can be acted on, and only once: the state change is the lock.
  const claimed = (await sql`UPDATE runs SET review_state = ${state}, amount_at_risk = 0,
    invoice_number = COALESCE(${edited.invoice_number ?? null}, invoice_number)
    WHERE run_id = ${b.run_id} AND review_state = 'pending' RETURNING run_id`) as { run_id: string }[];
  if (!claimed.length) return Response.json({ error: "This invoice was already approved or rejected. Refresh the queue." }, { status: 409 });

  await sql`INSERT INTO reviews (run_id, action, edited_fields, reviewer_note) VALUES (${b.run_id}, ${b.action},
    ${JSON.stringify({ ...edited, reviewer })}::jsonb, ${b.note ?? null})`;
  if (edited.invoice_number) await sql`UPDATE invoices SET invoice_number = ${edited.invoice_number} WHERE run_id = ${b.run_id}`;
  if (b.action === "reject") await sql`UPDATE invoices SET decision = 'Reject' WHERE run_id = ${b.run_id}`;
  return Response.json({ ok: true, review_state: state });
}

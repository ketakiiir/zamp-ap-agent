import { ensureDb, sql } from "@/lib/db";
import { INBOX_ADDRESS, mailboxConnected } from "@/lib/mailbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recent invoices that arrived by email, for the Inbox panel. */
export async function GET() {
  await ensureDb();
  const rows = (await sql`SELECT run_id, sender, subject, filename, status, decision, created_at,
    (SELECT count(*) FROM jsonb_object_keys(stages))::int AS steps_done
    FROM runs WHERE source = 'email' ORDER BY created_at DESC LIMIT 12`) as any[];
  return Response.json({
    connected: mailboxConnected(),
    address: INBOX_ADDRESS,
    items: rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() })),
  });
}

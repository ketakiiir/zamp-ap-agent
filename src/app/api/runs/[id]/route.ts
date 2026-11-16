import { ensureDb, sql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One run with its saved steps, polled by the page while an emailed invoice is processing. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureDb();
  const rows = (await sql`SELECT run_id, filename, blob_url, status, stages, source, sender, subject, reason FROM runs WHERE run_id = ${id}`) as any[];
  if (!rows.length) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(rows[0]);
}

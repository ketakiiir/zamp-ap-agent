import { after } from "next/server";
import { ensureDb, sql } from "@/lib/db";
import { checkRate } from "@/lib/guard";
import { draftReplyForRun, inboundSecretOk, SUBJECT_RULE } from "@/lib/mailbox";
import { runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Inbound = {
  message_id: string;
  thread_id?: string;
  from?: string;
  subject?: string;
  filename?: string;
  pdf_base64: string;
};

/** Called by the mailbox script for each PDF attached to an invoice email. Answers at once, processes after. */
export async function POST(req: Request) {
  if (!inboundSecretOk(req.headers.get("x-inbound-secret"))) return Response.json({ error: "Not allowed" }, { status: 401 });
  const limited = checkRate(req, "inbound", 40);
  if (limited) return limited;

  const b = (await req.json()) as Inbound;
  const subject = String(b.subject ?? "").slice(0, 300);
  if (!SUBJECT_RULE.test(subject)) return Response.json({ skipped: "Subject does not follow the invoice template" }, { status: 202 });
  if (!b.message_id || !b.pdf_base64) return Response.json({ error: "message_id and pdf_base64 required" }, { status: 400 });

  const bytes = new Uint8Array(Buffer.from(b.pdf_base64, "base64"));
  if (bytes.length > 15 * 1024 * 1024) return Response.json({ skipped: "PDF over 15 MB" }, { status: 202 });
  if (String.fromCharCode(...bytes.slice(0, 4)) !== "%PDF") return Response.json({ skipped: "Attachment is not a PDF" }, { status: 202 });

  const filename = String(b.filename ?? "invoice.pdf").slice(0, 120);
  const ref = `${b.message_id}:${filename}`;
  await ensureDb();
  const seen = (await sql`SELECT run_id FROM runs WHERE message_ref = ${ref}`) as { run_id: string }[];
  if (seen.length) return Response.json({ duplicate: true, run_id: seen[0].run_id }, { status: 200 });

  after(async () => {
    let runId: string | null = null;
    await runPipeline({ name: filename, bytes }, (e) => { if (e.type === "run") runId = e.run_id; }, {
      source: "email", sender: String(b.from ?? "").slice(0, 200), subject, message_ref: ref, thread_id: b.thread_id ?? null,
    });
    if (runId) await draftReplyForRun(runId);
  });
  return Response.json({ accepted: true }, { status: 202 });
}

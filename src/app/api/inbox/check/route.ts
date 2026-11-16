import { checkPasscode, checkRate } from "@/lib/guard";
import { triggerMailboxCheck } from "@/lib/mailbox";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** "Check inbox now": asks the mailbox script to look for new invoice emails immediately. */
export async function POST(req: Request) {
  const denied = checkPasscode(req) ?? checkRate(req, "inbox-check", 30);
  if (denied) return denied;
  try {
    const r = await triggerMailboxCheck();
    return Response.json(r, { status: r.ok ? 200 : 502 });
  } catch (e) {
    return Response.json({ ok: false, detail: (e as Error).message }, { status: 502 });
  }
}

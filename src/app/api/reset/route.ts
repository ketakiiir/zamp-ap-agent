import { resetDemo } from "@/lib/db";
import { checkPasscode } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = checkPasscode(req);
  if (denied) return denied;
  await resetDemo();
  return Response.json({ ok: true });
}

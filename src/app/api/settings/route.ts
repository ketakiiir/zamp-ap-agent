import { getSettings, setSetting } from "@/lib/db";
import { checkPasscode } from "@/lib/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getSettings());
}

export async function POST(req: Request) {
  const denied = checkPasscode(req);
  if (denied) return denied;
  const body = (await req.json()) as { auto_approve?: boolean; confidence_threshold?: number };
  if (typeof body.auto_approve === "boolean") await setSetting("auto_approve", body.auto_approve);
  if (typeof body.confidence_threshold === "number") {
    await setSetting("confidence_threshold", Math.min(1, Math.max(0.5, body.confidence_threshold)));
  }
  return Response.json(await getSettings());
}

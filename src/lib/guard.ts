// Light protection for a public demo URL: a shared passcode on anything that
// spends money or changes data, plus a best-effort per-IP rate limit. The
// Anthropic console spend cap is the hard backstop.

const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_RUNS = 30;

export function checkPasscode(req: Request): Response | null {
  const expected = process.env.DEMO_PASSCODE;
  if (!expected) return null; // open in local dev
  const got = req.headers.get("x-demo-passcode") ?? "";
  if (got !== expected) return Response.json({ error: "Passcode required. Enter it in the top bar." }, { status: 401 });
  return null;
}

export function checkRate(req: Request): Response | null {
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_RUNS) return Response.json({ error: "Rate limit: too many runs from this address. Try again in a few minutes." }, { status: 429 });
  list.push(now);
  hits.set(ip, list);
  return null;
}

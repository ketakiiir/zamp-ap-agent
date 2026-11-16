import { neon } from "@neondatabase/serverless";
import { POS, PRIOR_INVOICES, VENDORS } from "./seed";
import { fingerprint } from "./fingerprint";

export const sql = neon(process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "postgres://missing");

let ready: Promise<void> | null = null;

/** Create tables on first use and seed reference data if empty. Idempotent. */
export function ensureDb(): Promise<void> {
  if (!ready) ready = init().catch((e) => { ready = null; throw e; });
  return ready;
}

async function init() {
  await sql`CREATE TABLE IF NOT EXISTS approved_vendors (
    vendor_id text PRIMARY KEY, name text NOT NULL, aliases text[] NOT NULL DEFAULT '{}',
    tax_id text, status text NOT NULL, email text)`;
  await sql`CREATE TABLE IF NOT EXISTS purchase_orders (
    po_number text PRIMARY KEY, vendor_id text NOT NULL, description text, amount numeric(12,2) NOT NULL,
    currency text NOT NULL, issued_date date, status text NOT NULL, tolerance_pct numeric(5,2) NOT NULL)`;
  await sql`CREATE TABLE IF NOT EXISTS invoices (
    invoice_id text PRIMARY KEY, run_id text, po_number text, vendor_id text, invoice_number text,
    invoice_date text, total numeric(12,2), fingerprint text, decision text, seeded boolean DEFAULT false,
    created_at timestamptz DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS invoices_fingerprint_idx ON invoices (fingerprint)`;
  await sql`CREATE TABLE IF NOT EXISTS runs (
    run_id text PRIMARY KEY, blob_url text, filename text, status text NOT NULL,
    stages jsonb NOT NULL DEFAULT '{}', decision text, confidence numeric(4,3), rule_fired text,
    routed_to text, reason text, vendor_name text, invoice_number text, amount numeric(12,2),
    amount_at_risk numeric(12,2), auto_approved boolean DEFAULT false, review_state text,
    cost_usd numeric(10,5), ms_total integer, created_at timestamptz DEFAULT now())`;
  // Email intake: where each run came from. Added after launch, so ALTER rather than CREATE.
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS source text DEFAULT 'upload'`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS sender text`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS subject text`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS message_ref text`;
  await sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS thread_id text`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS runs_message_ref_idx ON runs (message_ref) WHERE message_ref IS NOT NULL`;
  await sql`CREATE TABLE IF NOT EXISTS reviews (
    id serial PRIMARY KEY, run_id text NOT NULL, action text NOT NULL, edited_fields jsonb,
    reviewer_note text, acted_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb NOT NULL)`;

  const [{ n }] = (await sql`SELECT count(*)::int AS n FROM approved_vendors`) as { n: number }[];
  if (n === 0) await seedReference();
}

async function seedReference() {
  for (const v of VENDORS) {
    await sql`INSERT INTO approved_vendors VALUES (${v.vendor_id}, ${v.name}, ${v.aliases}, ${v.tax_id}, ${v.status}, ${v.email})
      ON CONFLICT (vendor_id) DO UPDATE SET name = EXCLUDED.name, aliases = EXCLUDED.aliases, status = EXCLUDED.status`;
  }
  for (const p of POS) {
    await sql`INSERT INTO purchase_orders VALUES (${p.po_number}, ${p.vendor_id}, ${p.description}, ${p.amount}, ${p.currency}, ${p.issued_date}, ${p.status}, ${p.tolerance_pct})
      ON CONFLICT (po_number) DO UPDATE SET amount = EXCLUDED.amount, status = EXCLUDED.status`;
  }
  await seedPriorInvoices();
  await sql`INSERT INTO settings VALUES ('auto_approve', 'false'::jsonb) ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO settings VALUES ('confidence_threshold', '0.95'::jsonb) ON CONFLICT DO NOTHING`;
}

async function seedPriorInvoices() {
  for (const inv of PRIOR_INVOICES) {
    const fp = fingerprint(inv.vendor_id, inv.total, inv.invoice_date, inv.lines.map((l) => l.quantity * l.unit_price));
    await sql`INSERT INTO invoices (invoice_id, run_id, po_number, vendor_id, invoice_number, invoice_date, total, fingerprint, decision, seeded)
      VALUES (${inv.invoice_id}, null, ${inv.po_number}, ${inv.vendor_id}, ${inv.invoice_number}, ${inv.invoice_date}, ${inv.total}, ${fp}, ${inv.decision}, true)
      ON CONFLICT (invoice_id) DO NOTHING`;
  }
}

/** Wipe all transactional data and restore the starting state for a demo. Settings return to defaults. */
export async function resetDemo() {
  await ensureDb();
  await sql`TRUNCATE invoices, runs, reviews`;
  await sql`DELETE FROM settings`;
  await seedReference();
}

export type Settings = { auto_approve: boolean; confidence_threshold: number };

export async function getSettings(): Promise<Settings> {
  await ensureDb();
  const rows = (await sql`SELECT key, value FROM settings`) as { key: string; value: unknown }[];
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    auto_approve: m.auto_approve === true,
    confidence_threshold: typeof m.confidence_threshold === "number" ? m.confidence_threshold : 0.95,
  };
}

export async function setSetting(key: keyof Settings, value: boolean | number) {
  await ensureDb();
  await sql`INSERT INTO settings VALUES (${key}, ${JSON.stringify(value)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
}

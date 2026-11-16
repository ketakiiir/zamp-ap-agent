# Invoice Agent (Zamp case study, PS-1)

An accounts payable agent that takes a vendor invoice PDF to a reasoned decision, with every step visible.

**Live:** https://zamp-ap-agent-zeta.vercel.app (running invoices and the assistant need the demo passcode)

> An AP agent is not a reader, it is a decider. A payable invoice is legible, identified, matched, authorised and unique.

All companies, people and numbers in this repo are invented.

## What it does

Invoices arrive by email: a supplier sends a PDF to the AP inbox with "Invoice" in the subject. A Google Apps Script in the mailbox forwards it to `/api/inbound` (shared secret, subject template, PDF check, de-duplicated per email), the app acknowledges at once and processes it in the background, and a reply is saved as a Gmail draft for a person to send. Upload and the test buttons run the same pipeline.

Every invoice goes through seven steps that stream live to the screen:

| # | Step | How |
|---|---|---|
| 1 | Receive | PDF stored in Vercel Blob, a run opened in Postgres |
| 2 | Screen | Claude Haiku: is this an invoice, is it legible? A non-invoice skips steps 3 to 5 |
| 3 | Read | Claude Opus, structured output: every field with a confidence and the text it was read from |
| 4 | Look up | Supplier by tax ID or alias; purchase order by explicit or implied reference; prior invoices on the PO |
| 5 | Check | Four independent checks: Legible, Identified, Matched, Authorised + Unique (pass, fail or uncertain) |
| 6 | Decide | Deterministic rules R1 to R8, first match wins, the rule is named |
| 7 | Route | Approval queue, or a drafted note to the supplier, procurement or AP |

Four outcomes: **Excellent** (ready to pay), **Good** (ready to pay with a note), **Review Required** (a person looks), **Reject**.
Fail means definitely wrong and leads to Reject; uncertain means the agent cannot tell and leads to a person.
Auto-approve exists but ships switched off, behind a confidence gate.

## Edge cases built (with test documents in `public/samples`)

| Document | Outcome |
|---|---|
| Clean invoice, exact PO match | Excellent (R8) |
| Image-only scan, invoice number unreadable | Review Required (R4): cannot read is not the same as wrong |
| Final 40% of a PO already 60% billed | Good (R7): judged against the cumulative balance |
| Same bill resubmitted under a new number | Reject (R2): fingerprint of supplier, total, date and line amounts |
| Clean invoice citing a PO that does not exist | Review Required (R5): routed to procurement, not the supplier |
| Delivery note instead of an invoice | Reject (R1): screening stops it before the expensive model |

Also handled: unknown or suspended supplier (R3), over the PO beyond tolerance or totals that do not add up (R6), a line whose quantity times price does not match its amount (R6), a closed PO, extraction failure (routes to a person, never crashes).

## Pages

- **Process an invoice:** test invoices, upload, live run view
- **Dashboard:** volume, decision mix, why a person was needed, time, AI cost, hours saved vs a stated 4-minute manual baseline
- **Review queue:** sorted by amount at risk; correct fields, approve or reject (each item can be actioned once, reviewer recorded)
- **How it works:** pipeline, checks, rules, assumptions
- **Guided tour** (replays a real run, no AI cost) and an **Ask a question** assistant grounded in the live data

## Stack

Next.js 16 on Vercel, Neon Postgres, Vercel Blob, Anthropic SDK (`claude-haiku-4-5` for screening, notes and chat; `claude-opus-5` for reading).
One streaming POST runs the whole pipeline; each step is saved as it completes, so past runs reopen exactly as they ran.

```
src/lib/pipeline.ts   the seven steps
src/lib/rules.ts      checks and decision rules (no model calls)
src/lib/models.ts     Claude calls and structured-output schemas
src/lib/seed.ts       fictional suppliers, POs and prior invoices
scripts/make_samples.py  generates the test PDFs (headless Chrome + Pillow)
tests/rules.test.ts   unit tests for the rules
```

## Run locally

```
npm install
vercel env pull .env.local   # DATABASE_URL, BLOB_STORE_ID; add ANTHROPIC_API_KEY
npm run dev
npm test
```

Tables are created and seeded on first request. Settings > Reset demo data restores the starting state.

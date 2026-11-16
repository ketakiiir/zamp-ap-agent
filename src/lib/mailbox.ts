import { sql } from "./db";

// Email intake talks to a small Google Apps Script running in the AP mailbox's
// Google account. The script forwards invoice emails here and, on request,
// saves a draft reply in the original thread. A person sends the reply.

export const INBOX_ADDRESS = process.env.INBOX_ADDRESS ?? "";
export const SUBJECT_RULE = /\binvoice\b/i;

export function inboundSecretOk(given: string | null | undefined): boolean {
  const expected = process.env.INBOUND_SECRET;
  return !!expected && given === expected;
}

export function mailboxConnected(): boolean {
  return !!process.env.APPS_SCRIPT_URL && !!process.env.INBOUND_SECRET;
}

/** Ask the mailbox script to look for new invoice emails right now. */
export async function triggerMailboxCheck(): Promise<{ ok: boolean; detail: string }> {
  if (!mailboxConnected()) return { ok: false, detail: "Mailbox is not connected yet." };
  const url = `${process.env.APPS_SCRIPT_URL}?action=check&key=${encodeURIComponent(process.env.INBOUND_SECRET!)}`;
  const res = await fetch(url, { redirect: "follow" });
  const text = (await res.text()).slice(0, 300);
  return { ok: res.ok && text.startsWith("ok"), detail: text };
}

/** Save a draft reply in the sender's email thread, with what happened to their invoice. */
export async function draftReplyForRun(runId: string): Promise<void> {
  if (!mailboxConnected()) return;
  const rows = (await sql`SELECT thread_id, decision, rule_fired, auto_approved, invoice_number, amount::float AS amount, stages FROM runs WHERE run_id = ${runId}`) as any[];
  const r = rows[0];
  if (!r?.thread_id) return;
  const out6 = r.stages?.["6"]?.output ?? {};
  const x = r.stages?.["2"]?.output;
  const po = r.stages?.["3"]?.output?.po?.po_number;
  const ref = r.invoice_number ? `invoice ${r.invoice_number}` : "your invoice";
  const amt = r.amount != null ? ` for $${Number(r.amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "";
  const sign = "\n\nKind regards,\nAccounts Payable\nMeadowgate Provisions";

  let body: string;
  if (out6.draft && out6.audience === "Vendor") {
    body = String(out6.draft).replace(/^Subject:.*\n+/i, "");
  } else if (r.auto_approved) {
    body = `Hello,\n\nThank you for ${ref}${amt}. It has been received, matched${po ? ` to ${po}` : ""} and approved for payment processing.${sign}`;
  } else if (r.decision === "Excellent" || r.decision === "Good") {
    body = `Hello,\n\nThank you for ${ref}${amt}. It has been received${po ? ` and matched to ${po}` : ""}, and is with our team for approval.${sign}`;
  } else if (r.decision === "Reject" && r.rule_fired === "R1") {
    body = `Hello,\n\nThank you for your email. The attached document does not appear to be an invoice. Please send the invoice itself and we will process it.${sign}`;
  } else {
    // Internal routes (duplicate, supplier onboarding, missing PO) get a neutral acknowledgement.
    body = `Hello,\n\nThank you for ${ref}${amt}${x?.invoice_date?.value ? ` dated ${x.invoice_date.value}` : ""}. We have received it and our team is reviewing it. We will be in touch if we need anything further.${sign}`;
  }

  await fetch(process.env.APPS_SCRIPT_URL!, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ key: process.env.INBOUND_SECRET, action: "draft", thread_id: r.thread_id, body }),
    redirect: "follow",
  }).catch((e) => console.warn("Draft reply failed:", (e as Error).message));
}

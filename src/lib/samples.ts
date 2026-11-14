export const SAMPLES = [
  { file: "01-clean-invoice-A.pdf", title: "Clean invoice A", vendor: "Larkspur Valley Produce", expect: "Excellent", rule: "R8", why: "Happy path. Matches PO-4501 exactly." },
  { file: "02-scanned-unreadable-number.pdf", title: "Scanned, number smudged", vendor: "Okafor & Lindqvist Packaging", expect: "Review Required", rule: "R4", why: "Image-only scan. Total legible, invoice number is not. Cannot read is not wrong." },
  { file: "03-split-po-40pct.pdf", title: "Split PO, final 40%", vendor: "Brightwater Cold Chain", expect: "Good", rule: "R7", why: "Alone it looks like an undercharge. Judged against the balance left after the prior 60% invoice." },
  { file: "04-duplicate-new-number.pdf", title: "Duplicate, new number", vendor: "Tamsin Ridge Dairy Co-op", expect: "Reject", rule: "R2", why: "Same bill as TRD-2291 under a fresh number. Fingerprint catches it." },
  { file: "05-no-matching-po.pdf", title: "Clean, no matching PO", vendor: "Willowmere Farms", expect: "Review Required", rule: "R5", why: "Perfect document, but the PO it cites does not exist. Our data gap, so procurement, not the vendor." },
  { file: "06-delivery-note.pdf", title: "Delivery note", vendor: "Larkspur Valley Produce", expect: "Reject", rule: "R1", why: "Not an invoice. Cheap triage short-circuits before the expensive model." },
  { file: "07-clean-invoice-B.pdf", title: "Clean invoice B", vendor: "Kestrel Kitchen Supply", expect: "Excellent", rule: "R8", why: "Second clean invoice, for demoing auto-approve without tripping the duplicate check." },
] as const;

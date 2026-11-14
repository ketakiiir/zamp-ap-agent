// Fictional demo dataset. The buyer is "Meadowgate Provisions", a mid-size food
// distributor. Every company name here is invented for the case study.

export const BUYER = {
  name: "Meadowgate Provisions",
  address: "44 Orchard Row, Suite 300, Columbus, OH 43215",
  ap_email: "ap@meadowgate.example",
};

export type VendorSeed = {
  vendor_id: string;
  name: string;
  aliases: string[];
  tax_id: string;
  status: "approved" | "suspended";
  email: string;
};

export const VENDORS: VendorSeed[] = [
  { vendor_id: "V-101", name: "Larkspur Valley Produce", aliases: ["Larkspur Valley Produce LLC", "Larkspur Produce"], tax_id: "84-2217731", status: "approved", email: "billing@larkspurvalley.example" },
  { vendor_id: "V-102", name: "Okafor & Lindqvist Packaging", aliases: ["Okafor and Lindqvist Packaging", "O&L Packaging"], tax_id: "61-5520943", status: "approved", email: "accounts@olpack.example" },
  { vendor_id: "V-103", name: "Brightwater Cold Chain", aliases: ["Brightwater Cold Chain Inc", "Brightwater Logistics"], tax_id: "37-9048816", status: "approved", email: "ar@brightwatercc.example" },
  { vendor_id: "V-104", name: "Tamsin Ridge Dairy Co-op", aliases: ["Tamsin Ridge Dairy Cooperative", "Tamsin Ridge Dairy"], tax_id: "52-1183467", status: "approved", email: "invoices@tamsinridge.example" },
  { vendor_id: "V-105", name: "Willowmere Farms", aliases: ["Willowmere Farms Ltd"], tax_id: "29-7765012", status: "approved", email: "office@willowmere.example" },
  { vendor_id: "V-106", name: "Kestrel Kitchen Supply", aliases: ["Kestrel Kitchen Supply Co"], tax_id: "73-4406289", status: "approved", email: "billing@kestrelkitchen.example" },
  { vendor_id: "V-107", name: "Quillon Haulage", aliases: ["Quillon Haulage Ltd"], tax_id: "18-3390457", status: "suspended", email: "accounts@quillon.example" },
];

export type POSeed = {
  po_number: string;
  vendor_id: string;
  description: string;
  amount: number;
  currency: string;
  issued_date: string;
  status: "open" | "closed";
  tolerance_pct: number;
};

export const POS: POSeed[] = [
  { po_number: "PO-4501", vendor_id: "V-101", description: "Weekly fresh produce, hospital accounts", amount: 11340.0, currency: "USD", issued_date: "2026-10-20", status: "open", tolerance_pct: 2 },
  { po_number: "PO-4502", vendor_id: "V-102", description: "Compostable food containers, Q4", amount: 6205.0, currency: "USD", issued_date: "2026-10-14", status: "open", tolerance_pct: 2 },
  { po_number: "PO-4503", vendor_id: "V-103", description: "Refrigerated linehaul, October to November", amount: 48500.0, currency: "USD", issued_date: "2026-10-01", status: "open", tolerance_pct: 1 },
  { po_number: "PO-4504", vendor_id: "V-104", description: "Dairy supply, school district contract", amount: 8640.0, currency: "USD", issued_date: "2026-10-09", status: "open", tolerance_pct: 2 },
  { po_number: "PO-4506", vendor_id: "V-106", description: "Commercial kitchen smallwares", amount: 4578.5, currency: "USD", issued_date: "2026-10-22", status: "open", tolerance_pct: 2 },
  { po_number: "PO-4507", vendor_id: "V-107", description: "Ad hoc haulage (vendor since suspended)", amount: 5200.0, currency: "USD", issued_date: "2026-08-30", status: "open", tolerance_pct: 2 },
];

// Line items shared by test documents and seeded prior invoices, so the
// fingerprint of a resubmission collides with the original.
export type Line = { description: string; quantity: number; unit_price: number };

export const LINES = {
  cleanA: [
    { description: "Romaine hearts, 24 ct case", quantity: 120, unit_price: 31.5 },
    { description: "Roma tomatoes, 25 lb case", quantity: 90, unit_price: 28.0 },
    { description: "Yellow onions, 50 lb sack", quantity: 60, unit_price: 22.0 },
    { description: "Gala apples, 40 lb case", quantity: 80, unit_price: 46.5 },
  ],
  scanned: [
    { description: "Hinged clamshell 9x9, compostable (case of 200)", quantity: 85, unit_price: 41.0 },
    { description: "Soup cup 16 oz with lid (case of 500)", quantity: 40, unit_price: 68.0 },
  ],
  splitPrior: [
    { description: "Refrigerated linehaul, Columbus to Indianapolis, October loads", quantity: 1, unit_price: 29100.0 },
  ],
  split: [
    { description: "Refrigerated linehaul, Columbus to Indianapolis, November loads", quantity: 1, unit_price: 19400.0 },
  ],
  duplicate: [
    { description: "Whole milk, 1 gal (case of 4)", quantity: 480, unit_price: 12.5 },
    { description: "Low-fat yogurt cups 6 oz (case of 24)", quantity: 120, unit_price: 22.0 },
  ],
  noPo: [
    { description: "Butternut squash, 35 lb case", quantity: 70, unit_price: 27.0 },
    { description: "Sweet potatoes, 40 lb case", quantity: 55, unit_price: 33.0 },
  ],
  cleanB: [
    { description: "Half sheet pans, aluminium (pack of 12)", quantity: 15, unit_price: 96.0 },
    { description: "Food storage containers 22 qt", quantity: 40, unit_price: 38.5 },
    { description: "Cutting boards, colour coded set", quantity: 12, unit_price: 78.0 },
    { description: "Instant-read thermometers", quantity: 25, unit_price: 26.5 },
  ],
} satisfies Record<string, Line[]>;

export const lineTotal = (ls: Line[]) =>
  Math.round(ls.reduce((s, l) => s + l.quantity * l.unit_price, 0) * 100) / 100;

// Invoices that already exist in the AP ledger when the demo starts.
export const PRIOR_INVOICES = [
  {
    // 60% of PO-4503, already approved. The 40% invoice must be judged
    // against the remaining balance, not the full PO.
    invoice_id: "seed-split-60",
    vendor_id: "V-103",
    po_number: "PO-4503",
    invoice_number: "BWC-10388",
    invoice_date: "2026-11-02",
    total: lineTotal(LINES.splitPrior),
    lines: LINES.splitPrior,
    decision: "Excellent",
  },
  {
    // The original that the duplicate test document resubmits.
    invoice_id: "seed-dup-original",
    vendor_id: "V-104",
    po_number: "PO-4504",
    invoice_number: "TRD-2291",
    invoice_date: "2026-11-05",
    total: lineTotal(LINES.duplicate),
    lines: LINES.duplicate,
    decision: "Excellent",
  },
];

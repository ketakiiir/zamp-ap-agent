import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

// Cheap model guards the expensive one. Override with env vars if needed.
export const TRIAGE_MODEL = process.env.TRIAGE_MODEL ?? "claude-haiku-4-5";
export const EXTRACT_MODEL = process.env.EXTRACT_MODEL ?? "claude-opus-5";

// USD per million tokens [input, output].
const PRICES: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1, 5],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-opus-5": [5, 25],
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
};

export type Usage = { model: string; input_tokens: number; output_tokens: number; cost_usd: number };

function usageOf(model: string, u: { input_tokens: number; output_tokens: number }): Usage {
  const [pi, po] = PRICES[model] ?? [5, 25];
  return { model, input_tokens: u.input_tokens, output_tokens: u.output_tokens, cost_usd: (u.input_tokens * pi + u.output_tokens * po) / 1e6 };
}

const client = new Anthropic();

const pdfBlock = (b64: string): Anthropic.DocumentBlockParam => ({
  type: "document",
  source: { type: "base64", media_type: "application/pdf", data: b64.replace(/\s/g, "") },
});

// ---------- Stage 1: triage ----------

export const TriageSchema = z.object({
  is_invoice: z.boolean(),
  document_type: z.enum(["invoice", "delivery_note", "purchase_order", "receipt", "statement", "quote", "other"]),
  quality_score: z.number().describe("0 to 1. How legible the document is overall. 1 = clean digital PDF, below 0.5 = hard to read."),
  legibility_notes: z.string().describe("One sentence on scan quality, skew, smudges, or unreadable regions."),
  vendor_hint: z.string().nullable(),
});
export type Triage = z.infer<typeof TriageSchema>;

export async function runTriage(b64: string, hasTextLayer: boolean): Promise<{ triage: Triage; usage: Usage }> {
  const res = await client.messages.parse({
    model: TRIAGE_MODEL,
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [
        pdfBlock(b64),
        { type: "text", text: `You are the intake gate of an accounts payable team. Classify this document. An invoice is a request for payment from a vendor. Delivery notes, packing slips, POs, quotes and statements are not invoices even if they list items and prices. The PDF ${hasTextLayer ? "has" : "has NO"} machine-readable text layer.` },
      ],
    }],
    output_config: { format: zodOutputFormat(TriageSchema) },
  });
  if (!res.parsed_output) throw new Error(`Triage returned no structured output (stop_reason: ${res.stop_reason})`);
  return { triage: res.parsed_output, usage: usageOf(TRIAGE_MODEL, res.usage) };
}

// ---------- Stage 2: extraction ----------

const Str = z.object({
  value: z.string().nullable(),
  confidence: z.number().describe("0 to 1. Below 0.5 if the characters are smudged, cut off, or guessed."),
  source_text: z.string().nullable().describe("The verbatim text this was read from, or null if absent."),
});
const Num = z.object({
  value: z.number().nullable(),
  confidence: z.number(),
  source_text: z.string().nullable(),
});

export const ExtractSchema = z.object({
  vendor_name: Str,
  vendor_tax_id: Str,
  invoice_number: Str,
  invoice_date: Str.describe("ISO 8601 date YYYY-MM-DD"),
  due_date: Str,
  po_reference: Str.describe("Purchase order number if stated or clearly implied, else null"),
  currency: Str,
  subtotal: Num,
  tax: Num,
  total: Num,
  line_items: z.array(z.object({
    description: z.string(),
    quantity: z.number().nullable(),
    unit_price: z.number().nullable(),
    amount: z.number().nullable(),
    confidence: z.number(),
  })),
  notes: z.string().describe("Anything unusual a reviewer should know, or empty string."),
});
export type Extraction = z.infer<typeof ExtractSchema>;

export async function runExtraction(b64: string): Promise<{ extraction: Extraction; usage: Usage }> {
  const res = await client.messages.parse({
    model: EXTRACT_MODEL,
    max_tokens: 16000,
    output_config: { format: zodOutputFormat(ExtractSchema), effort: "medium" },
    messages: [{
      role: "user",
      content: [
        pdfBlock(b64),
        { type: "text", text: [
          "Extract this vendor invoice into the schema. Rules:",
          "- Read only what is on the page. Never infer or invent a value; if a field is absent, value = null.",
          "- If characters are smudged, blurred, covered or cut off so you cannot read them with certainty, set value to your best partial reading or null and confidence below 0.5. Do not guess silently.",
          "- Confidence is about legibility and certainty of the reading, not about whether the value seems commercially correct.",
          "- Amounts are plain numbers without currency symbols or thousands separators.",
          "- Dates as YYYY-MM-DD.",
        ].join("\n") },
      ],
    }],
  });
  if (res.stop_reason === "refusal") throw new Error("Extraction model declined the request");
  if (!res.parsed_output) throw new Error(`Extraction returned no structured output (stop_reason: ${res.stop_reason})`);
  return { extraction: res.parsed_output, usage: usageOf(EXTRACT_MODEL, res.usage) };
}

// ---------- Stage 6: vendor/AP message draft ----------

export async function draftMessage(brief: string): Promise<{ text: string; usage: Usage }> {
  const res = await client.messages.create({
    model: TRIAGE_MODEL,
    max_tokens: 700,
    messages: [{ role: "user", content: `Write a short, polite, specific email for the accounts payable team to send. Plain text, no markdown, no em dashes, under 120 words, start with "Subject:" on the first line. Do not promise payment dates. Facts:\n${brief}` }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  return { text, usage: usageOf(TRIAGE_MODEL, res.usage) };
}

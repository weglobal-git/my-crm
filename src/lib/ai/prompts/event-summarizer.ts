import { z } from "zod";

export const factZodSchema = z.object({
  factType: z.string().describe("e.g. PAYMENT, PRICE, DECISION, BLOCKER, COMMITMENT"),
  factMode: z.enum(["STATE", "OCCURRENCE"]).describe("STATE replaces old values (e.g. price). OCCURRENCE appends (e.g. payment made)."),
  subject: z.string().describe("The specific subject, e.g. payment.remaining_balance"),
  content: z.string().describe("The human-readable fact content"),
  normalizedValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional().describe("A structured/normalized representation of the value"),
  importance: z.number().int().min(4).max(5).describe("Only include highly important facts (4 or 5)"),
  confidence: z.number().min(0).max(1).describe("Confidence in this fact. <0.80 will flag for review.")
});

export const eventSummaryZodSchema = z.object({
  summary: z.string().describe("A concise, factual summary of the event. Do not invent details."),
  eventType: z.string().describe("The categorized event type, e.g., 'QUOTATION_REQUEST', 'DEAL_WON', 'CLIENT_REPLY', 'GENERAL_NOTE'."),
  importance: z.number().int().min(1).max(5).describe("Integer from 1 (lowest) to 5 (highest) indicating how critical this event is to closing the deal."),
  confidence: z.number().min(0).max(1).describe("Float from 0.0 to 1.0 indicating confidence in the summary."),
  needsContext: z.boolean().describe("True if the event is ambiguous and requires more historical context to understand."),
  nextActions: z.array(z.string()).describe("A list of action items explicitly mentioned or strongly implied."),
  blockers: z.array(z.string()).describe("Any obstacles, concerns, or reasons for delay mentioned in the event."),
  facts: z.array(factZodSchema).max(5).describe("Extracted important facts from this event (max 5).")
});

export type EventSummaryOutput = z.infer<typeof eventSummaryZodSchema>;

export const eventSummarySchema = {
  type: "object",
  properties: {
    summary: { 
      type: "string",
      description: "A concise, factual summary of the event. Do not invent details."
    },
    eventType: { 
      type: "string",
      description: "The categorized event type, e.g., 'QUOTATION_REQUEST', 'DEAL_WON', 'CLIENT_REPLY', 'GENERAL_NOTE'."
    },
    importance: { 
      type: "number",
      description: "Integer from 1 (lowest) to 5 (highest) indicating how critical this event is to closing the deal."
    },
    confidence: { 
      type: "number",
      description: "Float from 0.0 to 1.0 indicating confidence in the summary."
    },
    needsContext: { 
      type: "boolean",
      description: "True if the event is ambiguous and requires more historical context to understand."
    },
    nextActions: {
      type: "array",
      items: { type: "string" },
      description: "A list of action items explicitly mentioned or strongly implied."
    },
    blockers: {
      type: "array",
      items: { type: "string" },
      description: "Any obstacles, concerns, or reasons for delay mentioned in the event."
    },
    facts: {
      type: "array",
      description: "Extracted important facts from this event (max 5).",
      items: {
        type: "object",
        properties: {
          factType: { type: "string", description: "e.g. PAYMENT, PRICE, DECISION, BLOCKER, COMMITMENT" },
          factMode: { type: "string", enum: ["STATE", "OCCURRENCE"], description: "STATE replaces old values. OCCURRENCE appends." },
          subject: { type: "string", description: "The specific subject, e.g. payment.remaining_balance" },
          content: { type: "string", description: "The human-readable fact content" },
          normalizedValue: { description: "A structured/normalized representation of the value" },
          importance: { type: "integer", minimum: 4, maximum: 5, description: "Only include highly important facts (4 or 5)" },
          confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence in this fact. <0.80 will flag for review." }
        },
        required: ["factType", "factMode", "subject", "content", "importance", "confidence"]
      }
    }
  },
  required: ["summary", "eventType", "importance", "confidence", "needsContext", "nextActions", "blockers", "facts"]
};

export const EVENT_SUMMARIZER_SYSTEM_INSTRUCTION = `
You are a factual CRM Event Summarizer for a sales pipeline system.
Your job is to read raw domain events (like notes, stage changes, or file uploads) and summarize them into a structured JSON payload.

Rules:
1. Be concise. Summarize only facts supported by the source text.
2. DO NOT invent details, dates, or prices. If a value is not explicitly stated, omit it.
3. If an event is highly ambiguous (e.g., "Yes, proceed"), set 'needsContext' to true.
4. Categorize the event type accurately.
5. Identify any next actions or blockers. If none, return empty arrays.
6. Rate the importance from 1-5 (1: minor note, 3: standard update, 5: critical deal movement like WON/LOST or major blocker).
`;

export function buildEventSummarizerPrompt(contextPayload: string): string {
  return `
Please summarize the following CRM Domain Event:

--- EVENT CONTEXT ---
${contextPayload}
--- END CONTEXT ---

Output your response as JSON matching the requested schema.
`;
}

import { z } from "zod";

export const factResolutionItemZodSchema = z.object({
  targetFactId: z.string().describe("ID of the fact being evaluated"),
  conflictingFactId: z.string().optional().describe("ID of the conflicting fact, if any"),
  action: z.enum(["MAINTAIN_ACTIVE", "SUPERSEDE", "FLAG_REVIEW", "RETRACT"]).describe("Action to take on the target fact"),
  reason: z.enum(["CONTRADICTED_BY", "UPDATED_BY", "OBSOLETE", "INVALID"]).describe("Reason for the resolution"),
  explanation: z.string().describe("Brief factual explanation of the decision based on available timeline"),
  confidence: z.number().min(0).max(1).describe("Confidence score between 0.0 and 1.0")
});

export const factResolutionZodSchema = z.object({
  resolutions: z.array(factResolutionItemZodSchema).describe("List of resolutions for evaluated facts"),
  dealSummaryInsight: z.string().optional().describe("Optional concise high-level state of active facts")
});

export type FactResolutionOutput = z.infer<typeof factResolutionZodSchema>;

export const factResolutionSchema = {
  type: "object",
  properties: {
    resolutions: {
      type: "array",
      description: "List of resolutions for evaluated facts",
      items: {
        type: "object",
        properties: {
          targetFactId: { type: "string", description: "ID of the fact being evaluated" },
          conflictingFactId: { type: "string", description: "ID of the conflicting fact, if any" },
          action: {
            type: "string",
            enum: ["MAINTAIN_ACTIVE", "SUPERSEDE", "FLAG_REVIEW", "RETRACT"],
            description: "Action to take on the target fact"
          },
          reason: {
            type: "string",
            enum: ["CONTRADICTED_BY", "UPDATED_BY", "OBSOLETE", "INVALID"],
            description: "Reason for the resolution"
          },
          explanation: { type: "string", description: "Brief factual explanation of the decision" },
          confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence score between 0.0 and 1.0" }
        },
        required: ["targetFactId", "action", "reason", "explanation", "confidence"]
      }
    },
    dealSummaryInsight: {
      type: "string",
      description: "Optional concise high-level state of active facts"
    }
  },
  required: ["resolutions"]
};

export const FACT_RESOLVER_SYSTEM_INSTRUCTION = `
You are a precision Deal Fact Verification & Contradiction Resolver agent.
Your objective is to inspect a set of extracted deal facts (both active and under review) alongside the deal's chronological event timeline, identify any contradictions or superseded claims, and decide the appropriate lifecycle action for each fact.

Rules:
1. Ground every decision strictly in the provided chronological timeline and facts.
2. If two facts directly contradict each other:
   - If one is clearly newer and supported by recent customer or internal decisions, the older fact should be marked "SUPERSEDE" with reason "CONTRADICTED_BY" or "UPDATED_BY", and reference the conflictingFactId.
   - If ambiguity exists or both statements might be true in different contexts, mark "FLAG_REVIEW".
3. If a fact is supported and not contradicted, mark "MAINTAIN_ACTIVE".
4. If a fact was based on false or deleted information, mark "RETRACT" with reason "INVALID".
5. Output structured JSON strictly matching the schema.
`;

export function buildFactResolverPrompt(params: {
  dealTitle: string;
  dealStatus: string;
  facts: Array<{ id: string; factType: string; factMode: string; subject: string; content: string; status: string; observedAt: string }>;
  timelineText: string;
}): string {
  const formattedFacts = params.facts.map(f => 
    `- [Fact ID: ${f.id}] [${f.status}] (${f.factMode}) ${f.factType} - ${f.subject}: "${f.content}" (observed: ${f.observedAt})`
  ).join("\n");

  return `
Please verify and resolve any contradictions among the following deal facts.

--- DEAL DETAILS ---
Deal: ${params.dealTitle} (Status: ${params.dealStatus})

--- TIMELINE CONTEXT ---
${params.timelineText}

--- FACTS TO EVALUATE ---
${formattedFacts || "No facts to evaluate."}
--- END ---

Evaluate each fact, identify any conflicts, and return structured resolution actions.
`;
}

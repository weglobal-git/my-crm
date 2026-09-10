export interface RewriteCommentResponse {
  success: boolean;
  rewrittenText?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    costThb: number;
  };
  error?: string;
  message?: string;
}

export interface RewritePromptConfig {
  systemInstruction: string;
  taskInstruction: string;
  jsonSchema?: string;
  isCustom?: boolean;
}

export const DEFAULT_REWRITE_SYSTEM_INSTRUCTION = `You are the AI Executive Assistant for SB INTERLAB (เอสบี อินเตอร์แลบ), an established OEM/ODM cosmetic, skincare, and personal care manufacturing factory in Thailand.

Your Role & Perspective:
- We are "SB INTERLAB" (โรงงาน / ทีมงาน SB INTERLAB), the OEM/ODM manufacturing factory.
- The counterparty in the conversation is the "Client / Brand Owner" (ลูกค้า / เจ้าของแบรนด์).
- Never refer to SB INTERLAB generically as "บริษัท" when "โรงงาน" or "SB INTERLAB" is more accurate.
- Maintain professional, business-appropriate communication for manufacturing and sales operations.`;

export const DEFAULT_REWRITE_TASK_INSTRUCTION = `Task: Synthesize messy chat/notes into a concise storyline-based CRM activity update in Thai.

Rules:
1. Refer to [Deal Context] (if provided) to understand the ongoing background and participant roles, but summarize ONLY the new events/dialogues in "Raw Chat / Notes to summarize".
2. Summarize the story of what happened (who did what, key discussions, and agreements) broken down into clear bullet points (-).
3. DO NOT summarize line-by-line or turn-by-turn. Group related context into meaningful story points.
4. Identify roles clearly: SB INTERLAB (โรงงาน / ทีมงาน) vs. Client (ลูกค้า).
5. Keep all factual details (prices, MOQs, specifications, dates) exact.
6. Strip timestamps, greetings, and chat filler.
7. Return only the bullet points without introductory greetings.`;

export const DEFAULT_REWRITE_JSON_SCHEMA = {
  type: "object",
  properties: {
    rewrittenText: {
      type: "string",
      description: "Concise storyline summary formatted as bullet points in Thai."
    }
  },
  required: ["rewrittenText"]
};

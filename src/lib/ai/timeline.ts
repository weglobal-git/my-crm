export type TimelineEvent = {
  id: string;
  localEventDate: Date | string;
  occurredAt: Date | string;
  summary: string;
  eventType: string;
  importance: number;
  revisionId: string;
  blockers?: string[];
};

export type TimelineResult = {
  text: string;
  includedEventIds: string[];
  omittedCount: number;
  estimatedTokens: number;
};

export type DealAgentContext = {
  text: string;
  recentTimeline: TimelineResult;
  importantFacts: TimelineResult;
  estimatedTokens: number;
};

export function composeDealTimeline(events: TimelineEvent[], maxTokens = 2_000): TimelineResult {
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 64 || maxTokens > 20_000) {
    throw new Error("maxTokens must be between 64 and 20,000");
  }
  const sorted = [...events].sort((a, b) =>
    new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() || a.id.localeCompare(b.id));
  const sections = new Map<string, string[]>();
  const includedEventIds: string[] = [];
  let chars = "DEAL TIMELINE\n".length;

  for (const event of sorted) {
    const date = dateKey(event.localEventDate);
    const line = `- ${event.summary.trim()} [source:${event.id} revision:${event.revisionId}]`;
    const sectionCost = (sections.has(date) ? 0 : date.length + 4) + line.length + 1;
    if (Math.ceil((chars + sectionCost) / 4) > maxTokens) continue;
    const lines = sections.get(date) ?? [];
    lines.push(line);
    sections.set(date, lines);
    includedEventIds.push(event.id);
    chars += sectionCost;
  }

  const body = [...sections].map(([date, lines]) => `[${date}]\n${lines.join("\n")}`).join("\n\n");
  const text = `DEAL TIMELINE${body ? `\n\n${body}` : ""}`;
  return { text, includedEventIds, omittedCount: events.length - includedEventIds.length, estimatedTokens: Math.ceil(text.length / 4) };
}

export function composeImportantFacts(events: TimelineEvent[], maxTokens = 800): TimelineResult {
  validateTokenBudget(maxTokens);
  const candidates = [...events]
    .sort((a, b) => b.importance - a.importance ||
      new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime() ||
      a.id.localeCompare(b.id))
    .flatMap(event => {
      const provenance = `[source:${event.id} revision:${event.revisionId}]`;
      const facts = event.importance >= 4
        ? [`- ${event.summary.trim()} ${provenance}`]
        : [];
      for (const blocker of event.blockers ?? []) {
        const text = blocker.trim();
        if (text) facts.push(`- Blocker: ${text} ${provenance}`);
      }
      return facts.map(text => ({ eventId: event.id, text }));
    });

  const header = "IMPORTANT FACTS";
  const lines: string[] = [];
  const includedEventIds: string[] = [];
  let chars = header.length;
  for (const candidate of candidates) {
    if (estimateTokens(chars + candidate.text.length + 1) > maxTokens) continue;
    lines.push(candidate.text);
    includedEventIds.push(candidate.eventId);
    chars += candidate.text.length + 1;
  }
  const text = `${header}${lines.length ? `\n\n${lines.join("\n")}` : ""}`;
  return {
    text,
    includedEventIds,
    omittedCount: candidates.length - lines.length,
    estimatedTokens: estimateTokens(text.length),
  };
}

export type DealAIFactData = {
  id: string;
  factType: string;
  factMode: "STATE" | "OCCURRENCE" | string;
  subject: string;
  content: string;
  importance: number;
  confidence: number | null;
  observedAt: Date | string;
  localEventDate: Date | string;
  sourceRevisionId?: string;
  sourceDomainEventId?: string;
};

export function composeActiveFacts(facts: DealAIFactData[], maxTokens = 800): TimelineResult {
  validateTokenBudget(maxTokens);
  const candidates = [...facts]
    .sort((a, b) => b.importance - a.importance ||
      new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime() ||
      a.id.localeCompare(b.id))
    .map(fact => {
      const line = `- [${fact.factType}] ${fact.subject}: ${fact.content} [fact:${fact.id}]`;
      return { id: fact.id, text: line };
    });

  const header = "ACTIVE FACTS";
  const lines: string[] = [];
  const includedEventIds: string[] = [];
  let chars = header.length;
  for (const candidate of candidates) {
    if (estimateTokens(chars + candidate.text.length + 1) > maxTokens) continue;
    lines.push(candidate.text);
    includedEventIds.push(candidate.id);
    chars += candidate.text.length + 1;
  }
  const text = `${header}${lines.length ? `\n\n${lines.join("\n")}` : ""}`;
  return {
    text,
    includedEventIds,
    omittedCount: candidates.length - lines.length,
    estimatedTokens: estimateTokens(text.length),
  };
}

export function composeDealAgentContext(
  recentEvents: TimelineEvent[],
  factEvents: TimelineEvent[],
  budgets: { timelineTokens?: number; factTokens?: number } = {},
): DealAgentContext {
  const recentTimeline = composeDealTimeline(recentEvents, budgets.timelineTokens ?? 1_600);
  const recentIds = new Set(recentEvents.map(event => event.id));
  const importantFacts = composeImportantFacts(
    factEvents.filter(event => !recentIds.has(event.id)),
    budgets.factTokens ?? 400,
  );
  const text = `${recentTimeline.text}\n\n${importantFacts.text}`;
  return { text, recentTimeline, importantFacts, estimatedTokens: estimateTokens(text.length) };
}

export function composeDealAgentContextWithFacts(
  recentEvents: TimelineEvent[],
  activeFacts: DealAIFactData[],
  budgets: { timelineTokens?: number; factTokens?: number } = {},
): DealAgentContext {
  const recentTimeline = composeDealTimeline(recentEvents, budgets.timelineTokens ?? 1_600);
  const importantFacts = composeActiveFacts(activeFacts, budgets.factTokens ?? 400);
  const text = `${recentTimeline.text}\n\n${importantFacts.text}`;
  return { text, recentTimeline, importantFacts, estimatedTokens: estimateTokens(text.length) };
}

export function estimateTokens(chars: number): number {
  if (!Number.isSafeInteger(chars) || chars < 0) throw new Error("chars must be a non-negative integer");
  return Math.ceil(chars / 4);
}

function validateTokenBudget(maxTokens: number): void {
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 64 || maxTokens > 20_000) {
    throw new Error("maxTokens must be between 64 and 20,000");
  }
}

function dateKey(value: Date | string) {
  const raw = value instanceof Date ? value.toISOString() : value;
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) throw new Error("Invalid local event date");
  return match[0];
}

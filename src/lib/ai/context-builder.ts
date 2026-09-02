import prisma from "@/lib/prisma";

export async function buildContextForDomainEvent(domainEventId: string): Promise<string> {
  const event = await prisma.dealDomainEvent.findUnique({
    where: { id: domainEventId },
    include: {
      deal: {
        select: {
          topic: true,
          type: true,
          value: true,
          currency: true,
          status: true,
        }
      },
      activityRevision: true,
      actor: {
        select: { name: true }
      }
    }
  });

  if (!event) {
    throw new Error(`DomainEvent not found: ${domainEventId}`);
  }

  // Build the text payload for the LLM
  let payload = `Event Type: ${event.eventType}\n`;
  payload += `Date: ${event.occurredAt.toISOString()}\n`;
  payload += `Actor: ${event.actor?.name || 'System'}\n`;
  payload += `Deal Context: ${event.deal.topic} (Status: ${event.deal.status}, Value: ${event.deal.value} ${event.deal.currency})\n\n`;

  // Payload data (changed fields etc.)
  if (event.payload) {
    payload += `Event Data (JSON):\n${JSON.stringify(event.payload, null, 2)}\n\n`;
  }

  // If this event has an ActivityRevision (e.g. note or comment created/edited)
  if (event.activityRevision) {
    payload += `Activity Content:\n${event.activityRevision.content}\n\n`;
  }

  // Include known active deal facts to provide state context without unbounded history
  const activeFacts = await prisma.dealAIFact.findMany({
    where: { dealId: event.dealId, status: "ACTIVE" },
    select: {
      factType: true,
      subject: true,
      content: true,
    },
    take: 10,
    orderBy: { observedAt: "desc" },
  });

  if (activeFacts.length > 0) {
    payload += `Known Active Deal Facts:\n`;
    for (const fact of activeFacts) {
      payload += `- [${fact.factType}] ${fact.subject}: ${fact.content}\n`;
    }
    payload += `\n`;
  }

  return payload;
}

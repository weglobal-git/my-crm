-- Interactive AI Manager runs do not originate from a domain-event outbox and
-- board-level questions may not target one Deal.
ALTER TABLE "AgentRun"
  ALTER COLUMN "outboxId" DROP NOT NULL,
  ALTER COLUMN "domainEventId" DROP NOT NULL,
  ALTER COLUMN "dealId" DROP NOT NULL;

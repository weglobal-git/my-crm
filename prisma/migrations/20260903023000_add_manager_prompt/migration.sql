-- Additive only: existing policies continue using built-in instructions.
ALTER TABLE "AIModelPolicy" ADD COLUMN "managerPrompt" JSONB;

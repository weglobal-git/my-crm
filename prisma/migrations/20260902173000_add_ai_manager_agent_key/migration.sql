-- Phase 7 policy/budget identity. This does not enable or schedule the agent.
ALTER TYPE "AgentKey" ADD VALUE IF NOT EXISTS 'AI_MANAGER';

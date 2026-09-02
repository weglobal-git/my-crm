import { after } from "next/server";

/**
 * Kicks the durable outbox after the user response has been sent. The outbox
 * remains the source of truth, so a failed kick is safely retried by cron.
 */
export function scheduleEventSummaryProcessing(): void {
  if (process.env.FEATURE_FLAG_AI_WORKER !== "true") return;

  after(async () => {
    try {
      const { OutboxProcessor } = await import("./processor");
      await new OutboxProcessor().processNextPendingOutbox();
    } catch (error: unknown) {
      const name = error instanceof Error ? error.name : "UnknownError";
      console.error(`[AI Worker] asynchronous dispatch failed: ${name}`);
    }
  });
}

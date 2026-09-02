import { NextRequest, NextResponse } from "next/server";
import { OutboxProcessor } from "@/lib/ai/processor";

export const maxDuration = 60; // 60 seconds (Vercel Serverless Function limit for hobby/pro)
export const dynamic = 'force-dynamic'; // prevent caching

export async function GET(request: NextRequest) {
  if (process.env.FEATURE_FLAG_AI_WORKER !== "true") {
    return NextResponse.json(
      { success: false, message: "AI worker is disabled." },
      { status: 503 }
    );
  }

  // 1. Basic security check for Vercel Cron
  // You should configure CRON_SECRET in Vercel environment variables
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Fail closed: a missing deployment secret must never make the worker public.
  if (!cronSecret) {
    return NextResponse.json(
      { success: false, message: "Outbox processor is not configured." },
      { status: 503 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  // 2. Instantiate Processor
  const processor = new OutboxProcessor();
  const maxEventsToProcess = 10;
  let processedCount = 0;
  let errorCount = 0;

  // 3. Process loop (bounded to avoid function timeout)
  for (let i = 0; i < maxEventsToProcess; i++) {
    try {
      // processNextPendingOutbox returns true if it processed something, false on error, null if queue is empty/circuit open
      const result = await processor.processNextPendingOutbox();
      
      if (result === null) {
        // Queue empty or circuit is open, break early
        break;
      }
      
      if (result) {
        processedCount++;
      } else {
        errorCount++;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown processor error";
      console.error("Cron unhandled error:", message);
      errorCount++;
      // Break early if we hit an unexpected catastrophic error to prevent burning execution time
      break; 
    }
  }

  return NextResponse.json({
    success: true,
    processedCount,
    errorCount,
    message: `Processed ${processedCount} events. ${errorCount} errors.`
  });
}

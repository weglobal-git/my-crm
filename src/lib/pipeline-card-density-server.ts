import "server-only";
import { cookies } from "next/headers";
import {
  DEFAULT_PIPELINE_CARD_DENSITY,
  getPipelineCardDensityStorageKey,
  parsePipelineCardDensity,
  type PipelineCardDensity,
} from "./pipeline-card-density-shared";

/**
 * Server-side helper to read user's pipeline card density preference from cookies.
 * Defaults to "compact" when unset.
 */
export async function getStoredPipelineCardDensityServer(
  userId: string
): Promise<PipelineCardDensity> {
  if (!userId) return DEFAULT_PIPELINE_CARD_DENSITY;
  try {
    const cookieStore = await cookies();
    const cookieKey = getPipelineCardDensityStorageKey(userId);
    const raw = cookieStore.get(cookieKey)?.value;
    return parsePipelineCardDensity(raw);
  } catch {
    return DEFAULT_PIPELINE_CARD_DENSITY;
  }
}


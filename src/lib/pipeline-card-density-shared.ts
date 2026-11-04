export type PipelineCardDensity = "compact" | "standard";

export const DEFAULT_PIPELINE_CARD_DENSITY: PipelineCardDensity = "compact";
export const PIPELINE_CARD_DENSITY_COOKIE_PREFIX = "crm_pipeline_card_density_";
export const PIPELINE_CARD_DENSITY_MAX_AGE = 31536000; // 1 year in seconds

export function getPipelineCardDensityStorageKey(userId: string): string {
  return `${PIPELINE_CARD_DENSITY_COOKIE_PREFIX}${userId || "default"}`;
}

export function parseExplicitPipelineCardDensity(
  raw: string | null | undefined
): PipelineCardDensity | null {
  if (!raw) return null;
  try {
    const decoded = raw.includes("%") ? decodeURIComponent(raw) : raw;
    const normalized = decoded.trim().replace(/^"|"$/g, "").toLowerCase();
    if (normalized === "standard") return "standard";
    if (normalized === "compact") return "compact";
  } catch {
    const normalized = raw.trim().replace(/^"|"$/g, "").toLowerCase();
    if (normalized === "standard") return "standard";
    if (normalized === "compact") return "compact";
  }
  return null;
}

export function parsePipelineCardDensity(
  raw: string | null | undefined
): PipelineCardDensity {
  return parseExplicitPipelineCardDensity(raw) ?? DEFAULT_PIPELINE_CARD_DENSITY;
}


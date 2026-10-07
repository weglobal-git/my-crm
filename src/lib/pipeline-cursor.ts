import type { Prisma } from '@prisma/client';
import prisma from "@/lib/prisma";
import { getOpportunityAccessWhere, type PipelineActor } from "@/lib/pipeline-security";
import {
  pipelineOpportunitySelect,
  buildPipelineSearchWhere,
  type KanbanCardDTO,
} from "@/lib/pipeline-opportunities";
import { recordPipelineActionMetric } from "@/lib/pipeline-action-telemetry";

export interface CompletedCursorResult {
  items: KanbanCardDTO[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CompletedCursorPayload {
  version?: number;
  closedAt: string | null;
  id: string;
}

/**
 * Encodes keyset pagination boundary into a versioned URL-safe token.
 * Format: v1|<iso-or-empty>|<id>
 */
export function encodeCompletedCursor(closedAt: Date | string | null | undefined, id: string): string {
  const iso = closedAt ? new Date(closedAt).toISOString() : '';
  return Buffer.from(`v1|${iso}|${id}`, 'utf8').toString('base64url');
}

/**
 * Decodes keyset pagination boundary token.
 * Differentiates between versioned tokens (where closedAt=null is explicitly known)
 * and legacy raw IDs (where closedAt is unknown).
 */
export function decodeCompletedCursor(cursor: string): CompletedCursorPayload | null {
  if (!cursor || typeof cursor !== 'string') return null;

  // Try base64url decoding
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parts = decoded.split('|');
    // Versioned token: v1|<iso-or-empty>|<id>
    if (parts.length === 3 && parts[0] === 'v1' && parts[2]) {
      return {
        version: 1,
        closedAt: parts[1] ? parts[1] : null,
        id: parts[2],
      };
    }
    // Unversioned base64 token: <iso-or-empty>|<id>
    if (parts.length === 2 && parts[1]) {
      return {
        version: 0,
        closedAt: parts[0] ? parts[0] : null,
        id: parts[1],
      };
    }
  } catch {
    // Decoding failed, continue to raw format check
  }

  // Check if cursor is plain "v1|ISO|ID" or "ISO|ID" string
  if (cursor.includes('|')) {
    const parts = cursor.split('|');
    if (parts.length === 3 && parts[0] === 'v1' && parts[2]) {
      return {
        version: 1,
        closedAt: parts[1] ? parts[1] : null,
        id: parts[2],
      };
    }
    if (parts.length === 2 && parts[1]) {
      return {
        version: 0,
        closedAt: parts[0] ? parts[0] : null,
        id: parts[1],
      };
    }
  }

  // Fallback: legacy raw ID (version undefined, closedAt unknown)
  return {
    version: undefined,
    closedAt: null,
    id: cursor.trim(),
  };
}

/**
 * Constructs the deterministic Prisma SQL where clause for keyset pagination.
 * Keyset ordered by closedAt DESC, id DESC.
 * Fully resilient to deleted cursor records.
 */
export function buildCompletedKeysetWhere(
  payload: CompletedCursorPayload
): Prisma.OpportunityWhereInput {
  if (payload.closedAt) {
    const cursorDate = new Date(payload.closedAt);
    return {
      OR: [
        { closedAt: { lt: cursorDate } },
        { closedAt: null },
        {
          AND: [
            { closedAt: cursorDate },
            { id: { lt: payload.id } },
          ],
        },
      ],
    };
  }

  // If closedAt is null, match remaining nulls with smaller id
  return {
    closedAt: null,
    id: { lt: payload.id },
  };
}

/**
 * Stable keyset-based completed opportunities pagination core service.
 * Ordered by closedAt DESC with id DESC as deterministic tie-breaker.
 * Immune to deleted cursor records.
 * Isolated from "use server" boundary so actor cannot be forged by clients.
 */
export async function getCompletedOpportunitiesCursorForActor(
  actor: PipelineActor,
  cursor?: string | null,
  searchQuery?: string,
  limit = 20
): Promise<CompletedCursorResult> {
  const startedAt = performance.now();

  const whereClause: Prisma.OpportunityWhereInput = {
    ...getOpportunityAccessWhere(actor),
    status: { in: ["WON", "LOST", "COMPLETED", "CANCELLED"] },
  };

  const searchWhere = buildPipelineSearchWhere(searchQuery);
  if (searchWhere.OR) {
    whereClause.AND = [{ OR: searchWhere.OR }];
  }

  if (cursor) {
    const payload = decodeCompletedCursor(cursor);
    if (payload) {
      if (payload.version !== undefined || payload.closedAt !== null) {
        // Deterministic keyset condition: works seamlessly without DB lookup, even if boundary record was deleted
        const keysetWhere = buildCompletedKeysetWhere(payload);
        whereClause.AND = [
          ...(Array.isArray(whereClause.AND) ? whereClause.AND : (whereClause.AND ? [whereClause.AND] : [])),
          keysetWhere,
        ];
      } else {
        // Legacy fallback: query DB to resolve boundary if unversioned raw ID
        const boundaryRecord = await prisma.opportunity.findUnique({
          where: { id: payload.id },
          select: { closedAt: true },
        });
        if (boundaryRecord) {
          const keysetWhere = buildCompletedKeysetWhere({
            closedAt: boundaryRecord.closedAt ? boundaryRecord.closedAt.toISOString() : null,
            id: payload.id,
          });
          whereClause.AND = [
            ...(Array.isArray(whereClause.AND) ? whereClause.AND : (whereClause.AND ? [whereClause.AND] : [])),
            keysetWhere,
          ];
        }
      }
    }
  }

  const rawDeals = await prisma.opportunity.findMany({
    where: whereClause,
    orderBy: [
      { closedAt: { sort: "desc", nulls: "last" } },
      { id: "desc" },
    ],
    take: limit + 1,
    select: pipelineOpportunitySelect,
  });

  const hasMore = rawDeals.length > limit;
  const items = hasMore ? rawDeals.slice(0, limit) : rawDeals;

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    nextCursor = encodeCompletedCursor(lastItem.closedAt, lastItem.id);
  }

  const durationMs = performance.now() - startedAt;
  recordPipelineActionMetric({
    action: "getCompletedOpportunitiesCursor",
    role: actor.role,
    status: "SUCCESS",
    durationMs,
  });

  return {
    items,
    nextCursor,
    hasMore,
  };
}

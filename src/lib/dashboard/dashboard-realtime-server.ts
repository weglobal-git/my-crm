import 'server-only';

import { randomUUID } from 'node:crypto';
import prisma from '@/lib/prisma';
import { pusherServer } from '@/lib/pusher-server';
import {
  DASHBOARD_CHANNEL_EVENT,
  type DashboardInvalidationEvent,
  type DashboardResource,
} from './dashboard-realtime';

/**
 * Resolves all user IDs authorized to receive Dashboard invalidations.
 * Strictly limited to ADMIN or users belonging to a department with crm_overview permission.
 */
export async function resolveDashboardAudience(): Promise<string[]> {
  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { role: 'ADMIN' },
          {
            departments: {
              some: {
                permissions: {
                  some: {
                    visible: true,
                    menuItem: { key: 'crm_overview' },
                  },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  } catch (err) {
    console.error('[DASHBOARD-REALTIME] Failed to resolve dashboard audience:', err);
    return [];
  }
}

export interface DispatchDashboardInvalidationInput {
  resources: DashboardResource[];
  mutationId?: string;
  revision?: number;
  affectedYears?: number[];
  countryCodes?: string[];
  companyIds?: string[];
}

/**
 * Broadcasts a lightweight invalidation event (< 5 KB) to all authorized dashboard users.
 * Never leaks customer/deal records, amounts, or private fields over Pusher.
 */
export async function dispatchDashboardInvalidation(
  input: DispatchDashboardInvalidationInput
): Promise<void> {
  try {
    const recipientIds = await resolveDashboardAudience();
    if (recipientIds.length === 0) return;

    const event: DashboardInvalidationEvent = {
      schemaVersion: 1,
      eventId: randomUUID(),
      mutationId: input.mutationId,
      revision: input.revision,
      occurredAt: new Date().toISOString(),
      resources: input.resources,
      affectedYears: input.affectedYears,
      countryCodes: input.countryCodes,
      companyIds: input.companyIds,
    };

    // Batch in groups of 90 (Pusher max 100 channels per trigger call)
    for (let i = 0; i < recipientIds.length; i += 90) {
      const channels = recipientIds.slice(i, i + 90).map((uid) => `private-dashboard-${uid}`);
      await pusherServer.trigger(channels, DASHBOARD_CHANNEL_EVENT, event);
    }
  } catch (err) {
    console.error(
      '[DASHBOARD-REALTIME] Invalidation broadcast failed; Neon remains authoritative:',
      err
    );
  }
}

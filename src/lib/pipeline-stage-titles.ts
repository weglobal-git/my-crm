import 'server-only';

import prisma from '@/lib/prisma';
import type { PipelineActor } from '@/lib/pipeline-security';
import type { PipelineStage } from '@prisma/client';

export type PipelineDepartmentOption = {
  id: string;
  name: string;
  hasSalesAccess?: boolean;
};

export type PipelineStageTitlesByDepartment = Record<string, Record<string, string>>;

export type StageTitleContextResult = {
  departments: PipelineDepartmentOption[];
  titlesByDepartment: PipelineStageTitlesByDepartment;
  canEdit: boolean;
};

// In-Memory TTL Cache for Pipeline Stages (60 seconds)
let cachedPipelineStages: PipelineStage[] | null = null;
let cachedPipelineStagesExpiry = 0;
const PIPELINE_STAGE_CACHE_TTL_MS = 60_000;

export async function getCachedPipelineStages(): Promise<PipelineStage[]> {
  const now = Date.now();
  if (cachedPipelineStages && now < cachedPipelineStagesExpiry) {
    return cachedPipelineStages;
  }
  const stages = await prisma.pipelineStage.findMany({ orderBy: { order: 'asc' } });
  cachedPipelineStages = stages;
  cachedPipelineStagesExpiry = now + PIPELINE_STAGE_CACHE_TTL_MS;
  return stages;
}

export function clearCachedPipelineStages() {
  cachedPipelineStages = null;
  cachedPipelineStagesExpiry = 0;
}

// In-Memory TTL Cache for Department Stage Title Context (30 seconds)
const stageTitleContextCache = new Map<string, { expiresAt: number; data: StageTitleContextResult }>();
const STAGE_TITLE_CONTEXT_TTL_MS = 30_000;

export async function getPipelineStageTitleContext(actor: PipelineActor): Promise<StageTitleContextResult> {
  const cacheKey = `${actor.id}:${actor.role}`;
  const now = Date.now();
  const cached = stageTitleContextCache.get(cacheKey);
  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  const departments = await prisma.department.findMany({
    where: actor.role === 'ADMIN' ? undefined : { users: { some: { id: actor.id } } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const departmentIds = departments.map((department) => department.id);
  const [overrides, deptPerms] = await Promise.all([
    departmentIds.length === 0
      ? []
      : prisma.pipelineStageTitleOverride.findMany({
          where: { departmentId: { in: departmentIds } },
          select: { departmentId: true, pipelineStageId: true, title: true },
        }),
    departmentIds.length === 0
      ? []
      : prisma.departmentMenuPermission.findMany({
          where: {
            departmentId: { in: departmentIds },
            menuItem: { key: 'pipeline.information' },
          },
          select: { departmentId: true },
        }),
  ]);

  const salesDeptIds = new Set(deptPerms.map((dp) => dp.departmentId));
  const departmentsWithOptions: PipelineDepartmentOption[] = departments.map((dept) => ({
    id: dept.id,
    name: dept.name,
    hasSalesAccess: salesDeptIds.has(dept.id),
  }));

  const titlesByDepartment: PipelineStageTitlesByDepartment = {};
  for (const override of overrides) {
    (titlesByDepartment[override.departmentId] ??= {})[override.pipelineStageId] = override.title;
  }

  const result: StageTitleContextResult = {
    departments: departmentsWithOptions,
    titlesByDepartment,
    canEdit: actor.role === 'ADMIN' || actor.role === 'MANAGEMENT',
  };

  stageTitleContextCache.set(cacheKey, { expiresAt: now + STAGE_TITLE_CONTEXT_TTL_MS, data: result });
  return result;
}

export function clearPipelineStageTitleContextCache(actorId?: string) {
  if (actorId) {
    for (const key of stageTitleContextCache.keys()) {
      if (key.startsWith(`${actorId}:`)) {
        stageTitleContextCache.delete(key);
      }
    }
  } else {
    stageTitleContextCache.clear();
  }
}


'use server';

import prisma from '@/lib/prisma';
import { requirePipelineActor } from '@/lib/pipeline-security';

const MAX_STAGE_TITLE_LENGTH = 80;

export async function updatePipelineStageDepartmentTitle(
  pipelineStageId: string,
  departmentId: string,
  nextTitle: string,
) {
  const actor = await requirePipelineActor();
  if (actor.role !== 'ADMIN' && actor.role !== 'MANAGEMENT') {
    throw new Error('Forbidden');
  }

  const title = nextTitle.trim();
  if (!pipelineStageId || !departmentId || title.length > MAX_STAGE_TITLE_LENGTH) {
    throw new Error('Invalid column title');
  }

  const [stage, departmentAllowed] = await Promise.all([
    prisma.pipelineStage.findUnique({ where: { id: pipelineStageId }, select: { id: true } }),
    prisma.department.findFirst({
      where: {
        id: departmentId,
        ...(actor.role === 'ADMIN' ? {} : { users: { some: { id: actor.id } } }),
      },
      select: { id: true },
    }),
  ]);

  if (!stage || !departmentAllowed) throw new Error('Forbidden');

  if (!title) {
    await prisma.pipelineStageTitleOverride.deleteMany({
      where: { pipelineStageId, departmentId },
    });
    return { pipelineStageId, departmentId, title: null };
  }

  const override = await prisma.pipelineStageTitleOverride.upsert({
    where: { pipelineStageId_departmentId: { pipelineStageId, departmentId } },
    create: { pipelineStageId, departmentId, title },
    update: { title },
    select: { pipelineStageId: true, departmentId: true, title: true },
  });

  return override;
}

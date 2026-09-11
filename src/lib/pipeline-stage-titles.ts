import 'server-only';

import prisma from '@/lib/prisma';
import type { PipelineActor } from '@/lib/pipeline-security';

export type PipelineDepartmentOption = {
  id: string;
  name: string;
};

export type PipelineStageTitlesByDepartment = Record<string, Record<string, string>>;

export async function getPipelineStageTitleContext(actor: PipelineActor): Promise<{
  departments: PipelineDepartmentOption[];
  titlesByDepartment: PipelineStageTitlesByDepartment;
  canEdit: boolean;
}> {
  const departments = await prisma.department.findMany({
    where: actor.role === 'ADMIN' ? undefined : { users: { some: { id: actor.id } } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const departmentIds = departments.map((department) => department.id);
  const overrides = departmentIds.length === 0
    ? []
    : await prisma.pipelineStageTitleOverride.findMany({
        where: { departmentId: { in: departmentIds } },
        select: { departmentId: true, pipelineStageId: true, title: true },
      });

  const titlesByDepartment: PipelineStageTitlesByDepartment = {};
  for (const override of overrides) {
    (titlesByDepartment[override.departmentId] ??= {})[override.pipelineStageId] = override.title;
  }

  return {
    departments,
    titlesByDepartment,
    canEdit: actor.role === 'ADMIN' || actor.role === 'MANAGEMENT',
  };
}

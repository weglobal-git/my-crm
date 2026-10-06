import 'server-only';

import prisma from '@/lib/prisma';
import type { PipelineActor } from '@/lib/pipeline-security';

export type PipelineDepartmentOption = {
  id: string;
  name: string;
  hasSalesAccess?: boolean;
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

  return {
    departments: departmentsWithOptions,
    titlesByDepartment,
    canEdit: actor.role === 'ADMIN' || actor.role === 'MANAGEMENT',
  };
}

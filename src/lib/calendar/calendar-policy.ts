import type { CalendarActor } from './calendar-access';

export function canAccessCalendarDepartment(actor: CalendarActor, departmentName: string): boolean {
  return actor.role === 'ADMIN' || (
    ['MANAGEMENT', 'GENERAL'].includes(actor.role) && actor.departments.includes(departmentName)
  );
}

export function canManageCalendarEvent(
  actor: CalendarActor,
  event: { ownerId: string; department: { name: string } }
): boolean {
  return actor.role === 'ADMIN' || actor.id === event.ownerId || (
    actor.role === 'MANAGEMENT' && actor.departments.includes(event.department.name)
  );
}

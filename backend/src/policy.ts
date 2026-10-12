import { ForbiddenException } from '@nestjs/common';
import { OfficeStatus, Role } from '@prisma/client';
export const permissions = ['employees.manage', 'audit.read', 'cases.read', 'cases.write', 'hearings.manage', 'documents.manage', 'finance.read', 'finance.write'] as const;
export function can(user: { role: Role; permissions: string[] }, permission: string) {
  return user.role !== 'SUPER_ADMIN' && (user.role === 'OWNER' || user.permissions.includes(permission));
}
export function access(office: { status: OfficeStatus; trial: { startsAt: Date; expiresAt: Date } | null; subscriptions: { startsAt: Date; expiresAt: Date }[] }, now = new Date()) {
  if (office.status !== 'APPROVED') return { active: false, reason: office.status, expiresAt: null };
  const paid = office.subscriptions.filter(s => s.startsAt <= now && s.expiresAt > now).sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0];
  if (paid) return { active: true, reason: 'SUBSCRIBED', expiresAt: paid.expiresAt };
  if (office.trial && office.trial.startsAt <= now && office.trial.expiresAt > now) return { active: true, reason: 'TRIAL', expiresAt: office.trial.expiresAt };
  return { active: false, reason: 'EXPIRED', expiresAt: office.trial?.expiresAt ?? null };
}
export function requireOffice(user: { role: Role; officeId: string | null }) {
  if (!user.officeId || user.role === 'SUPER_ADMIN') throw new ForbiddenException('Office access required');
  return user.officeId;
}

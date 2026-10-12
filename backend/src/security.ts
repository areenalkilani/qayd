import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { Request } from 'express';
import { Db } from './db';
import { access, can, requireOffice } from './policy';
export const Public = () => SetMetadata('public', true);
export const Platform = () => SetMetadata('platform', true);
export const OfficePermission = (permission: string) => SetMetadata('officePermission', permission);
export const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('hex');
export const cookieName = () => process.env.NODE_ENV === 'production' ? '__Host-qayd_session' : 'qayd_session';
export type AuthRequest = Request & { user: User; sessionId: string };
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(Db) private db: Db, @Inject(Reflector) private reflector: Reflector) {}
  async canActivate(context: ExecutionContext) {
    const handler = context.getHandler();
    if (this.reflector.get('public', handler)) return true;
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.cookies?.[cookieName()];
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new UnauthorizedException();
    const session = await this.db.session.findUnique({ where: { tokenHash: digest(token) }, include: { user: true } });
    if (!session || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') throw new UnauthorizedException();
    req.user = session.user; req.sessionId = session.id;
    if (this.reflector.get('platform', handler) && req.user.role !== 'SUPER_ADMIN') throw new ForbiddenException();
    const permission = this.reflector.get<string>('officePermission', handler);
    if (permission) {
      const officeId = requireOffice(req.user);
      if (!can(req.user, permission)) throw new ForbiddenException('Permission required');
      const office = await this.db.office.findUniqueOrThrow({ where: { id: officeId }, include: { trial: true, subscriptions: true } });
      if (!access(office).active) throw new ForbiddenException('Office subscription is inactive');
      if (process.env.REQUIRE_EMAIL_VERIFICATION === 'true' && !req.user.emailVerifiedAt) throw new ForbiddenException('Verify email first');
    }
    return true;
  }
}
export const publicUser = (u: User) => ({ id: u.id, fullName: u.fullName, email: u.email, phone: u.phone, role: u.role, officeId: u.officeId, permissions: u.permissions, status: u.status, emailVerifiedAt: u.emailVerifiedAt, phoneVerifiedAt: u.phoneVerifiedAt });

import { Body, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Db } from './db';
import { AuthService, hashPassword } from './auth';
import { AuthRequest, OfficePermission, publicUser } from './security';
import { requireOffice } from './policy';
import { employeeCreateSchema, employeeUpdateSchema, pageSchema, parse } from './validation';
import { JsonBody } from './api-docs';

@ApiTags('Office identity') @Controller('office')
export class OfficeController {
  constructor(@Inject(Db) private db: Db, @Inject(AuthService) private auth: AuthService) {}
  @OfficePermission('employees.manage') @Get('employees')
  async employees(@Query() query: unknown, @Req() req: AuthRequest) {
    const { page, search } = parse(pageSchema, query); const officeId = requireOffice(req.user);
    const where = { officeId, OR: [{ fullName: { contains: search, mode: 'insensitive' as const } }, { email: { contains: search, mode: 'insensitive' as const } }] };
    const [items, total] = await this.db.$transaction([this.db.user.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 }), this.db.user.count({ where })]);
    return { items: items.map(publicUser), total, page, pageSize: 20 };
  }
  @OfficePermission('employees.manage') @Post('employees')
  @JsonBody({ fullName: 'string', email: 'string', phone: 'string', password: 'string', confirmPassword: 'string', role: 'string', permissions: 'permissions' }, ['permissions'])
  async create(@Body() input: unknown, @Req() req: AuthRequest) {
    const { password, confirmPassword: _confirmPassword, ...v } = parse(employeeCreateSchema, input); const officeId = requireOffice(req.user);
    this.checkGrant(req, v.permissions);
    const passwordHash = await hashPassword(password);
    const user = await this.db.$transaction(async tx => {
      const employee = await tx.user.create({ data: { ...v, officeId, passwordHash, status: 'ACTIVE' } });
      await tx.audit.create({ data: { officeId, actorId: req.user.id, action: 'EMPLOYEE_CREATED', targetId: employee.id, metadata: { role: v.role, permissions: v.permissions } } });
      return employee;
    });
    return { user: publicUser(user) };
  }
  private checkGrant(req: AuthRequest, permissions: string[]) {
    if (req.user.role !== 'OWNER' && (permissions.includes('employees.manage') || permissions.some(p => !req.user.permissions.includes(p)))) throw new ForbiddenException('Only owners can grant employee management or permissions they do not hold');
  }
  @OfficePermission('employees.manage') @Post('employees/:id')
  @JsonBody({ role: 'string', status: 'string', permissions: 'permissions' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() input: unknown, @Req() req: AuthRequest) {
    const v = parse(employeeUpdateSchema, input); const officeId = requireOffice(req.user);
    this.checkGrant(req, v.permissions);
    return this.db.$transaction(async tx => {
      const target = await tx.user.findFirst({ where: { id, officeId, role: { not: 'OWNER' }, status: { not: 'INVITED' } } });
      if (!target) throw new NotFoundException();
      if (id === req.user.id || (req.user.role !== 'OWNER' && target.permissions.includes('employees.manage'))) throw new ForbiddenException('Owner approval required');
      await tx.user.updateMany({ where: { id, officeId }, data: v });
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.actionToken.deleteMany({ where: { userId: id } });
      await tx.audit.create({ data: { officeId, actorId: req.user.id, action: 'EMPLOYEE_PERMISSIONS_UPDATED', targetId: id, metadata: v } });
      return { ok: true };
    });
  }
  @OfficePermission('employees.manage') @Post('employees/:id/resend')
  async resend(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthRequest) {
    const officeId = requireOffice(req.user);
    const user = await this.db.user.findFirst({ where: { id, officeId, status: 'INVITED' } });
    if (!user) throw new NotFoundException();
    await this.auth.sendToken(user.id, user.email, 'INVITE');
    await this.db.audit.create({ data: { officeId, actorId: req.user.id, action: 'INVITATION_RESENT', targetId: id } });
    return { ok: true };
  }
  @OfficePermission('audit.read') @Get('audit')
  async audit(@Query() query: unknown, @Req() req: AuthRequest) {
    const { page } = parse(pageSchema, query); const officeId = requireOffice(req.user);
    const [items, total] = await this.db.$transaction([this.db.audit.findMany({ where: { officeId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 }), this.db.audit.count({ where: { officeId } })]);
    const ids = [...new Set(items.map(item => item.actorId).filter((value): value is string => Boolean(value)))];
    const users = await this.db.user.findMany({ where: { officeId, id: { in: ids } }, select: { id: true, fullName: true } }); const names = new Map(users.map(user => [user.id, user.fullName]));
    return { items: items.map(item => ({ id: item.id, action: item.action, actorName: item.actorId ? names.get(item.actorId) || 'مستخدم محذوف' : 'النظام', createdAt: item.createdAt })), total, page, pageSize: 20 };
  }
  @Post('registration-response')
  @JsonBody({ note: 'string' })
  async respond(@Req() req: AuthRequest, @Body() input: unknown) {
    const officeId = requireOffice(req.user);
    if (req.user.role !== 'OWNER') throw new ForbiddenException();
    const v = parse(z.object({ note: z.string().trim().min(5).max(2000) }).strict(), input);
    return this.db.$transaction(async tx => {
      if (!(await tx.office.updateMany({ where: { id: officeId, status: 'MORE_INFO' }, data: { status: 'PENDING_APPROVAL' } })).count) throw new NotFoundException();
      await tx.audit.create({ data: { officeId, actorId: req.user.id, action: 'REGISTRATION_RESPONSE', targetId: officeId, metadata: { note: v.note } } });
      await tx.registration.update({ where: { officeId }, data: { reviewNote: v.note } });
      return { ok: true };
    });
  }
}

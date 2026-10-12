import { Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req, BadRequestException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Db } from './db';
import { AuthRequest, OfficePermission } from './security';
import { requireOffice } from './policy';
import { email, name, pageSchema, parse, phone } from './validation';

const id = z.string().uuid();
const text = z.string().trim().max(5000).default('');
const instant = z.string().datetime({ offset: true }).transform(v => new Date(v));
const revision = z.number().int().positive();
const clientInput = z.object({ name, phone, email: email.nullable().default(null), address: z.string().trim().max(500).default(''), notes: text }).strict();
const courtInput = z.object({ name, address: z.string().trim().max(500).default(''), active: z.boolean().default(true) }).strict();
const caseInput = z.object({ internalNumber: z.string().trim().min(1).max(80), clientId: id, courtId: id, courtNumber: z.string().trim().min(1).max(80), type: name, receivedAt: instant, notes: text });
const person = { id: true, fullName: true } as const;
const caseRelations = { client: { select: { id: true, name: true, phone: true } }, court: { select: { id: true, name: true } }, lawyer: { select: person } } as const;
type Tx = Prisma.TransactionClient;
function audit(tx: Tx, req: AuthRequest, action: string, targetId: string, metadata: Prisma.InputJsonObject = {}) {
  return tx.audit.create({ data: { officeId: requireOffice(req.user), actorId: req.user.id, action, targetId, metadata } });
}
async function eligibleUser(tx: Tx, officeId: string, userId: string, lawyer = false) {
  const user = await tx.user.findFirst({ where: { id: userId, officeId, status: 'ACTIVE', ...(lawyer ? { role: { in: ['LAWYER', 'OWNER'] } } : {}) } });
  if (!user) throw new BadRequestException('Select an active employee in your office');
}
async function activeCase(tx: Tx, officeId: string, caseId: string) {
  // Serialize workflows with archiving/closure; never attach new operations to a concurrently closed case.
  await tx.$queryRaw`SELECT "id" FROM "LegalCase" WHERE "id" = ${caseId}::uuid AND "officeId" = ${officeId}::uuid AND "status" = 'ACTIVE' FOR UPDATE`;
  const item = await tx.legalCase.findFirst({ where: { id: caseId, officeId, status: 'ACTIVE' } });
  if (!item) throw new NotFoundException('Active case not found'); return item;
}
async function eligibleCourt(tx: Tx, officeId: string, courtId: string) {
  if (!await tx.court.findFirst({ where: { id: courtId, officeId, active: true } })) throw new BadRequestException('Select an active office court');
}
async function overlaps(tx: Tx, officeId: string, lawyerId: string, at: Date | null, excludeId?: string) {
  if (!at) return [];
  // Scheduling warning assumes a one-hour hearing window, never blocks a legitimate hearing.
  return tx.hearing.findMany({ where: { officeId, lawyerId, status: { in: ['SCHEDULED', 'POSTPONED'] }, scheduledAt: { gt: new Date(at.getTime() - 3600000), lt: new Date(at.getTime() + 3600000) }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true, scheduledAt: true, caseId: true } });
}
@ApiTags('Legal operations') @Controller('legal')
export class LegalController {
  constructor(@Inject(Db) private db: Db) {}
  @OfficePermission('cases.read') @Get('options/:kind')
  async options(@Req() req: AuthRequest, @Param('kind') kind: string) {
    const officeId = requireOffice(req.user);
    if (kind === 'clients') return this.db.client.findMany({ where: { officeId, archivedAt: null }, select: { id: true, name: true, phone: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    if (kind === 'courts') return this.db.court.findMany({ where: { officeId, active: true }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
    if (kind === 'employees') return this.db.user.findMany({ where: { officeId, status: 'ACTIVE' }, select: { ...person, role: true }, orderBy: [{ fullName: 'asc' }, { id: 'asc' }] });
    if (kind === 'cases') return this.db.legalCase.findMany({ where: { officeId, status: 'ACTIVE' }, select: { id: true, internalNumber: true }, orderBy: [{ internalNumber: 'asc' }, { id: 'asc' }] });
    throw new NotFoundException();
  }
  @OfficePermission('cases.read') @Get('clients')
  async clients(@Req() req: AuthRequest, @Query() query: unknown) {
    const v = parse(pageSchema.extend({ archived: z.enum(['true', 'false']).default('false') }), query); const officeId = requireOffice(req.user);
    const where = { officeId, archivedAt: v.archived === 'true' ? { not: null } : null, OR: [{ name: { contains: v.search, mode: 'insensitive' as const } }, { phone: { contains: v.search } }] };
    const [items, total] = await this.db.$transaction([this.db.client.findMany({ where, include: { _count: { select: { cases: true } } }, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (v.page - 1) * 20, take: 20 }), this.db.client.count({ where })]);
    return { items, total, page: v.page, pageSize: 20 };
  }
  @OfficePermission('cases.write') @Post('clients')
  async createClient(@Req() req: AuthRequest, @Body() body: unknown) {
    const v = parse(clientInput, body); return this.db.$transaction(async tx => { const item = await tx.client.create({ data: { ...v, officeId: requireOffice(req.user) } }); await audit(tx, req, 'CLIENT_CREATED', item.id); return item; });
  }
  @OfficePermission('cases.write') @Post('clients/:id')
  async updateClient(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) clientId: string, @Body() body: unknown) {
    const v = parse(clientInput, body); return this.db.$transaction(async tx => { if (!(await tx.client.updateMany({ where: { id: clientId, officeId: requireOffice(req.user) }, data: v })).count) throw new NotFoundException(); await audit(tx, req, 'CLIENT_UPDATED', clientId); return { ok: true }; });
  }
  @OfficePermission('cases.write') @Post('clients/:id/archive')
  async archiveClient(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) clientId: string, @Body() body: unknown) {
    const v = parse(z.object({ archived: z.boolean() }).strict(), body);
    return this.db.$transaction(async tx => { if (!(await tx.client.updateMany({ where: { id: clientId, officeId: requireOffice(req.user) }, data: { archivedAt: v.archived ? new Date() : null } })).count) throw new NotFoundException(); await audit(tx, req, v.archived ? 'CLIENT_ARCHIVED' : 'CLIENT_RESTORED', clientId); return { ok: true }; });
  }
  @OfficePermission('cases.read') @Get('courts')
  async courts(@Req() req: AuthRequest, @Query() query: unknown) {
    const v = parse(pageSchema, query); const where = { officeId: requireOffice(req.user), name: { contains: v.search, mode: 'insensitive' as const } };
    const [items, total] = await this.db.$transaction([this.db.court.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (v.page - 1) * 20, take: 20 }), this.db.court.count({ where })]); return { items, total, page: v.page, pageSize: 20 };
  }
  @OfficePermission('cases.write') @Post('courts')
  async createCourt(@Req() req: AuthRequest, @Body() body: unknown) {
    const v = parse(courtInput, body); return this.db.$transaction(async tx => { const item = await tx.court.create({ data: { ...v, officeId: requireOffice(req.user), normalizedName: v.name.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase() } }); await audit(tx, req, 'COURT_CREATED', item.id); return item; });
  }
  @OfficePermission('cases.write') @Post('courts/:id')
  async updateCourt(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) courtId: string, @Body() body: unknown) {
    const v = parse(courtInput, body); return this.db.$transaction(async tx => { if (!(await tx.court.updateMany({ where: { id: courtId, officeId: requireOffice(req.user) }, data: { ...v, normalizedName: v.name.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase() } })).count) throw new NotFoundException(); await audit(tx, req, 'COURT_UPDATED', courtId); return { ok: true }; });
  }
  @OfficePermission('cases.read') @Get('employees')
  async employees(@Req() req: AuthRequest, @Query() query: unknown) {
    const v = parse(pageSchema, query); const where = { officeId: requireOffice(req.user), status: 'ACTIVE' as const, fullName: { contains: v.search, mode: 'insensitive' as const } };
    const [items, total] = await this.db.$transaction([this.db.user.findMany({ where, select: { ...person, role: true }, orderBy: [{ fullName: 'asc' }, { id: 'asc' }], skip: (v.page - 1) * 20, take: 20 }), this.db.user.count({ where })]); return { items, total, page: v.page, pageSize: 20 };
  }
  @OfficePermission('cases.read') @Get('cases')
  async cases(@Req() req: AuthRequest, @Query() query: unknown) {
    const v = parse(pageSchema.extend({ status: z.enum(['ACTIVE', 'CLOSED', 'ARCHIVED', 'INACTIVE', 'ALL']).default('ALL'), clientId: id.optional() }), query);
    const where: Prisma.LegalCaseWhereInput = { officeId: requireOffice(req.user), ...(v.status === 'ALL' ? {} : { status: v.status === 'INACTIVE' ? { in: ['CLOSED', 'ARCHIVED'] } : v.status }), ...(v.clientId ? { clientId: v.clientId } : {}), OR: [{ internalNumber: { contains: v.search, mode: 'insensitive' } }, { courtNumber: { contains: v.search } }, { client: { name: { contains: v.search, mode: 'insensitive' } } }] };
    const [items, total] = await this.db.$transaction([this.db.legalCase.findMany({ where, include: caseRelations, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (v.page - 1) * 20, take: 20 }), this.db.legalCase.count({ where })]); return { items, total, page: v.page, pageSize: 20 };
  }
  @OfficePermission('cases.write') @Post('cases')
  async createCase(@Req() req: AuthRequest, @Body() body: unknown) {
    const { newClient, clientId: selectedClientId, ...v } = parse(caseInput.extend({ clientId: id.optional(), newClient: z.object({ name, phone: z.union([phone, z.literal('')]).default('') }).strict().optional(), lawyerId: id.nullable().default(null) }).strict().refine(v => Boolean(v.clientId) !== Boolean(v.newClient), 'Select an existing client or enter a new client'), body); const officeId = requireOffice(req.user);
    return this.db.$transaction(async tx => {
      let clientId = selectedClientId;
      if (newClient) {
        const client = await tx.client.create({ data: { ...newClient, officeId } });
        clientId = client.id;
        await audit(tx, req, 'CLIENT_CREATED', client.id);
      } else if (!await tx.client.findFirst({ where: { id: clientId, officeId, archivedAt: null } })) throw new BadRequestException('Select an active office client');
      await eligibleCourt(tx, officeId, v.courtId); const lawyerId = v.lawyerId ?? (req.user.role === 'LAWYER' ? req.user.id : null);
      if (lawyerId) await eligibleUser(tx, officeId, lawyerId, true);
      const item = await tx.legalCase.create({ data: { ...v, clientId: clientId!, lawyerId, officeId, creatorId: req.user.id } });
      await tx.assignmentHistory.create({ data: { officeId, caseId: item.id, newLawyerId: lawyerId, actorId: req.user.id, reason: 'Initial assignment' } });
      await audit(tx, req, 'CASE_CREATED', item.id); return item;
    });
  }
  @OfficePermission('cases.write') @Post('cases/:id')
  async updateCase(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) caseId: string, @Body() body: unknown) {
    const { version, ...v } = parse(caseInput.extend({ version: revision }).strict(), body); const officeId = requireOffice(req.user);
    return this.db.$transaction(async tx => {
      await activeCase(tx, officeId, caseId);
      if (!await tx.client.findFirst({ where: { id: v.clientId, officeId, archivedAt: null } })) throw new BadRequestException('Select an active office client');
      await eligibleCourt(tx, officeId, v.courtId);
      if (!(await tx.legalCase.updateMany({ where: { id: caseId, officeId, version, status: 'ACTIVE' }, data: { ...v, version: { increment: 1 } } })).count) throw new ConflictException('Case changed; reload');
      await audit(tx, req, 'CASE_UPDATED', caseId); return { ok: true };
    });
  }
  @OfficePermission('cases.read') @Get('cases/:id')
  async detail(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) caseId: string) {
    const officeId = requireOffice(req.user);
    const item = await this.db.legalCase.findFirst({ where: { id: caseId, officeId }, include: { ...caseRelations, creator: { select: person }, assignments: { orderBy: { createdAt: 'desc' } }, hearings: { include: { reschedules: true, lawyer: { select: person }, court: { select: { name: true } } }, orderBy: { scheduledAt: 'asc' } }, procedures: { include: { assigned: { select: person } }, orderBy: { dueAt: 'asc' } } } });
    if (!item) throw new NotFoundException();
    const auditEntries = await this.db.audit.findMany({ where: { officeId, targetId: caseId }, orderBy: { createdAt: 'desc' }, take: 100 });
    const userIds = [...new Set([...item.assignments.flatMap(a => [a.previousLawyerId, a.newLawyerId, a.actorId]), ...auditEntries.map(a => a.actorId)].filter((value): value is string => Boolean(value)))];
    const users = await this.db.user.findMany({ where: { officeId, id: { in: userIds } }, select: person }); const names = new Map(users.map(user => [user.id, user.fullName]));
    return { ...item, assignments: item.assignments.map(a => ({ ...a, previousLawyerName: a.previousLawyerId ? names.get(a.previousLawyerId) || 'غير معيّن' : 'غير معيّن', newLawyerName: a.newLawyerId ? names.get(a.newLawyerId) || 'غير معيّن' : 'غير معيّن', actorName: names.get(a.actorId) || 'مستخدم محذوف' })), audit: auditEntries.map(a => ({ ...a, actorName: a.actorId ? names.get(a.actorId) || 'مستخدم محذوف' : 'النظام' })) };
  }
  @OfficePermission('cases.write') @Post('cases/:id/assign')
  async assign(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) caseId: string, @Body() body: unknown) {
    const v = parse(z.object({ lawyerId: id.nullable(), reason: z.string().trim().min(3).max(500), version: revision }).strict(), body); const officeId = requireOffice(req.user);
    return this.db.$transaction(async tx => {
      const item = await activeCase(tx, officeId, caseId); if (v.lawyerId) await eligibleUser(tx, officeId, v.lawyerId, true);
      if (!(await tx.legalCase.updateMany({ where: { id: caseId, officeId, version: v.version, status: 'ACTIVE' }, data: { lawyerId: v.lawyerId, version: { increment: 1 } } })).count) throw new ConflictException('Case changed; reload');
      await tx.assignmentHistory.create({ data: { officeId, caseId, previousLawyerId: item.lawyerId, newLawyerId: v.lawyerId, actorId: req.user.id, reason: v.reason } });
      await audit(tx, req, 'CASE_REASSIGNED', caseId, { previous: item.lawyerId, next: v.lawyerId, reason: v.reason }); return { ok: true };
    });
  }
  @OfficePermission('cases.write') @Post('cases/:id/status')
  async status(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) caseId: string, @Body() body: unknown) {
    const v = parse(z.object({ status: z.enum(['ACTIVE', 'CLOSED', 'ARCHIVED']), reason: z.string().trim().min(3).max(500), version: revision }).strict(), body); const officeId = requireOffice(req.user);
    return this.db.$transaction(async tx => { if (!(await tx.legalCase.updateMany({ where: { id: caseId, officeId, version: v.version }, data: { status: v.status, version: { increment: 1 } } })).count) throw new ConflictException('Case not found or changed'); await audit(tx, req, `CASE_${v.status}`, caseId, { reason: v.reason }); return { ok: true }; });
  }
  @OfficePermission('cases.read') @Get('hearings')
  async hearings(@Req() req: AuthRequest, @Query() query: unknown) {
    const v = parse(pageSchema.extend({ status: z.enum(['SCHEDULED', 'POSTPONED', 'HELD_ACTIVE', 'HELD_COMPLETED']).optional() }), query);
    const where = { officeId: requireOffice(req.user), ...(v.status ? { status: v.status } : {}), case: { internalNumber: { contains: v.search, mode: 'insensitive' as const } } };
    const [items, total] = await this.db.$transaction([this.db.hearing.findMany({ where, include: { case: { select: { internalNumber: true } }, lawyer: { select: person }, court: { select: { name: true } }, reschedules: { orderBy: { createdAt: 'desc' } } }, orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }], skip: (v.page - 1) * 20, take: 20 }), this.db.hearing.count({ where })]); return { items, total, page: v.page, pageSize: 20 };
  }
  @OfficePermission('hearings.manage') @Post('hearings')
  async createHearing(@Req() req: AuthRequest, @Body() body: unknown) {
    const v = parse(z.object({ caseId: id, courtId: id, lawyerId: id, scheduledAt: instant, notes: text }).strict(), body); const officeId = requireOffice(req.user);
    return this.db.$transaction(async tx => { await activeCase(tx, officeId, v.caseId); await eligibleCourt(tx, officeId, v.courtId); await eligibleUser(tx, officeId, v.lawyerId, true); const conflicts = await overlaps(tx, officeId, v.lawyerId, v.scheduledAt); const item = await tx.hearing.create({ data: { ...v, officeId } }); await audit(tx, req, 'HEARING_CREATED', v.caseId, { hearingId: item.id }); return { item, conflicts }; });
  }
  @OfficePermission('hearings.manage') @Post('hearings/:id/postpone')
  async postpone(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) hearingId: string, @Body() body: unknown) {
    const v = parse(z.object({ nextAt: instant.nullable(), reason: z.string().trim().min(3).max(1000), version: revision }).strict(), body); const officeId = requireOffice(req.user);
    return this.db.$transaction(async tx => {
      const item = await tx.hearing.findFirst({ where: { id: hearingId, officeId } }); if (!item) throw new NotFoundException(); await activeCase(tx, officeId, item.caseId);
      if (!(await tx.hearing.updateMany({ where: { id: hearingId, officeId, version: v.version, status: { in: ['SCHEDULED', 'POSTPONED'] } }, data: { status: 'POSTPONED', scheduledAt: v.nextAt, version: { increment: 1 } } })).count) throw new ConflictException('Hearing held or changed; reload');
      await tx.hearingReschedule.create({ data: { officeId, hearingId, previousAt: item.scheduledAt, nextAt: v.nextAt, reason: v.reason, actorId: req.user.id } });
      await audit(tx, req, 'HEARING_POSTPONED', item.caseId, { hearingId, reason: v.reason }); return { ok: true, conflicts: await overlaps(tx, officeId, item.lawyerId, v.nextAt, hearingId) };
    });
  }
  @OfficePermission('hearings.manage') @Post('hearings/:id/complete')
  async complete(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) hearingId: string, @Body() body: unknown) {
    const v = parse(z.object({ status: z.enum(['HELD_ACTIVE', 'HELD_COMPLETED']), outcome: z.string().trim().min(3).max(5000), judicialDecisions: text, notes: text, nextAt: instant.nullable().default(null), version: revision }).strict(), body); const officeId = requireOffice(req.user);
    if (v.status === 'HELD_COMPLETED' && v.nextAt) throw new BadRequestException('A completed case cannot have a next hearing');
    return this.db.$transaction(async tx => {
      const item = await tx.hearing.findFirst({ where: { id: hearingId, officeId } }); if (!item || !item.scheduledAt) throw new NotFoundException('Scheduled hearing not found');
      const caseItem = await activeCase(tx, officeId, item.caseId);
      if (v.nextAt && v.nextAt <= item.scheduledAt) throw new BadRequestException('Next hearing must follow this hearing');
      if (!(await tx.hearing.updateMany({ where: { id: hearingId, officeId, version: v.version, status: { in: ['SCHEDULED', 'POSTPONED'] } }, data: { status: v.status, outcome: v.outcome, judicialDecisions: v.judicialDecisions, notes: v.notes, version: { increment: 1 } } })).count) throw new ConflictException('Hearing held or changed; reload');
      if (v.status === 'HELD_COMPLETED' && !(await tx.legalCase.updateMany({ where: { id: item.caseId, officeId, version: caseItem.version, status: 'ACTIVE' }, data: { status: 'CLOSED', version: { increment: 1 } } })).count) throw new ConflictException('Case changed; reload');
      const conflicts = await overlaps(tx, officeId, item.lawyerId, v.nextAt, hearingId);
      if (v.nextAt) await tx.hearing.create({ data: { officeId, caseId: item.caseId, courtId: item.courtId, lawyerId: item.lawyerId, scheduledAt: v.nextAt } });
      await audit(tx, req, 'HEARING_HELD', item.caseId, { hearingId, status: v.status }); return { ok: true, conflicts };
    });
  }
  @OfficePermission('cases.read') @Get('procedures')
  async procedures(@Req() req: AuthRequest, @Query() query: unknown) {
    const v = parse(pageSchema, query); const where = { officeId: requireOffice(req.user), title: { contains: v.search, mode: 'insensitive' as const } };
    const [items, total] = await this.db.$transaction([this.db.legalProcedure.findMany({ where, include: { assigned: { select: person }, case: { select: { internalNumber: true } } }, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], skip: (v.page - 1) * 20, take: 20 }), this.db.legalProcedure.count({ where })]); return { items, total, page: v.page, pageSize: 20 };
  }
  @OfficePermission('cases.write') @Post('procedures')
  async createProcedure(@Req() req: AuthRequest, @Body() body: unknown) {
    const v = parse(z.object({ caseId: id, title: name, description: text, assignedId: id, dueAt: instant, reminderAt: instant.nullable().default(null), priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).default('NORMAL') }).strict(), body); const officeId = requireOffice(req.user);
    if (v.reminderAt && v.reminderAt > v.dueAt) throw new BadRequestException('Reminder must precede deadline');
    return this.db.$transaction(async tx => { await activeCase(tx, officeId, v.caseId); await eligibleUser(tx, officeId, v.assignedId); const item = await tx.legalProcedure.create({ data: { ...v, officeId } }); await audit(tx, req, 'PROCEDURE_CREATED', v.caseId, { procedureId: item.id }); return item; });
  }
  @OfficePermission('cases.write') @Post('procedures/:id/status')
  async procedureStatus(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) procedureId: string, @Body() body: unknown) {
    const v = parse(z.object({ status: z.enum(['OPEN', 'DONE', 'CANCELLED']), version: revision }).strict(), body); const officeId = requireOffice(req.user);
    return this.db.$transaction(async tx => { const item = await tx.legalProcedure.findFirst({ where: { id: procedureId, officeId } }); if (!item) throw new NotFoundException(); if (!(await tx.legalProcedure.updateMany({ where: { id: procedureId, officeId, version: v.version }, data: { status: v.status, completedAt: v.status === 'DONE' ? new Date() : null, version: { increment: 1 } } })).count) throw new ConflictException('Procedure changed'); await audit(tx, req, 'PROCEDURE_UPDATED', item.caseId, { procedureId, status: v.status }); return { ok: true }; });
  }
  @OfficePermission('cases.read') @Get('dashboard')
  async dashboard(@Req() req: AuthRequest) {
    const officeId = requireOffice(req.user); const now = new Date(); const nextWeek = new Date(now.getTime() + 7 * 86400000);
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0); const tomorrow = new Date(todayStart); tomorrow.setDate(tomorrow.getDate() + 1);
    const [activeCases, closedCases, postponedHearings, completedHearings, overdueProcedures, upcomingHearings, upcomingProcedures, todayTasks, weeklyTasks] = await this.db.$transaction([
      this.db.legalCase.count({ where: { officeId, status: 'ACTIVE' } }), this.db.legalCase.count({ where: { officeId, status: { in: ['CLOSED', 'ARCHIVED'] } } }),
      this.db.hearing.count({ where: { officeId, status: 'POSTPONED' } }), this.db.hearing.count({ where: { officeId, status: { in: ['HELD_ACTIVE', 'HELD_COMPLETED'] } } }),
      this.db.legalProcedure.count({ where: { officeId, status: 'OPEN', dueAt: { lt: now } } }),
      this.db.hearing.findMany({ where: { officeId, status: { in: ['SCHEDULED', 'POSTPONED'] }, scheduledAt: { gte: now, lte: nextWeek }, case: { status: 'ACTIVE' } }, include: { case: { select: { internalNumber: true } }, lawyer: { select: person } }, orderBy: { scheduledAt: 'asc' }, take: 10 }),
      this.db.legalProcedure.findMany({ where: { officeId, status: 'OPEN', dueAt: { lte: nextWeek } }, orderBy: { dueAt: 'asc' }, take: 10 }),
      this.db.workTask.findMany({ where: { officeId, status: 'OPEN', dueAt: { gte: todayStart, lt: tomorrow } }, include: { assigned: { select: person }, case: { select: { internalNumber: true } } }, orderBy: { dueAt: 'asc' }, take: 20 }),
      this.db.workTask.findMany({ where: { officeId, status: 'OPEN', dueAt: { gte: now, lte: nextWeek } }, include: { assigned: { select: person }, case: { select: { internalNumber: true } } }, orderBy: { dueAt: 'asc' }, take: 20 }),
    ]); return { activeCases, closedCases, postponedHearings, completedHearings, overdueProcedures, upcomingHearings, upcomingProcedures, todayTasks, weeklyTasks };
  }
}

import { BadRequestException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Db } from './db';
import { requireOffice } from './policy';
import { AuthRequest, OfficePermission } from './security';
import { pageSchema, parse } from './validation';

const id = z.string().uuid();
const instant = z.string().datetime({ offset: true }).transform(v => new Date(v));
const input = z.object({ caseId: id.nullable().default(null), title: z.string().trim().min(1).max(250), description: z.string().trim().max(5000).default(''), assignedId: id, dueAt: instant, priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).default('NORMAL') }).strict();
const person = { id: true, fullName: true } as const;
function audit(tx: Prisma.TransactionClient, req: AuthRequest, action: string, targetId: string, metadata: Prisma.InputJsonObject = {}) { return tx.audit.create({ data: { officeId: requireOffice(req.user), actorId: req.user.id, action, targetId, metadata } }); }

@ApiTags('Work tasks') @Controller('tasks')
export class TasksController {
  constructor(@Inject(Db) private db: Db) {}

  @OfficePermission('cases.read') @Get()
  async list(@Req() req: AuthRequest, @Query() query: unknown) {
    const v = parse(pageSchema.extend({ status: z.enum(['OPEN', 'DONE', 'CANCELLED', 'ALL']).default('OPEN'), assignedId: id.optional() }), query); const officeId = requireOffice(req.user);
    const where: Prisma.WorkTaskWhereInput = { officeId, ...(v.status === 'ALL' ? {} : { status: v.status }), ...(v.assignedId ? { assignedId: v.assignedId } : {}), OR: [{ title: { contains: v.search, mode: 'insensitive' } }, { case: { internalNumber: { contains: v.search, mode: 'insensitive' } } }] };
    const [items, total] = await this.db.$transaction([this.db.workTask.findMany({ where, include: { assigned: { select: person }, case: { select: { id: true, internalNumber: true } } }, orderBy: [{ dueAt: 'asc' }, { id: 'asc' }], skip: (v.page - 1) * 20, take: 20 }), this.db.workTask.count({ where })]);
    return { items, total, page: v.page, pageSize: 20 };
  }

  @OfficePermission('cases.write') @Post()
  async create(@Req() req: AuthRequest, @Body() body: unknown) {
    const v = parse(input, body); const officeId = requireOffice(req.user);
    return this.db.$transaction(async tx => {
      if (v.caseId && !await tx.legalCase.findFirst({ where: { id: v.caseId, officeId, status: 'ACTIVE' } })) throw new BadRequestException('Select an active office case');
      if (!await tx.user.findFirst({ where: { id: v.assignedId, officeId, status: 'ACTIVE' } })) throw new BadRequestException('Select an active employee in your office');
      const item = await tx.workTask.create({ data: { ...v, officeId, creatorId: req.user.id } });
      await tx.taskHistory.create({ data: { officeId, taskId: item.id, actorId: req.user.id, action: 'CREATED' } });
      await audit(tx, req, 'TASK_CREATED', item.id, { caseId: v.caseId ?? undefined }); return item;
    });
  }

  @OfficePermission('cases.write') @Post(':id')
  async update(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) taskId: string, @Body() body: unknown) {
    const { version, ...v } = parse(input.extend({ version: z.number().int().positive() }).strict(), body); const officeId = requireOffice(req.user);
    return this.db.$transaction(async tx => {
      if (v.caseId && !await tx.legalCase.findFirst({ where: { id: v.caseId, officeId, status: 'ACTIVE' } })) throw new BadRequestException('Select an active office case');
      if (!await tx.user.findFirst({ where: { id: v.assignedId, officeId, status: 'ACTIVE' } })) throw new BadRequestException('Select an active employee in your office');
      if (!(await tx.workTask.updateMany({ where: { id: taskId, officeId, version, status: 'OPEN' }, data: { ...v, version: { increment: 1 } } })).count) throw new ConflictException('Task changed; reload');
      await tx.taskHistory.create({ data: { officeId, taskId, actorId: req.user.id, action: 'UPDATED' } }); await audit(tx, req, 'TASK_UPDATED', taskId); return { ok: true };
    });
  }

  @OfficePermission('cases.read') @Get(':id')
  async detail(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) taskId: string) {
    const item = await this.db.workTask.findFirst({ where: { id: taskId, officeId: requireOffice(req.user) }, include: { assigned: { select: person }, case: { select: { id: true, internalNumber: true } }, history: { orderBy: { createdAt: 'desc' } } } }); if (!item) throw new NotFoundException(); return item;
  }

  @OfficePermission('cases.write') @Post(':id/status')
  async status(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) taskId: string, @Body() body: unknown) {
    const v = parse(z.object({ status: z.enum(['OPEN', 'DONE', 'CANCELLED']), completionNote: z.string().trim().max(2000).default(''), version: z.number().int().positive() }).strict(), body); const officeId = requireOffice(req.user);
    return this.db.$transaction(async tx => {
      const item = await tx.workTask.findFirst({ where: { id: taskId, officeId } }); if (!item) throw new NotFoundException();
      if (!(await tx.workTask.updateMany({ where: { id: taskId, officeId, version: v.version }, data: { status: v.status, completionNote: v.completionNote, completedAt: v.status === 'DONE' ? new Date() : null, version: { increment: 1 } } })).count) throw new ConflictException('Task changed; reload');
      await tx.taskHistory.create({ data: { officeId, taskId, actorId: req.user.id, action: v.status, note: v.completionNote } }); await audit(tx, req, 'TASK_STATUS_UPDATED', taskId, { status: v.status }); return { ok: true };
    });
  }
}

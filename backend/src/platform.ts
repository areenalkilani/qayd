import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { FileCleanup } from './file-cleanup';
import { BadRequestException, UnauthorizedException, Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Db } from './db';
import { AuthRequest, Platform } from './security';
import { pageSchema, parse } from './validation';
import { JsonBody } from './api-docs';

@ApiTags('Platform metadata') @Controller('platform')
export class PlatformController {
  constructor(@Inject(Db) private db: Db, @Inject(FileCleanup) private cleanup: FileCleanup) {}
  @Platform() @Get('offices')
  async offices(@Query() query: unknown) {
    const { page, search, group } = parse(pageSchema.extend({ group: z.enum(['ALL', 'TRIALS', 'SUBSCRIBERS']).default('ALL') }), query);
    const where = { name: { contains: search, mode: 'insensitive' as const }, ...(group === 'TRIALS' ? { trial: { is: null }, subscriptions: { none: {} } } : group === 'SUBSCRIBERS' ? { OR: [{ trial: { isNot: null } }, { subscriptions: { some: {} } }] } : {}) };
    const [items, total] = await this.db.$transaction([
      this.db.office.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: {
        id: true, name: true, status: true, createdAt: true, registration: true, trial: true,
        subscriptions: { orderBy: { expiresAt: 'desc' } },
        users: { where: { role: 'OWNER' }, select: { fullName: true, email: true, phone: true, emailVerifiedAt: true, phoneVerifiedAt: true } },
      } }), this.db.office.count({ where }),
    ]);
    return { items, total, page, pageSize: 20 };
  }
  @Platform() @Post('offices/:id/review')
  @JsonBody({ decision: 'string', note: 'string' }, ['note'])
  async review(@Param('id', ParseUUIDPipe) id: string, @Body() input: unknown, @Req() req: AuthRequest) {
    const v = parse(z.object({ decision: z.enum(['APPROVE', 'REJECT', 'MORE_INFO']), note: z.string().trim().max(2000).default('') }).strict(), input);
    return this.db.$transaction(async tx => {
      // Conditional update serializes concurrent reviewers, so only one can start a trial.
      const result = await tx.office.updateMany({ where: { id, status: { in: ['PENDING_APPROVAL', 'MORE_INFO'] } }, data: { status: v.decision === 'APPROVE' ? 'APPROVED' : v.decision === 'REJECT' ? 'REJECTED' : 'MORE_INFO' } });
      if (!result.count) throw new ConflictException('Office already reviewed or not found');
      const now = new Date();
      await tx.registration.update({ where: { officeId: id }, data: { reviewNote: v.note, reviewedBy: req.user.id, reviewedAt: now } });
      if (v.decision === 'APPROVE') await tx.trial.create({ data: { officeId: id, startsAt: now, expiresAt: new Date(now.getTime() + 7 * 86400000) } });
      await tx.audit.create({ data: { officeId: id, actorId: req.user.id, action: `REGISTRATION_${v.decision}`, targetId: id, metadata: { note: v.note } } });
      return { ok: true };
    });
  }
  @Platform() @Post('offices/:id/subscriptions')
  async subscribe(@Param('id', ParseUUIDPipe) id: string, @Body() input: unknown, @Req() req: AuthRequest) {
    const v = parse(z.object({
      reference: z.string().trim().min(3).max(120),
      amount: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/).refine(v => Number(v) > 0),
      currency: z.enum(['ILS', 'USD', 'JOD']), method: z.enum(['CASH', 'VISA']),
      cardLast4: z.string().regex(/^$|^\d{4}$/).default(''),
      paidAt: z.string().datetime({ offset: true }).refine(v => new Date(v).getTime() <= Date.now() + 60000),
    }).strict().refine(v => v.method === 'VISA' ? /^\d{4}$/.test(v.cardLast4) : !v.cardLast4, 'Visa requires last four digits only'), input);
    return this.db.$transaction(async tx => {
      if (!(await tx.office.updateMany({ where: { id }, data: { updatedAt: new Date(), status: 'APPROVED' } })).count) throw new NotFoundException();
      const last = await tx.subscription.findFirst({ where: { officeId: id }, orderBy: { expiresAt: 'desc' } });
      const now = new Date(); const startsAt = last && last.expiresAt > now ? last.expiresAt : now;
      const expiresAt = new Date(startsAt); expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);
      if (expiresAt.getUTCMonth() !== startsAt.getUTCMonth()) expiresAt.setUTCDate(0);
      const subscription = await tx.subscription.create({ data: { officeId: id, startsAt, expiresAt, reference: v.reference, approvedBy: req.user.id } });
      const paymentId = randomUUID();
      await tx.$executeRaw`INSERT INTO "PlatformPayment" ("id", "officeId", "subscriptionId", "amount", "currency", "method", "reference", "cardLast4", "recordedBy", "paidAt") VALUES (${paymentId}::uuid, ${id}::uuid, ${subscription.id}::uuid, ${v.amount}::numeric, ${v.currency}, ${v.method}, ${v.reference}, ${v.cardLast4}, ${req.user.id}::uuid, ${new Date(v.paidAt)})`;
      await tx.audit.create({ data: { officeId: id, actorId: req.user.id, action: 'SUBSCRIPTION_PAYMENT_RECORDED', targetId: subscription.id, metadata: { paymentId, reference: v.reference, amount: v.amount, currency: v.currency, method: v.method } } });
      return { subscription };
    });
  }
  @Platform() @Get('payments')
  async payments(@Query() query: unknown) {
    const { page, search } = parse(pageSchema, query);
    const pattern = `%${search}%`;
    const [items, count] = await this.db.$transaction([
      this.db.$queryRaw`SELECT p."id", p."amount"::text AS amount, p."currency", p."method", p."reference", p."cardLast4", p."paidAt", o."name" AS "officeName" FROM "PlatformPayment" p JOIN "Office" o ON o.id = p."officeId" WHERE o.name ILIKE ${pattern} OR p.reference ILIKE ${pattern} ORDER BY p."paidAt" DESC, p.id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`,
      this.db.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM "PlatformPayment" p JOIN "Office" o ON o.id = p."officeId" WHERE o.name ILIKE ${pattern} OR p.reference ILIKE ${pattern}`,
    ]);
    return { items, total: Number(count[0].total), page, pageSize: 20 };
  }
  @Platform() @Post('offices/:id/extend-trial')
  async extend(@Param('id', ParseUUIDPipe) id: string, @Body() input: unknown, @Req() req: AuthRequest) {
    const v = parse(z.object({ days: z.number().int().min(1).max(365), reason: z.string().trim().min(3).max(500) }).strict(), input);
    return this.db.$transaction(async tx => {
      if (!(await tx.office.updateMany({ where: { id, status: { in: ['APPROVED', 'SUSPENDED'] }, subscriptions: { none: {} } }, data: { updatedAt: new Date() } })).count) throw new ConflictException('Only trial offices can be extended');
      const trial = await tx.trial.findUnique({ where: { officeId: id } });
      if (!trial) throw new BadRequestException('Approve the trial first');
      const expiresAt = new Date(Math.max(Date.now(), trial.expiresAt.getTime()) + v.days * 86400000);
      await tx.trial.update({ where: { officeId: id }, data: { expiresAt } });
      await tx.audit.create({ data: { officeId: id, actorId: req.user.id, action: 'TRIAL_EXTENDED', targetId: id, metadata: { days: v.days, reason: v.reason, previousExpiry: trial.expiresAt.toISOString(), expiresAt: expiresAt.toISOString() } } });
      return { expiresAt };
    });
  }
  @Platform() @Post('offices/:id/delete')
  async remove(@Param('id', ParseUUIDPipe) id: string, @Body() input: unknown, @Req() req: AuthRequest) {
    const v = parse(z.object({ password: z.string().min(1).max(128), officeName: z.string().min(1).max(160), confirmation: z.literal('DELETE'), acknowledge: z.literal(true) }).strict(), input);
    const admin = await this.db.user.findUnique({ where: { id: req.user.id } });
    if (!admin?.passwordHash || !await argon2.verify(admin.passwordHash, v.password)) throw new UnauthorizedException('Incorrect administrator password');
    await this.db.$transaction(async tx => {
      // Serializes deletion with password reset/disable, and prevents stale credentials authorizing a purge.
      if (!(await tx.user.updateMany({ where: { id: admin.id, status: 'ACTIVE', role: 'SUPER_ADMIN', passwordHash: admin.passwordHash }, data: { updatedAt: new Date() } })).count) throw new UnauthorizedException();
      const offices = await tx.$queryRaw<{ name: string }[]>`SELECT name FROM "Office" WHERE id = ${id}::uuid FOR UPDATE`;
      if (!offices.length) throw new NotFoundException();
      if (offices[0].name !== v.officeName) throw new BadRequestException('Office name confirmation does not match');
      await tx.$executeRaw`SELECT public.purge_office(${id}::uuid, ${admin.id}::uuid)`;
      await tx.audit.create({ data: { actorId: admin.id, action: 'OFFICE_DELETED', targetId: id } });
    }, { timeout: 30000 });
    await this.cleanup.run();
    return { ok: true };
  }
  @Platform() @Post('offices/:id/status')
  @JsonBody({ suspended: 'boolean', reason: 'string' })
  async status(@Param('id', ParseUUIDPipe) id: string, @Body() input: unknown, @Req() req: AuthRequest) {
    const v = parse(z.object({ suspended: z.boolean(), reason: z.string().trim().min(3).max(500) }).strict(), input);
    return this.db.$transaction(async tx => {
      const office = await tx.office.updateMany({ where: { id, status: v.suspended ? 'APPROVED' : 'SUSPENDED' }, data: { status: v.suspended ? 'SUSPENDED' : 'APPROVED' } });
      if (!office.count) throw new NotFoundException('Eligible office not found');
      await tx.audit.create({ data: { officeId: id, actorId: req.user.id, action: v.suspended ? 'OFFICE_SUSPENDED' : 'OFFICE_RESTORED', targetId: id, metadata: { reason: v.reason } } });
      return { ok: true };
    });
  }
  @Platform() @Get('audit')
  async audit(@Query() query: unknown) {
    const { page } = parse(pageSchema, query);
    // Explicit allowlist: platform operators never see office operational audit metadata.
    const where = { action: { in: ['OFFICE_REGISTERED', 'REGISTRATION_APPROVE', 'REGISTRATION_REJECT', 'REGISTRATION_MORE_INFO', 'ANNUAL_SUBSCRIPTION_APPROVED', 'OFFICE_SUSPENDED', 'OFFICE_RESTORED', 'PLATFORM_BOOTSTRAPPED'] } };
    const [items, total] = await this.db.$transaction([this.db.audit.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 }), this.db.audit.count({ where })]);
    return { items, total, page, pageSize: 20 };
  }
}

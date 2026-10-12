import { Body, Controller, Get, Inject, NotFoundException, Post, Req } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Db } from './db';
import { AuthRequest } from './security';
import { access, can } from './policy';
import { parse } from './validation';
interface Item { key: string; title: string; message: string; at: string; read?: boolean }
const titles: Record<string, string> = {
  OFFICE_REGISTERED: 'تم تسجيل طلب المكتب', REGISTRATION_APPROVE: 'تم قبول التجربة',
  REGISTRATION_REJECT: 'لم تتم الموافقة على الطلب', REGISTRATION_MORE_INFO: 'مطلوب معلومات إضافية للطلب',
  TRIAL_EXTENDED: 'تم تمديد التجربة', SUBSCRIPTION_PAYMENT_RECORDED: 'تم تثبيت الاشتراك وتسجيل الدفعة',
  ANNUAL_SUBSCRIPTION_APPROVED: 'تم تفعيل الاشتراك', OFFICE_SUSPENDED: 'تم إيقاف الوصول إلى المكتب', OFFICE_RESTORED: 'تمت إعادة تفعيل المكتب',
};
const statusTitles: Record<string, string> = {
  PENDING_APPROVAL: 'طلبك بانتظار الموافقة', MORE_INFO: 'طلبك يحتاج معلومات إضافية', REJECTED: 'طلب المكتب مرفوض',
  SUSPENDED: 'حساب المكتب موقوف؛ البيانات محفوظة', EXPIRED: 'انتهت مدة الوصول؛ البيانات محفوظة', TRIAL: 'التجربة مفعّلة', SUBSCRIBED: 'الاشتراك مفعّل',
};
@Controller('notifications')
export class NotificationsController {
  constructor(@Inject(Db) private db: Db) {}
  // Authentication is required, but account notifications must remain available without a paid subscription.
  @Get()
  async list(@Req() req: AuthRequest) {
    const items: Item[] = [];
    if (req.user.role === 'SUPER_ADMIN') {
      const offices = await this.db.office.findMany({ where: { status: { in: ['PENDING_APPROVAL', 'MORE_INFO'] } }, select: { id: true, name: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50 });
      items.push(...offices.map(o => ({ key: `request:${o.id}`, title: 'طلب مكتب بانتظار المراجعة', message: o.name, at: o.createdAt.toISOString() })));
    } else if (req.user.officeId) {
      const officeId = req.user.officeId;
      const office = await this.db.office.findUniqueOrThrow({ where: { id: officeId }, include: { trial: true, subscriptions: true } });
      const state = access(office);
      items.push({ key: `state:${officeId}:${state.reason}:${state.expiresAt?.toISOString() || ''}`, title: statusTitles[state.reason] || 'حالة حساب المكتب', message: office.name, at: office.updatedAt.toISOString() });
      const events = await this.db.audit.findMany({ where: { officeId, action: { in: Object.keys(titles) } }, select: { id: true, action: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 50 });
      items.push(...events.map(e => ({ key: `event:${e.id}`, title: titles[e.action], message: office.name, at: e.createdAt.toISOString() })));
      if (can(req.user, 'cases.read') && (process.env.REQUIRE_EMAIL_VERIFICATION !== 'true' || req.user.emailVerifiedAt)) {
        const now = new Date(); const nextWeek = new Date(now.getTime() + 7 * 86400000);
        const owner = req.user.role === 'OWNER';
        const [hearings, procedures] = await Promise.all([
          this.db.hearing.findMany({ where: { officeId, ...(owner ? {} : { lawyerId: req.user.id }), case: { status: 'ACTIVE' }, status: { in: ['SCHEDULED', 'POSTPONED'] }, scheduledAt: { gte: now, lte: nextWeek } }, include: { case: { select: { internalNumber: true } } }, orderBy: { scheduledAt: 'asc' }, take: 20 }),
          this.db.legalProcedure.findMany({ where: { officeId, ...(owner ? {} : { assignedId: req.user.id }), case: { status: 'ACTIVE' }, status: 'OPEN', OR: [{ dueAt: { lte: nextWeek } }, { reminderAt: { lte: now } }] }, select: { id: true, title: true, dueAt: true }, orderBy: { dueAt: 'asc' }, take: 20 }),
        ]);
        items.push(...hearings.map(h => ({ key: `hearing:${h.id}:${h.scheduledAt!.toISOString()}`, title: 'جلسة قادمة', message: `القضية ${h.case.internalNumber}`, at: h.scheduledAt!.toISOString() })));
        items.push(...procedures.map(p => ({ key: `procedure:${p.id}:${p.dueAt.toISOString()}:${p.dueAt < now ? 'overdue' : 'upcoming'}`, title: p.dueAt < now ? 'إجراء تجاوز موعده' : 'تذكير بإجراء', message: p.title, at: p.dueAt.toISOString() })));
      }
    }
    if (!items.length) return { items: [], unread: 0 };
    const reads = await this.db.$queryRaw<{ key: string }[]>(Prisma.sql`SELECT "key" FROM "NotificationRead" WHERE "userId" = ${req.user.id}::uuid AND "key" IN (${Prisma.join(items.map(i => i.key))})`);
    const seen = new Set(reads.map(r => r.key));
    const result = items.map(i => ({ ...i, read: seen.has(i.key) })).sort((a, b) => Number(a.read) - Number(b.read) || b.at.localeCompare(a.at));
    return { items: result, unread: result.filter(i => !i.read).length };
  }
  @Post('read')
  async read(@Req() req: AuthRequest, @Body() body: unknown) {
    const { key } = parse(z.object({ key: z.string().min(1).max(250) }).strict(), body);
    const visible = await this.list(req);
    if (!visible.items.some(i => i.key === key)) throw new NotFoundException();
    await this.db.$executeRaw`INSERT INTO "NotificationRead" ("userId", "key") VALUES (${req.user.id}::uuid, ${key}) ON CONFLICT DO NOTHING`;
    return { ok: true };
  }
}

import { Body, Controller, Get, Inject, Post, Req } from '@nestjs/common';
import { z } from 'zod';
import { Db } from './db';
import { AuthRequest, Platform, Public } from './security';
import { parse } from './validation';
const optionalEmail = z.union([z.literal(''), z.string().trim().email().max(254)]);
const phone = z.string().trim().max(30).refine(v => !v || /^\+?[0-9 ()-]{6,30}$/.test(v), 'Enter a valid phone number');
const social = (domains: string[]) => z.string().trim().max(500).refine(v => {
  if (!v) return true;
  try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password && domains.some(d => u.hostname === d || u.hostname.endsWith(`.${d}`)); } catch { return false; }
}, 'Enter a valid HTTPS social profile URL');
const schema = z.object({ email: optionalEmail, phone, whatsapp: phone, facebook: social(['facebook.com', 'fb.com']), instagram: social(['instagram.com']) }).strict();
@Controller('contact')
export class ContactController {
  constructor(@Inject(Db) private db: Db) {}
  @Public() @Get()
  async get() {
    const rows = await this.db.$queryRaw<{ data: z.infer<typeof schema> }[]>`SELECT "data" FROM "PlatformContact" WHERE "id" = 1`;
    return rows[0]?.data || { email: '', phone: '', whatsapp: '', facebook: '', instagram: '' };
  }
  @Platform() @Post()
  async save(@Body() input: unknown, @Req() req: AuthRequest) {
    const data = parse(schema, input);
    await this.db.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "PlatformContact" ("id", "data") VALUES (1, ${JSON.stringify(data)}::jsonb) ON CONFLICT ("id") DO UPDATE SET "data" = EXCLUDED."data"`;
      await tx.audit.create({ data: { actorId: req.user.id, action: 'PLATFORM_CONTACT_UPDATED', targetId: 'platform-contact' } });
    });
    return data;
  }
}

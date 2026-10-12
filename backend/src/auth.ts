import { Body, ConflictException, Controller, Get, Inject, Injectable, Post, Req, Res, UnauthorizedException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Prisma, TokenKind } from '@prisma/client';
import { Response } from 'express';
import * as argon2 from 'argon2';
import { z } from 'zod';
import { Db } from './db';
import { Mail } from './mail';
import { readConfig } from './config';
import { AuthRequest, cookieName, digest, newToken, Public, publicUser } from './security';
import { email, loginSchema, name, parse, password, phone, registerSchema, tokenSchema } from './validation';
import { access } from './policy';
import { JsonBody } from './api-docs';
export const hashPassword = (value: string) => argon2.hash(value, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
@Injectable()
export class AuthService {
  constructor(@Inject(Db) readonly db: Db, @Inject(Mail) readonly mail: Mail) {}
  async sendToken(userId: string, address: string, kind: TokenKind) {
    const token = newToken();
    await this.db.$transaction(async tx => {
      await tx.actionToken.deleteMany({ where: { userId, kind } });
      await tx.actionToken.create({ data: { userId, kind, tokenHash: digest(token), expiresAt: new Date(Date.now() + 3600000) } });
    });
    try { await this.mail.sendLink(address, kind === 'RESET' ? 'reset' : kind === 'INVITE' ? 'invite' : 'verify', token); }
    catch (e) { await this.db.actionToken.deleteMany({ where: { tokenHash: digest(token) } }); throw e; }
  }
}
@ApiTags('Identity') @Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private service: AuthService) {}
  @Public() @Post('register') @ApiOperation({ summary: 'Register in PENDING_APPROVAL; no automatic trial' })
  @JsonBody({ officeName: 'string', fullName: 'string', email: 'string', phone: 'string', password: 'string', confirmPassword: 'string' })
  async register(@Body() input: unknown) {
    const v = parse(registerSchema, input); const passwordHash = await hashPassword(v.password);
    let user;
    try {
      user = await this.service.db.$transaction(async tx => {
        const office = await tx.office.create({ data: { name: v.officeName, registration: { create: {} } } });
        const u = await tx.user.create({ data: { officeId: office.id, email: v.email, fullName: v.fullName, phone: v.phone, passwordHash, role: 'OWNER' } });
        await tx.audit.create({ data: { officeId: office.id, actorId: u.id, action: 'OFFICE_REGISTERED', targetId: office.id } });
        return u;
      });
    } catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Email already registered'); throw e; }
    let emailDelivery = 'NOT_CONFIGURED';
    if (this.service.mail.configured()) {
      try { await this.service.sendToken(user.id, user.email, 'VERIFY_EMAIL'); emailDelivery = 'SENT'; }
      catch { emailDelivery = 'FAILED_RETRY_FROM_ACCOUNT'; }
    }
    return { status: 'PENDING_APPROVAL', emailDelivery, phoneVerified: false };
  }
  @Public() @Post('login')
  @JsonBody({ email: 'string', password: 'string' })
  async login(@Body() input: unknown, @Res({ passthrough: true }) res: Response) {
    const v = parse(loginSchema, input); const user = await this.service.db.user.findUnique({ where: { email: v.email } });
    const valid = user?.passwordHash ? await argon2.verify(user.passwordHash, v.password) : (await hashPassword(v.password), false);
    if (!valid || !user || user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid email or password');
    const token = newToken(); const c = readConfig(); const expiresAt = new Date(Date.now() + c.SESSION_HOURS * 3600000);
    await this.service.db.$transaction(async tx => {
      if (!(await tx.user.updateMany({ where: { id: user.id, status: 'ACTIVE', passwordHash: user.passwordHash }, data: { updatedAt: new Date() } })).count) throw new UnauthorizedException('Account changed; sign in again');
      await tx.session.create({ data: { userId: user.id, tokenHash: digest(token), expiresAt } });
      await tx.audit.create({ data: { officeId: user.officeId, actorId: user.id, action: 'LOGIN', targetId: user.id } });
    });
    res.cookie(cookieName(), token, { httpOnly: true, secure: c.NODE_ENV === 'production', sameSite: 'strict', path: '/', expires: expiresAt });
    return { user: publicUser(user) };
  }
  @Get('me')
  async me(@Req() req: AuthRequest) {
    const office = req.user.officeId ? await this.service.db.office.findUnique({ where: { id: req.user.officeId }, include: { trial: true, subscriptions: { orderBy: { expiresAt: 'desc' } }, registration: true } }) : null;
    return { user: publicUser(req.user), office, access: office ? access(office) : null, emailConfigured: this.service.mail.configured(), requireEmailVerification: readConfig().REQUIRE_EMAIL_VERIFICATION === 'true' };
  }
  @Post('logout')
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.service.db.session.deleteMany({ where: { id: req.sessionId } });
    res.clearCookie(cookieName(), { httpOnly: true, secure: readConfig().NODE_ENV === 'production', sameSite: 'strict', path: '/' });
    return { ok: true };
  }
  @Public() @Post('forgot-password')
  @JsonBody({ email: 'string' })
  async forgot(@Body() input: unknown) {
    const v = parse(z.object({ email }).strict(), input);
    if (!this.service.mail.configured()) throw new ServiceUnavailableException('Password reset email is not configured');
    const user = await this.service.db.user.findUnique({ where: { email: v.email } });
    if (user?.status === 'ACTIVE') { try { await this.service.sendToken(user.id, user.email, 'RESET'); } catch { /* identical response prevents enumeration */ } }
    return { message: 'If the account exists, a reset link has been requested' };
  }
  @Public() @Post('reset-password')
  @JsonBody({ token: 'string', password: 'string' })
  async reset(@Body() input: unknown) { return this.consumePassword(input, 'RESET'); }
  @Public() @Post('activate')
  @JsonBody({ token: 'string', password: 'string' })
  async activate(@Body() input: unknown) { return this.consumePassword(input, 'INVITE'); }
  private async consumePassword(input: unknown, kind: 'RESET' | 'INVITE') {
    const v = parse(tokenSchema, input); const passwordHash = await hashPassword(v.password);
    return this.service.db.$transaction(async tx => {
      const token = await tx.actionToken.findUnique({ where: { tokenHash: digest(v.token) }, include: { user: true } });
      if (!token || token.kind !== kind || token.expiresAt <= new Date() || token.user.status === 'DISABLED' || (kind === 'INVITE' && token.user.status !== 'INVITED')) throw new BadRequestException('Invalid or expired link');
      if (!(await tx.actionToken.deleteMany({ where: { id: token.id } })).count) throw new BadRequestException('Link already used');
      if (!(await tx.user.updateMany({ where: { id: token.userId, status: kind === 'INVITE' ? 'INVITED' : 'ACTIVE' }, data: { passwordHash, status: 'ACTIVE', ...(kind === 'INVITE' ? { emailVerifiedAt: new Date() } : {}) } })).count) throw new BadRequestException('Account is no longer eligible');
      await tx.session.deleteMany({ where: { userId: token.userId } });
      await tx.actionToken.deleteMany({ where: { userId: token.userId, kind } });
      await tx.audit.create({ data: { officeId: token.user.officeId, actorId: token.userId, action: kind === 'INVITE' ? 'ACCOUNT_ACTIVATED' : 'PASSWORD_RESET', targetId: token.userId } });
      return { ok: true };
    });
  }
  @Post('verification-email')
  async verification(@Req() req: AuthRequest) {
    if (!req.user.emailVerifiedAt) await this.service.sendToken(req.user.id, req.user.email, 'VERIFY_EMAIL');
    return { ok: true };
  }
  @Public() @Post('verify-email')
  @JsonBody({ token: 'string' })
  async verify(@Body() input: unknown) {
    const v = parse(z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), input);
    return this.service.db.$transaction(async tx => {
      const token = await tx.actionToken.findUnique({ where: { tokenHash: digest(v.token) } });
      if (!token || token.kind !== 'VERIFY_EMAIL' || token.expiresAt <= new Date()) throw new BadRequestException('Invalid or expired link');
      if (!(await tx.actionToken.deleteMany({ where: { id: token.id } })).count) throw new BadRequestException('Link already used');
      const user = await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date() } });
      await tx.audit.create({ data: { officeId: user.officeId, actorId: user.id, action: 'EMAIL_VERIFIED', targetId: user.id } });
      return { ok: true };
    });
  }
  @Post('change-password')
  @JsonBody({ currentPassword: 'string', password: 'string' })
  async change(@Req() req: AuthRequest, @Body() input: unknown) {
    const v = parse(z.object({ currentPassword: z.string().max(128), password }).strict(), input);
    if (!req.user.passwordHash || !await argon2.verify(req.user.passwordHash, v.currentPassword)) throw new UnauthorizedException('Incorrect password');
    const passwordHash = await hashPassword(v.password);
    await this.service.db.$transaction(async tx => {
      if (!(await tx.user.updateMany({ where: { id: req.user.id, passwordHash: req.user.passwordHash }, data: { passwordHash } })).count) throw new ConflictException('Account changed; sign in again');
      await tx.session.deleteMany({ where: { userId: req.user.id } });
      await tx.actionToken.deleteMany({ where: { userId: req.user.id } });
      await tx.audit.create({ data: { officeId: req.user.officeId, actorId: req.user.id, action: 'PASSWORD_CHANGED', targetId: req.user.id } });
    });
    return { ok: true, loginRequired: true };
  }
  @Post('profile')
  @JsonBody({ fullName: 'string', phone: 'string' })
  async profile(@Req() req: AuthRequest, @Body() input: unknown) {
    const v = parse(z.object({ fullName: name, phone }).strict(), input);
    return this.service.db.$transaction(async tx => {
      const user = await tx.user.update({ where: { id: req.user.id }, data: { ...v, ...(v.phone !== req.user.phone ? { phoneVerifiedAt: null } : {}) } });
      await tx.audit.create({ data: { officeId: req.user.officeId, actorId: req.user.id, action: 'PROFILE_UPDATED', targetId: req.user.id } });
      return { user: publicUser(user) };
    });
  }
}

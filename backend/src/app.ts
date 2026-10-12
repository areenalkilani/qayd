import { NotificationsController } from './notifications';
import { TasksController } from './tasks';
import { FinanceController } from './finance';
import { MessagesController } from './messages';
import { FileCleanup } from './file-cleanup';
import 'reflect-metadata';
import { ArgumentsHost, Catch, Controller, ExceptionFilter, Get, HttpException, Inject, Module, ServiceUnavailableException } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { Db } from './db';
import { AuthController, AuthService } from './auth';
import { AuthGuard, Public } from './security';
import { PlatformController } from './platform';
import { OfficeController } from './office';
import { Mail } from './mail';
import { readConfig } from './config';
import { LegalController } from './legal';
import { FilesController } from './files';
import { ContactController } from './contact';
import { LocalPrivateStorage, PrivateStorage } from './storage';

@Controller('health')
class HealthController {
  constructor(@Inject(Db) private db: Db) {}
  @Public() @Get('live') live() { return { status: 'ok' }; }
  @Public() @Get('ready') async ready() {
    try { await this.db.$queryRaw`SELECT 1`; return { status: 'ok' }; }
    catch { throw new ServiceUnavailableException('Database unavailable'); }
  }
}
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    let status = 500; let detail: unknown = 'Internal server error';
    if (error instanceof HttpException) { status = error.getStatus(); detail = error.getResponse(); }
    else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') { status = 409; detail = 'Record already exists'; }
      if (error.code === 'P2025') { status = 404; detail = 'Record not found'; }
      if (error.code === 'P2034') { status = 409; detail = 'Concurrent change; retry'; }
    }
    // Never log request bodies, session cookies, tokens, SQL parameters or error messages containing data.
    if (status === 500) process.stderr.write(JSON.stringify({ level: 'error', event: 'request_failed', requestId: res.locals.requestId, type: error instanceof Error ? error.name : 'UnknownError' }) + '\n');
    res.status(status).json({ error: detail, requestId: res.locals.requestId });
  }
}
@Module({ controllers: [HealthController, AuthController, PlatformController, OfficeController, LegalController, FilesController, ContactController, NotificationsController, TasksController, FinanceController, MessagesController], providers: [Db, Mail, AuthService, FileCleanup, { provide: PrivateStorage, useClass: LocalPrivateStorage }, { provide: APP_GUARD, useClass: AuthGuard }] })
class AppModule {}

export async function createApp() {
  const config = readConfig();
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'], bodyParser: true });
  app.setGlobalPrefix('api');
  // Exactly one private reverse proxy in production; never trust arbitrary forwarded headers in development.
  if (config.NODE_ENV === 'production') app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet(), cookieParser());
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.requestId = randomUUID(); res.setHeader('X-Request-Id', res.locals.requestId);
    res.setHeader('Cache-Control', 'no-store');
    const started = Date.now();
    res.on('finish', () => process.stdout.write(JSON.stringify({ event: 'http', requestId: res.locals.requestId, method: req.method, status: res.statusCode, durationMs: Date.now() - started }) + '\n'));
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.headers.origin !== config.APP_ORIGIN) return res.status(403).json({ error: 'Invalid request origin' });
      const upload = /^\/api\/files\/cases\/[a-f0-9-]{36}$/i.test(req.path) && req.is('multipart/form-data');
      if (!req.is('application/json') && !upload) return res.status(415).json({ error: 'JSON required, or multipart at the file upload endpoint' });
    }
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false }));
  const authLimit = rateLimit({ windowMs: 15 * 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts; try again later' } });
  app.use(['/api/auth/login', '/api/auth/register', '/api/auth/forgot-password', '/api/auth/reset-password', '/api/auth/activate', '/api/auth/verification-email', '/api/auth/verify-email'], authLimit);
  app.use(/^\/api\/platform\/offices\/[a-f0-9-]{36}\/delete$/, rateLimit({ windowMs: 900000, limit: 10 }));
  app.useGlobalFilters(new Errors());
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Qayd API').setVersion('0.1.0').setDescription('Phase 1–2 identity and SaaS. Cookie session; mutations require APP_ORIGIN and application/json. Office context is derived from session.').addCookieAuth(config.NODE_ENV === 'production' ? '__Host-qayd_session' : 'qayd_session').build());
  SwaggerModule.setup('api/docs', app, document);
  app.enableShutdownHooks();
  await app.init();
  return app;
}

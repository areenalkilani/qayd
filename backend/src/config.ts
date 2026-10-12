import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

for (const envPath of [resolve(process.cwd(), '..', '.env'), resolve(process.cwd(), '.env')]) {
  loadEnv({ path: envPath });
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().refine(value => /^postgres(?:ql)?:\/\//.test(value), { message: 'DATABASE_URL must be a Postgres connection string' }),
  APP_ORIGIN: z.string().url(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  SESSION_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  SMTP_HOST: z.string().optional(), SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(), SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.preprocess(v => v === '' ? undefined : v, z.string().email().optional()),
  REQUIRE_EMAIL_VERIFICATION: z.enum(['true', 'false']).default('false'),
});
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) throw new Error(`Invalid configuration fields: ${result.error.issues.map(x => x.path.join('.')).join(', ')}`);
  const c = result.data;
  if (new URL(c.APP_ORIGIN).origin !== c.APP_ORIGIN) throw new Error('APP_ORIGIN must be an origin without a path or trailing slash');
  if (c.NODE_ENV === 'production' && !c.APP_ORIGIN.startsWith('https://')) throw new Error('Production requires HTTPS');
  if (c.REQUIRE_EMAIL_VERIFICATION === 'true' && (!c.SMTP_HOST || !c.MAIL_FROM)) throw new Error('Email verification requires SMTP');
  return c;
}
export type Config = ReturnType<typeof readConfig>;

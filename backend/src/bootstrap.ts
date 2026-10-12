import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hashPassword } from './auth';
import { email, name, password, phone } from './validation';

async function main() {
  if (process.stdin.isTTY) throw new Error('Provide a JSON object on stdin; do not put passwords in command arguments');
  let input = ''; for await (const chunk of process.stdin) { input += chunk; if (input.length > 4096) throw new Error('Input too long'); }
  const v = z.object({ email, fullName: name, phone, password }).strict().parse(JSON.parse(input));
  const db = new PrismaClient();
  try {
    const passwordHash = await hashPassword(v.password);
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(719204)`;
      if (await tx.user.count({ where: { role: 'SUPER_ADMIN' } })) throw new Error('A platform admin already exists');
      const user = await tx.user.create({ data: { email: v.email, fullName: v.fullName, phone: v.phone, passwordHash, role: 'SUPER_ADMIN' } });
      await tx.audit.create({ data: { actorId: user.id, action: 'PLATFORM_BOOTSTRAPPED', targetId: user.id } });
    });
    process.stdout.write('Platform administrator created.\n');
  } finally { await db.$disconnect(); }
}
main().catch(() => { process.stderr.write('Bootstrap failed: check input, database, and whether an admin already exists. No credentials logged.\n'); process.exitCode = 1; });

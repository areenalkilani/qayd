import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Db } from './db';
import { PrivateStorage } from './storage';
@Injectable()
export class FileCleanup implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(@Inject(Db) private db: Db, @Inject(PrivateStorage) private storage: PrivateStorage) {}
  onModuleInit() { this.timer = setInterval(() => { void this.run(); }, 30000); this.timer.unref(); void this.run(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const files = await this.db.$queryRaw<{ storageKey: string }[]>`SELECT "storageKey" FROM "FileDeletion" ORDER BY "createdAt" LIMIT 100`;
      for (const file of files) {
        try { await this.storage.remove(file.storageKey); await this.db.$executeRaw`DELETE FROM "FileDeletion" WHERE "storageKey" = ${file.storageKey}`; }
        catch { process.stderr.write('Private file cleanup pending; retry scheduled.\n'); }
      }
    } catch { process.stderr.write('File cleanup unavailable; retry scheduled.\n'); }
    finally { this.running = false; }
  }
}

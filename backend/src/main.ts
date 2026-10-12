import { createApp } from './app';
import { readConfig } from './config';
async function main() { const app = await createApp(); await app.listen(readConfig().PORT, '0.0.0.0'); }
main().catch(() => { process.stderr.write('API startup failed; verify configuration and database connectivity.\n'); process.exitCode = 1; });

# Qayd deployment and operations

## Scope

This checkpoint implements identity, SaaS control and core legal operations (phases 1–3). Finance and remaining office operations are incomplete. Do not market this checkpoint as a complete production law-office system. No Vultr deployment has been performed. Node 24 LTS is the container target. Docker is not installed on the development host, so container execution must be verified on staging.

## Local development

1. Use Node 24 and npm. Run `npm ci` and `npm ci --prefix backend`. npm lockfiles are authoritative for Docker; the original pnpm lock remains a prototype artifact.
2. Create a PostgreSQL database, copy `backend/.env.example` to `backend/.env`, and set credentials and the exact frontend origin (no trailing slash).
3. From `backend`: `npm run generate`, `npm run migrate`, `npm run build`, then `node --env-file=.env dist/main.js`. Prisma loads `.env` for migrations; the Node command explicitly loads it for runtime.
4. Use the existing Vite server on 8443. `/api` proxies to port 3000; change `API_PROXY_TARGET` only for development. Production uses relative same-origin URLs.
5. SMTP is required for invitations and password recovery. With no provider these actions fail honestly. Registration remains possible, phones are unverified, and verification emails can be retried from settings. Set `REQUIRE_EMAIL_VERIFICATION=true` only after SMTP is configured.
6. Tests: `npm run typecheck`, `npm run build`, `npm run build --prefix backend`, `npm test --prefix backend`. For real PostgreSQL tests, use a disposable database named `qayd_test`, set `DATABASE_URL`, apply migrations and run `npm run test:integration --prefix backend`. Windows with PostgreSQL 17 can use `scripts/test-local-postgres.ps1`; it creates an isolated loopback cluster, uses random credentials under ignored `.local-test`, and stops it afterward. Never point tests at office data.

## Vultr Ubuntu

Provision an Ubuntu VPS with Docker Engine and Compose v2, DNS A/AAAA records for the domain, and inbound ports 22 (restricted), 80 and 443. PostgreSQL and the API have no published host ports. Keep `.env` mode 600 and never commit it.

Copy `.env.example` to `.env`. Generate independent URL-safe hex passwords with `openssl rand -hex 32`; fill domain and TLS contact. Configure real SMTP before employee invitations. Set email verification policy explicitly.

Run `docker compose build`, then `docker compose up -d`. The database initializes separate migration and runtime roles; the migration container must finish before the API starts. Caddy obtains HTTPS certificates. Check `docker compose ps`, `docker compose logs --tail=100 api migrate`, and `/api/health/ready` over HTTPS. Open `/api/docs` for the generated OpenAPI routes (browser Swagger interaction is intended for local development; production CSP is restrictive).

The runtime database role cannot create roles or databases and is not a superuser. Default grants let it operate application tables; migrations additionally make audit rows append-only. Migrations use their own credentials. Do not reuse PostgreSQL administrator credentials in the API.

## First platform administrator

Bootstrap accepts JSON on stdin, never a password argument. On a trusted administrator machine, create a mode-600 temporary JSON file outside the checkout with `email`, `fullName`, `phone` (international format), and a unique password of at least 12 characters. Pipe it to:

```sh
docker compose exec -T api node dist/bootstrap.js < /secure/path/admin.json
```

Delete the temporary secret securely according to your local storage policy. Bootstrap is protected by a database advisory lock and refuses to create another initial admin. No seeded passwords or authentication bypasses exist. Sign in through the regular UI to review office registrations. Approval starts exactly seven days; registration alone grants no trial. Annual subscription approval is administrative metadata, not payment collection.

## Backup, restore, updates

Run `sh scripts/backup.sh` daily from the project directory; encrypt and copy backups to independent storage. The script requires a running API, stops it while capturing both database and private files, and restarts it on completion or failure. Schedule this brief service interruption during a maintenance window and avoid concurrent migrations or other database writers. Only pairs without `.partial` suffixes are complete backups. Backups contain confidential data. Retention and off-site monitoring must be configured by the operator. Restore drills on staging are required before production use.

Restore is explicitly destructive: back up current state, verify the selected files, then run `CONFIRM_RESTORE=TIMESTAMP sh scripts/restore.sh TIMESTAMP`. It stops web/API, restores database and files and starts services. Private attachments are active. Stop API writes while taking coordinated database/file backups, so a backup cannot contain a database row without its file.

Before updates: back up, record the current commit and image IDs, test migrations on a restored staging database, build images, run `docker compose run --rm migrate`, then `docker compose up -d --build api web`. Check readiness and registration/login smoke tests. For code rollback use the previous images only when schema-compatible; otherwise restore the matching backup during maintenance. Never run `docker compose down -v` on production.

Logs rotate at 10 MB × 3 per service. API logs record request ID, status and timing, not payloads, cookies, tokens or SQL values. Rate limiting uses process-local storage and assumes one API replica; a shared store is required before horizontal scaling. No payment gateway, SMS verification, object-storage integration or automatic Al-Mizan filing is claimed.

## Windows local login

With PostgreSQL 17 installed, run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1`. This starts a persistent, separate development database on loopback port 55439, applies migrations, builds and starts API on port 3000. The existing Vite server remains on port 8443. Open `http://localhost:8443`; the configured origin must match exactly. For another preview origin pass `-AppOrigin https://your-preview-host` and restart the API to apply that change. Keep `.local-dev` private and excluded from source control; it contains local database credentials and persistent application data. This is development setup only. Registration creates a real pending office; platform approval is still required for office operations. Prototype sample credentials are not seeded accounts.

## Platform subscriptions and deletion

Apply migration 007 before starting the new API. Platform payments record external cash/Visa receipts; they do not charge cards. Retain the payment reference and last four digits only. Trial approval grants seven days; explicit audited extension can add days. Expiry and suspension never delete office data.

Whole-office deletion is permanent in the live database and removes associated payments and operational records. It requires the administrator password and explicit office-name/DELETE/acknowledgement confirmations. `purge_office` is a narrowly scoped SECURITY DEFINER function, executable only by the migration owner and the configured runtime role; ordinary runtime audit modifications remain prohibited. Private file keys enter `FileDeletion` in the same transaction and are retried every 30 seconds after database removal, including after restarts. Monitor cleanup errors and the queue. Old backups may still contain deleted accounts until backup retention expires; restore procedures must account for deletions performed after the backup. Do not run smoke scripts that create accounts against qayd_local; use scripts/test-local-postgres.ps1 with qayd_test.

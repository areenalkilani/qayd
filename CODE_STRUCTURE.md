# Qayd code map

## Frontend

- `src/App.tsx`: session, registration/login, permissions, employee management and settings.
- `src/PublicSite.tsx`: public landing page and its illustrative preview.
- `src/AppShell.tsx`: sidebar, top bar and desktop/mobile navigation.
- `src/components/UI.tsx`: shared buttons, fields, icons, brand, badges, page headings and accessible modal.
- `src/navigation.ts`: office module titles and descriptions.
- `src/PlatformWorkspace.tsx`: platform subscribers, trial requests, payments and protected deletion.
- `src/LegalWorkspace.tsx`: office clients, courts, cases, hearings and procedures.
- `src/FilePanel.tsx`: private attachment UI.
- `src/Contact.tsx`: saved public contact links and platform contact settings.
- `src/PhoneLinks.tsx`, `src/PasswordInput.tsx`: shared contact actions and password visibility.
- `src/api.ts`: same-origin API client and response types.
- `src/index.css`: theme, shared layouts and responsive styles.

The unused prototype application and its fake office/admin forms have been removed. The landing page retains its existing illustrative design; operational screens load database records only.

## Backend and data

`backend/src` contains NestJS controllers and services. `backend/prisma/schema.prisma` describes the database; applied migrations must remain immutable. Platform account operations live in `platform.ts`, contact settings in `contact.ts`, and private-file cleanup in `file-cleanup.ts`.

Use `scripts/start-local.ps1` for the persistent development service. `.local-dev` contains private local data and is not source code; do not delete it as source cleanup. Read `DEPLOYMENT.md` for deployment and backups.

## Validation

Run `npm run typecheck` and `npm run build`. TypeScript rejects unused local declarations and parameters. `npm run lint` checks formatting of `App.tsx` and `api.ts`.

Backend: `npm run build --prefix backend` and `npm test --prefix backend`. Full database/browser verification: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-local-postgres.ps1 -Browser`. This uses the separate `qayd_test` database; never create test accounts in `qayd_local`.

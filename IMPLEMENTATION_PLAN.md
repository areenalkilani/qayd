# Qayd implementation plan

## Existing architecture and inventory

React 19 / TypeScript / Vite 8 / Tailwind 4. `src/App.tsx` contains the whole prototype; `src/index.css` owns the navy/gold branding, Arabic fonts, RTL and responsive layouts. Navigation is component state. No database, API or authentication existed.

- PublicSite: anchors, mobile navigation, hero, features, workflow, privacy, pricing, FAQ, footer. DashboardPreview is marketing illustration.
- AppShell: office/admin navigation, search, static identity/notifications, unrestricted demo role switch.
- OfficeDashboard: sample counts, charts, trial, hearings, procedures and activity.
- CasesPage: local `cases` array, local search, static filters/pagination/export.
- EmployeesPage: sample employees, role/search fields, employee modal.
- ModulePage: hearings, postponed hearings, courts, clients, attachments, deadlines, filings, calendar, audit, messages, finance, receipts, archive, reports, settings; sample rows and demo toasts.
- AdminDashboard, TrialsPage, AdminModule: sample office/subscription data and local-state approvals.
- TrialFlow: registration, fake OTP and pending confirmation. EmployeeModal, CaseModal, HearingModal, PaymentModal, FilingModal: unsaved forms.
- Notifications: hardcoded entries. Shared UI primitives retained.

## Architecture and phases

Preserve the frontend and theme. Add a NestJS REST backend with PostgreSQL/Prisma migrations. Use same-origin HttpOnly opaque sessions, Argon2id, Origin/JSON checks, database-derived office context, explicit permissions and transactional audit records. Super admins see SaaS metadata, never office confidential data. Deploy with Node 24 LTS, private PostgreSQL and Caddy HTTPS.

- [x] Inspect repository before edits and inventory mock workflows.
- [x] Phase 1 implementation: backend, environment, migrations, health, OpenAPI, Docker configuration (container execution remains unverified).
- [x] Phase 2: registration/authentication, account recovery, employees, permissions, trials, subscriptions and frontend integration; API and browser tests passed.
- [x] Phase 3 core: clients/courts/cases/assignments/hearings/deadlines, with PostgreSQL isolation and browser persistence tests. Financial links and attachments remain in later phases.
- [ ] Phase 4: private attachments, hearing reports, notifications, messages, Al-Mizan requests.
- [ ] Phase 5: decimal finance, receipts, reporting, authorized exports.
- [ ] Phase 6: complete security/E2E checks and verified Vultr deployment/restore drills.

Complete and verify phases 1–2 before proceeding to later phases. Preserve prototype components as source references; unimplemented production pages must not display mock operational records.

## Recovery checkpoint

Initial npm installations failed with ENOSPC. Truncated files have been restored, dependencies installed, and PostgreSQL 17 is now used for isolated real integration tests. No workspace `.git` directory was found; do not reset or clean the parent repository. Production targets Node 24; host Node is 20.19.6. Docker CLI is absent.

## Verified identity checkpoint

The original UI is retained in `src/Prototype.tsx`; `src/App.tsx` uses its public page, shell and form components with API-backed identity/administration. Unimplemented operational pages are clearly unavailable, with no mock records presented as persisted data. `src/api.ts` uses same-origin cookies. `backend/src` implements NestJS identity, office employee access, platform approvals/subscriptions and audit endpoints. Three migrations enforce identity constraints and UTC trial duration. Docker/Caddy, private volumes, least-privilege role initialization, bootstrap, backup/restore scripts and instructions are in `DEPLOYMENT.md`.

Confirmed checks: backend TypeScript build, frontend typecheck/build, five policy/validation tests, and seven PostgreSQL integration tests passed. Browser QA reached registration, pending state, approval, employee invitation and mobile profile update with database assertions; screenshots were reviewed. The first browser run's terminal summary was lost when the tool session ended, so its final status will be recaptured. Screenshot review found a stale-clock countdown could show eight days just after approval; refreshing the clock with session data fixes it and a browser assertion covers it.

Mail tests use a loopback SMTP capture server, never real recipients. A production SMTP provider and VPS deployment have not been verified. Docker execution, backup restore drills and full production security review remain outstanding.

Final identity verification recaptured in `.local-test/verification.log`: 8 integration/browser tests passed, zero skipped or failed. Desktop and mobile screenshots confirm retained RTL styling. Formatting check and frontend typecheck passed. Phase 3 is now in progress.

## Legal operations checkpoint

`backend/src/legal.ts`, `src/LegalWorkspace.tsx` and migration 004 implement tenant-scoped clients, courts, cases, assignment history, hearings/rescheduling and legal procedures. Composite office/entity foreign keys enforce same-office client, court, lawyer, creator and case references in PostgreSQL. Optimistic versions prevent silent overwrites; case row locks serialize closure with related workflows. Dashboards query actual records. Archive preserves records; reopening is audited. Overlap warnings use a one-hour window and do not block saving. Court uniqueness normalizes case/Unicode/whitespace.

Verification: frontend build/typecheck and backend build passed. PostgreSQL and Edge tests passed all 13 results (zero skipped/failed), including direct database cross-tenant FK rejection, duplicate courts, stale reassignment, postponement history, completed counts, procedures, archive/reopen, and UI client/court/case creation and postponement. Screenshots are in ignored `.local-test/screenshots`. The test database stops after testing. Production containers remain unverified.

## Phase 4 attachment checkpoint

`backend/src/files.ts`, `storage.ts`, migration 005 and `src/FilePanel.tsx` implement private case attachments: PDF/PNG/JPEG/WebP content-signature, MIME and extension checks; 10 MB per-file limit; randomized private storage keys; authenticated tenant-scoped downloads; bounded ZIP download; file search/pagination and audit events. Storage is behind an injectable abstraction (local provider implemented; S3 remains future work). Files are never statically served; storage and environment files are excluded from Docker build context. Arabic filenames round-trip correctly. Upload is available inside case detail; documents navigation shows searchable stored files.

Verification: 15 real PostgreSQL/Edge test results passed, zero skipped/failed; 6 policy/validation tests passed. File tests cover forged types, unsafe extensions, tenant/platform denial, byte-exact download, ZIP extraction, and browser upload/download. Production malware scanning and S3 integration are not implemented or claimed. Client fees, notifications, hearing reports, tasks/appointments, messaging, Al-Mizan workflow and templates remain outstanding, as do phases 5–6.

Client case navigation now opens a paginated list scoped to the selected client, including archived/closed cases, with direct access to case detail. Coordinated backup script now stops the API while capturing database and private files and restores service through an exit trap; Docker execution and restore drills remain unverified. Frontend build and TypeScript checks pass for this navigation change.

## Owner and landing customization — 2026-10-11

Configured the explicitly requested platform owner in the persistent local database (password hashed, never stored in source). Added password visibility controls for authentication/account password inputs. Registration accepts user-entered international or local phone prefixes; removed the phone ownership sentence from the trial note. Added platform-only persisted contact settings (migration 006), public contact links, conditional fixed WhatsApp button, Jenin–Palestine location and eng.areen alkilani attribution. Removed landing pricing and fictitious email; desktop navigation is right and logo left. Browser validation passed owner login, password toggle, contact save/public display, guest/office write denial, unsafe social URL rejection, navigation placement and account request submission with a local phone number. Contact number/social links remain empty until provided by the owner; no fabricated numbers or social accounts.

## Platform management — 2026-10-11

Replaced the combined platform screen with exactly four sections: subscribers, trial requests, payments, and contact/password settings. Trial approval remains seven days; explicit extensions preserve the original start and audit each change. Subscription confirmation records a positive decimal payment, currency, cash/Visa method, unique reference and Visa last four digits in the same database transaction. No card processing or full PAN/CVV storage. Subscribers remain listed after expiry/suspension; suspension and expiry retain legal data and files.

Migration 007 adds payment records and a file-deletion queue. Whole-office deletion requires platform password re-verification, exact office name, DELETE text and acknowledgement. A restricted database function removes tenant-linked records; a minimal platform deletion audit remains. Queued file removal retries after failures and restart. Prior backups follow their retention policy. Integration and browser tests: 19 passing, zero failures/skips, covering desktop/mobile owner workflows, concurrent payment deduplication, trial extension, tenant isolation and removal of a rich office fixture with its private file. Two earlier assistant-created smoke-test offices were removed from the LOCAL operating database on explicit user request; the real office and platform owner were retained. Future fixture creation is confined to qayd_test.
Trial acceptance now immediately categorizes an office under subscribers. Pending requests have neither a trial nor a subscription; subscribers include trial offices, paid offices and their stopped/expired accounts. UI shows trial/paid status and the applicable expiry, with trial actions preserved. No real account records are created or changed by this classification update.

## Source cleanup — 2026-10-11

Removed unused Prototype application, fake office/admin pages, mock OTP flow and demo mutation forms after extracting the live components into PublicSite.tsx, AppShell.tsx, components/UI.tsx and navigation.ts. Updated all imports and eliminated the Contact/Prototype circular import. Removed unused imports, obsolete navigation metadata, backend's unused local frontend package dependency and 57 obsolete CSS selectors. Enabled noUnusedLocals/noUnusedParameters. CODE_STRUCTURE.md provides the current code map. Recovery copies are in ignored .local-dev/cleanup-backup. Persistent accounts/database/storage were not changed. Frontend/backend builds and TypeScript pass; 19 existing integration/browser test results passed using qayd_test only.

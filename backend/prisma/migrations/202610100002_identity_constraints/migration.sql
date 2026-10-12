-- Enforce platform/tenant role separation even if a future caller forgets a check.
ALTER TABLE "User" ADD CONSTRAINT "User_role_office_check"
CHECK (("role" = 'SUPER_ADMIN' AND "officeId" IS NULL) OR ("role" <> 'SUPER_ADMIN' AND "officeId" IS NOT NULL));
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized_check" CHECK ("email" = lower(trim("email")));
ALTER TABLE "User" ADD CONSTRAINT "User_active_password_check" CHECK ("status" <> 'ACTIVE' OR "passwordHash" IS NOT NULL);
CREATE UNIQUE INDEX "User_one_owner_per_office" ON "User" ("officeId") WHERE "role" = 'OWNER';
ALTER TABLE "Trial" ADD CONSTRAINT "Trial_dates_check" CHECK ("expiresAt" = "startsAt" + interval '7 days');
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_dates_check" CHECK ("expiresAt" > "startsAt");
-- Runtime can append and read audit records, never modify historical audit events.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qayd_app') THEN
    REVOKE UPDATE, DELETE ON "Audit" FROM qayd_app;
    REVOKE ALL ON "_prisma_migrations" FROM qayd_app;
  END IF;
END $$;

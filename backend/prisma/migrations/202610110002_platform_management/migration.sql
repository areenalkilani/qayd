ALTER TABLE "Trial" DROP CONSTRAINT "Trial_dates_check";
ALTER TABLE "Trial" ADD CONSTRAINT "Trial_dates_check" CHECK ("expiresAt" > "startsAt");
CREATE TABLE "PlatformPayment" (
  "id" UUID PRIMARY KEY,
  "officeId" UUID NOT NULL REFERENCES "Office"("id") ON DELETE RESTRICT,
  "subscriptionId" UUID NOT NULL UNIQUE REFERENCES "Subscription"("id") ON DELETE RESTRICT,
  "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0),
  "currency" TEXT NOT NULL CHECK ("currency" IN ('ILS','USD','JOD')),
  "method" TEXT NOT NULL CHECK ("method" IN ('CASH','VISA')),
  "reference" TEXT NOT NULL,
  "cardLast4" TEXT NOT NULL DEFAULT '',
  "recordedBy" UUID NOT NULL,
  "paidAt" TIMESTAMPTZ(3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("officeId", "reference"),
  CHECK (("method" = 'CASH' AND "cardLast4" = '') OR ("method" = 'VISA' AND "cardLast4" ~ '^[0-9]{4}$'))
);
CREATE INDEX "PlatformPayment_paidAt_idx" ON "PlatformPayment" ("paidAt");
CREATE TABLE "FileDeletion" ("storageKey" TEXT PRIMARY KEY, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
-- The only runtime path allowed to remove tenant audit history is an explicit whole-office purge.
CREATE FUNCTION public.purge_office(target uuid, actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."User" WHERE id = actor AND role = 'SUPER_ADMIN' AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Platform administrator required';
  END IF;
  PERFORM 1 FROM public."Office" WHERE id = target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Office not found'; END IF;
  INSERT INTO public."FileDeletion" ("storageKey") SELECT "storageKey" FROM public."CaseAttachment" WHERE "officeId" = target ON CONFLICT DO NOTHING;
  DELETE FROM public."CaseAttachment" WHERE "officeId" = target;
  DELETE FROM public."HearingReschedule" WHERE "officeId" = target;
  DELETE FROM public."Hearing" WHERE "officeId" = target;
  DELETE FROM public."LegalProcedure" WHERE "officeId" = target;
  DELETE FROM public."AssignmentHistory" WHERE "officeId" = target;
  DELETE FROM public."LegalCase" WHERE "officeId" = target;
  DELETE FROM public."Client" WHERE "officeId" = target;
  DELETE FROM public."Court" WHERE "officeId" = target;
  DELETE FROM public."PlatformPayment" WHERE "officeId" = target;
  DELETE FROM public."Subscription" WHERE "officeId" = target;
  DELETE FROM public."Trial" WHERE "officeId" = target;
  DELETE FROM public."Registration" WHERE "officeId" = target;
  DELETE FROM public."Audit" WHERE "officeId" = target;
  DELETE FROM public."User" WHERE "officeId" = target;
  DELETE FROM public."Office" WHERE id = target;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_office(uuid, uuid) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qayd_app') THEN
    GRANT EXECUTE ON FUNCTION public.purge_office(uuid, uuid) TO qayd_app;
  END IF;
END $$;

CREATE TYPE "FinanceKind" AS ENUM ('CLIENT_FEE', 'CLIENT_PAYMENT', 'PAYMENT_PROMISE', 'OFFICE_EXPENSE', 'SALARY', 'SUPPLY', 'MAINTENANCE');
CREATE TYPE "FinanceStatus" AS ENUM ('POSTED', 'PROMISED', 'CANCELLED');
CREATE TABLE "FinanceEntry" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "officeId" UUID NOT NULL, "clientId" UUID, "caseId" UUID,
  "kind" "FinanceKind" NOT NULL, "status" "FinanceStatus" NOT NULL DEFAULT 'POSTED', "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ILS', "method" TEXT NOT NULL DEFAULT '', "reference" TEXT NOT NULL DEFAULT '', "description" TEXT NOT NULL DEFAULT '',
  "dueAt" TIMESTAMPTZ(3), "paidAt" TIMESTAMPTZ(3), "recordedBy" UUID NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id"), CONSTRAINT "FinanceEntry_officeId_id_key" UNIQUE ("officeId", "id"),
  CONSTRAINT "FinanceEntry_officeId_clientId_fkey" FOREIGN KEY ("officeId", "clientId") REFERENCES "Client"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FinanceEntry_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "LegalCase"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "FinanceEntry_officeId_kind_createdAt_idx" ON "FinanceEntry"("officeId", "kind", "createdAt");
CREATE INDEX "FinanceEntry_officeId_clientId_status_idx" ON "FinanceEntry"("officeId", "clientId", "status");

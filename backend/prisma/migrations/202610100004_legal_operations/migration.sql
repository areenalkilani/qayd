-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HearingStatus" AS ENUM ('SCHEDULED', 'POSTPONED', 'HELD_ACTIVE', 'HELD_COMPLETED');

-- CreateEnum
CREATE TYPE "ProcedureStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "officeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Court" (
    "id" UUID NOT NULL,
    "officeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalCase" (
    "id" UUID NOT NULL,
    "officeId" UUID NOT NULL,
    "internalNumber" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "courtId" UUID NOT NULL,
    "courtNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "lawyerId" UUID,
    "creatorId" UUID NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LegalCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentHistory" (
    "id" UUID NOT NULL,
    "officeId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "previousLawyerId" UUID,
    "newLawyerId" UUID,
    "actorId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hearing" (
    "id" UUID NOT NULL,
    "officeId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "courtId" UUID NOT NULL,
    "lawyerId" UUID NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3),
    "status" "HearingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "outcome" TEXT NOT NULL DEFAULT '',
    "judicialDecisions" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Hearing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HearingReschedule" (
    "id" UUID NOT NULL,
    "officeId" UUID NOT NULL,
    "hearingId" UUID NOT NULL,
    "previousAt" TIMESTAMPTZ(3),
    "nextAt" TIMESTAMPTZ(3),
    "reason" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HearingReschedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalProcedure" (
    "id" UUID NOT NULL,
    "officeId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "assignedId" UUID NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "reminderAt" TIMESTAMPTZ(3),
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" "ProcedureStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "LegalProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_officeId_name_idx" ON "Client"("officeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_officeId_id_key" ON "Client"("officeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Court_officeId_id_key" ON "Court"("officeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Court_officeId_normalizedName_key" ON "Court"("officeId", "normalizedName");

-- CreateIndex
CREATE INDEX "LegalCase_officeId_status_createdAt_idx" ON "LegalCase"("officeId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LegalCase_officeId_id_key" ON "LegalCase"("officeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "LegalCase_officeId_internalNumber_key" ON "LegalCase"("officeId", "internalNumber");

-- CreateIndex
CREATE INDEX "AssignmentHistory_officeId_caseId_createdAt_idx" ON "AssignmentHistory"("officeId", "caseId", "createdAt");

-- CreateIndex
CREATE INDEX "Hearing_officeId_lawyerId_scheduledAt_idx" ON "Hearing"("officeId", "lawyerId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Hearing_officeId_status_idx" ON "Hearing"("officeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Hearing_officeId_id_key" ON "Hearing"("officeId", "id");

-- CreateIndex
CREATE INDEX "HearingReschedule_officeId_hearingId_idx" ON "HearingReschedule"("officeId", "hearingId");

-- CreateIndex
CREATE INDEX "LegalProcedure_officeId_status_dueAt_idx" ON "LegalProcedure"("officeId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_officeId_id_key" ON "User"("officeId", "id");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Court" ADD CONSTRAINT "Court_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalCase" ADD CONSTRAINT "LegalCase_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalCase" ADD CONSTRAINT "LegalCase_officeId_clientId_fkey" FOREIGN KEY ("officeId", "clientId") REFERENCES "Client"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalCase" ADD CONSTRAINT "LegalCase_officeId_courtId_fkey" FOREIGN KEY ("officeId", "courtId") REFERENCES "Court"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalCase" ADD CONSTRAINT "LegalCase_officeId_lawyerId_fkey" FOREIGN KEY ("officeId", "lawyerId") REFERENCES "User"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalCase" ADD CONSTRAINT "LegalCase_officeId_creatorId_fkey" FOREIGN KEY ("officeId", "creatorId") REFERENCES "User"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentHistory" ADD CONSTRAINT "AssignmentHistory_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "LegalCase"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "LegalCase"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_officeId_courtId_fkey" FOREIGN KEY ("officeId", "courtId") REFERENCES "Court"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hearing" ADD CONSTRAINT "Hearing_officeId_lawyerId_fkey" FOREIGN KEY ("officeId", "lawyerId") REFERENCES "User"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HearingReschedule" ADD CONSTRAINT "HearingReschedule_officeId_hearingId_fkey" FOREIGN KEY ("officeId", "hearingId") REFERENCES "Hearing"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalProcedure" ADD CONSTRAINT "LegalProcedure_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalProcedure" ADD CONSTRAINT "LegalProcedure_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "LegalCase"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalProcedure" ADD CONSTRAINT "LegalProcedure_officeId_assignedId_fkey" FOREIGN KEY ("officeId", "assignedId") REFERENCES "User"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

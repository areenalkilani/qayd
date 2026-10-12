CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

CREATE TABLE "WorkTask" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "officeId" UUID NOT NULL,
  "caseId" UUID,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "assignedId" UUID NOT NULL,
  "creatorId" UUID NOT NULL,
  "dueAt" TIMESTAMPTZ(3) NOT NULL,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
  "completedAt" TIMESTAMPTZ(3),
  "completionNote" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkTask_officeId_id_key" UNIQUE ("officeId", "id"),
  CONSTRAINT "WorkTask_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "LegalCase"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_officeId_assignedId_fkey" FOREIGN KEY ("officeId", "assignedId") REFERENCES "User"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WorkTask_officeId_creatorId_fkey" FOREIGN KEY ("officeId", "creatorId") REFERENCES "User"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "WorkTask_officeId_status_dueAt_idx" ON "WorkTask"("officeId", "status", "dueAt");
CREATE INDEX "WorkTask_officeId_assignedId_status_idx" ON "WorkTask"("officeId", "assignedId", "status");

CREATE TABLE "TaskHistory" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "officeId" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaskHistory_officeId_taskId_fkey" FOREIGN KEY ("officeId", "taskId") REFERENCES "WorkTask"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TaskHistory_officeId_taskId_createdAt_idx" ON "TaskHistory"("officeId", "taskId", "createdAt");

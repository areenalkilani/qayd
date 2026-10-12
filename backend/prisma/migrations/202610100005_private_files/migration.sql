-- CreateTable
CREATE TABLE "CaseAttachment" (
    "id" UUID NOT NULL,
    "officeId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaseAttachment_storageKey_key" ON "CaseAttachment"("storageKey");

-- CreateIndex
CREATE INDEX "CaseAttachment_officeId_caseId_createdAt_idx" ON "CaseAttachment"("officeId", "caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CaseAttachment_officeId_id_key" ON "CaseAttachment"("officeId", "id");

-- AddForeignKey
ALTER TABLE "CaseAttachment" ADD CONSTRAINT "CaseAttachment_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseAttachment" ADD CONSTRAINT "CaseAttachment_officeId_caseId_fkey" FOREIGN KEY ("officeId", "caseId") REFERENCES "LegalCase"("officeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

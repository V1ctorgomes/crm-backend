-- Registo persistente de eliminações (motivo + snapshot para futura reversão / consulta admin).
CREATE TABLE "deletion_audits" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deletion_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deletion_audits_actorUserId_createdAt_idx" ON "deletion_audits"("actorUserId", "createdAt");
CREATE INDEX "deletion_audits_resourceType_createdAt_idx" ON "deletion_audits"("resourceType", "createdAt");
CREATE INDEX "deletion_audits_resourceType_resourceId_idx" ON "deletion_audits"("resourceType", "resourceId");

-- AlterTable
ALTER TABLE "deletion_audits" ADD COLUMN "revertedAt" TIMESTAMP(3),
ADD COLUMN "revertedByUserId" TEXT;

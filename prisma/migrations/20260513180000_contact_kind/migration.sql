-- CreateEnum
CREATE TYPE "ContactKind" AS ENUM ('UNKNOWN', 'CUSTOMER', 'INTERNAL');

-- AlterTable
ALTER TABLE "contacts" ADD COLUMN "contactKind" "ContactKind" NOT NULL DEFAULT 'UNKNOWN';

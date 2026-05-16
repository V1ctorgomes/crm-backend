-- Impede eliminar Company enquanto existir Ticket com companyId (alinhado a onDelete: Restrict no Prisma).
ALTER TABLE "Ticket" DROP CONSTRAINT IF EXISTS "Ticket_companyId_fkey";

ALTER TABLE "Ticket"
  ADD CONSTRAINT "Ticket_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

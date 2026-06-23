import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SEED_USERS = [
  { email: 'user@crm.com', name: 'Atendimento', role: 'USER' },
  { email: 'admin@crm.com', name: 'Administrador', role: 'ADMIN' },
  { email: 'developer@crm.com', name: 'Developer', role: 'DEVELOPER' },
] as const;

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Seed bloqueado em produção (contém palavras-passe de exemplo).');
    process.exit(1);
  }

  const password = await bcrypt.hash('12345678', 10);

  for (const u of SEED_USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        password,
        approved: true,
      },
      create: {
        email: u.email,
        name: u.name,
        password,
        role: u.role,
        approved: true,
      },
    });
  }

  const catalogDefaults: { category: string; label: string; sortOrder: number }[] = [
    { category: 'MARCA', label: 'Outras', sortOrder: 1 },
    { category: 'MODELO', label: 'Não especificado', sortOrder: 1 },
    { category: 'CUSTOMER_TYPE', label: 'Particular', sortOrder: 1 },
    { category: 'TICKET_TYPE', label: 'Orçamento', sortOrder: 1 },
  ];
  for (const row of catalogDefaults) {
    await prisma.ticketCatalogItem.upsert({
      where: { category_label: { category: row.category, label: row.label } },
      update: { isActive: true, sortOrder: row.sortOrder },
      create: { category: row.category, label: row.label, sortOrder: row.sortOrder },
    });
  }

  console.log('✅ Seed: 3 utilizadores (USER, ADMIN, DEVELOPER) — palavra-passe: 12345678');
  for (const u of SEED_USERS) {
    console.log(`   • ${u.role.padEnd(9)} ${u.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

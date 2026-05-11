// O '../' sobe para 'src', o outro '../' sobe para a raiz, e depois entra em 'generated'
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('123456', 10);
  
  await prisma.user.upsert({
    where: { email: 'admin@crm.com' },
    update: { role: 'ADMIN' },
    create: {
      email: 'admin@crm.com',
      name: 'Admin',
      password: password,
      role: 'ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { email: 'admindois@crm.com' },
    update: { role: 'DEVELOPER' },
    create: {
      email: 'admindois@crm.com',
      name: 'Admin Dois',
      password: password,
      role: 'DEVELOPER',
    },
  });

  console.log('✅ Seed executado com sucesso a partir de src/prisma!..');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
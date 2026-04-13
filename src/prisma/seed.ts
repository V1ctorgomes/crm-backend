// O '../' sobe para 'src', o outro '../' sobe para a raiz, e depois entra em 'generated'
import { PrismaClient } from '../../generated/prisma'; 
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash('password123', 10);
  
  await prisma.user.upsert({
    where: { email: 'admin@crm.com' },
    update: {},
    create: {
      email: 'admin@crm.com',
      name: 'Admin',
      password: password,
    },
  });

  console.log('✅ Seed executado com sucesso a partir de src/prisma!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
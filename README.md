# CRM Backend

Backend do CRM desenvolvido com [NestJS](https://nestjs.com/) e [Prisma ORM](https://www.prisma.io/) conectado a um banco PostgreSQL hospedado em ambiente EasyPanel.

---

## **Tecnologias**

- Node.js
- NestJS
- Prisma ORM
- PostgreSQL

---

## **Estrutura de Pastas**

```
crm-backend/
├─ src/
│  ├─ app.controller.ts
│  ├─ app.service.ts
│  ├─ prisma/
│  │   ├─ prisma.module.ts
│  │   └─ prisma.service.ts
│      ├─ customers.controller.ts
│      ├─ customers.service.ts
│      └─ customers.module.ts
├─ .env
├─ tsconfig.json
└─ README.md
```

---

## **Configuração do Banco de Dados e Prisma**

- **Arquivo `.env`:**
  ```env
  DATABASE_URL="postgresql://USUARIO:SENHA@HOST:PORTA/NOME_DO_BANCO?schema=public&sslmode=disable"
  ```
  > Exemplo real pode ser:
  > `postgresql://crmpost:minhasenhasegura@painel.testevictor.site:55432/crm?schema=public&sslmode=disable`

- **Configuração do prisma:** (`prisma/schema.prisma`)
  ```prisma
  generator client {
    provider = "prisma-client-js"
    output   = "../generated/prisma"
  }

  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
# CRM Backend
  }

  model Customer {
    name      String
    email     String   @unique
    phone     String?


## **Setup e scripts**

1. Instale as dependências:
    ```bash
    npm install
    ```

2. Gere o Prisma Client:
    ```bash
    npx prisma generate
    ```

3. Rode as migrations (caso necessário):
    ```bash
    npx prisma migrate dev --name init
    ```

4. Inicie a aplicação em dev:
    ```bash
    npm run start:dev
    ```
    Ou para produção:
    ```bash
    npm run build
    npm run start:prod
    ```
---

## **Endpoints disponíveis**

- `POST /customers` — Criar cliente
- `GET /customers` — Listar todos os clientes
- `GET /customers/:id` — Buscar cliente por ID
- `PATCH /customers/:id` — Atualizar dados do cliente
- `DELETE /customers/:id` — Remover cliente

---

## **Deploy no EasyPanel**

- Faça o push deste projeto para o GitHub.
- No EasyPanel, conecte seu repositório e defina as variáveis de ambiente conforme `.env`.
- Certifique-se que a porta exposta no app é a desejada (ex: 3000).
- O container executará a aplicação com base no `package.json`.

---

## **Observações**

- O Prisma Client é gerado fora da pasta `src` por padrão.
- Caso edite o `schema.prisma`, **sempre rode** o comando `npx prisma generate`.
- Senhas e URLs de acesso NÃO devem ser expostas publicamente.

---

# CRM Backend

Backend do projeto CRM, desenvolvido com NestJS, Node.js e TypeScript.

## Tecnologias utilizadas

- NestJS
- Node.js
- TypeScript
- Docker
- EasyPanel

## Objetivo

Este projeto é responsável pela API do CRM, fornecendo rotas para integração com o frontend e, futuramente, autenticação, cadastro de clientes e integração com banco de dados.

## Como rodar localmente

Instale as dependências:

```bash
npm install
```

Inicie em modo desenvolvimento:

```bash
npm run start:dev
```

O backend ficará disponível em:

```text
http://localhost:3001
```

## Variáveis de ambiente

Atualmente o backend pode utilizar:

```env
PORT=3001
```

Em produção, essa variável pode ser configurada no EasyPanel.

## Endpoints atuais

### GET /
Retorna mensagem simples confirmando que o backend está funcionando.

### GET /health
Retorna status da aplicação.

## Build de produção

```bash
npm run build
npm run start:prod
```

## Deploy

O deploy está sendo feito no EasyPanel.

### Variáveis de ambiente usadas em produção

- `PORT`

## Estrutura inicial

- `src/main.ts`: inicialização da aplicação
- `src/app.module.ts`: módulo principal
- `src/app.controller.ts`: rotas iniciais
- `src/app.service.ts`: regras básicas

## Status atual

- [x] Projeto criado
- [x] Backend publicado no EasyPanel
- [x] Endpoint `/` funcionando
- [x] Endpoint `/health` funcionando
- [ ] Configurar banco de dados
- [ ] Criar autenticação
- [ ] Criar módulo de clientes
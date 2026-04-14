# 1. Imagem base super leve
FROM node:18-alpine AS builder

# 2. Define o diretório de trabalho
WORKDIR /app

# 3. Copia APENAS os ficheiros de dependências primeiro (Acelera futuros deploys)
COPY package.json package-lock.json ./

# 4. Instala todas as dependências (incluindo o novo Axios)
RUN npm install

# 5. Copia TODO o resto do código e ficheiros vitais de configuração (tsconfig.json, nest-cli.json)
COPY . .

# 6. Gera o cliente da Base de Dados (Crucial para o CRM em produção)
RUN npx prisma generate

# 7. Compila o projeto NestJS seguindo as regras do tsconfig
RUN npm run build

# 8. Expõe a porta que o backend utiliza
EXPOSE 3001

# 9. Comando para iniciar o servidor blindado
CMD ["npm", "run", "start:prod"]
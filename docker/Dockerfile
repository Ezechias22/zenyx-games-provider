# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app

# Prisma a besoin d'OpenSSL + certificats
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

#############################
# deps (production modules + prisma client)
#############################
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# IMPORTANT: prisma generate doit être fait ICI (dans deps)
COPY prisma ./prisma
RUN npx prisma generate

#############################
# build (dev deps + build TS)
#############################
FROM base AS build
COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig.json nest-cli.json ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
RUN npm run build

#############################
# runner (image finale)
#############################
FROM base AS runner
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

EXPOSE 8080

# En prod: appliquer migrations puis démarrer
CMD ["sh", "-c", "npm run prisma:deploy && node dist/main.js"]
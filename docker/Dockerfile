# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app

# Prisma a besoin des libs SSL + certs
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*


# =========================
# deps (prod node_modules + prisma client GENERATED)
# =========================
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate


# =========================
# build (compile TS -> dist)
# =========================
FROM base AS build
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json nest-cli.json ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npm run build


# =========================
# runner
# =========================
FROM base AS runner
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

# Railway écoute sur PORT (toi: 8080)
EXPOSE 8080

# 1) applique les migrations en prod
# 2) démarre l'API
CMD ["sh", "-c", "npm run prisma:deploy && node dist/main.js"]

# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app

# Prisma a besoin des libs SSL + certs
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# =========================
# deps (prod deps only)
# =========================
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# =========================
# build (dev deps + compile)
# =========================
FROM base AS build
COPY package.json package-lock.json* ./
RUN npm ci

# IMPORTANT: copier Prisma avant generate
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# =========================
# runner (production image)
# =========================
FROM base AS runner
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

# Railway va router vers le PORT défini (souvent 8080 chez toi)
EXPOSE 8080

# Simple start (Railway peut override avec Start Command)
CMD ["node", "dist/main.js"]

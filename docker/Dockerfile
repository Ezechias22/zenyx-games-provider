# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# 1) deps prod + prisma generate (IMPORTANT)
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

# 2) build (dev deps pour compiler Nest)
FROM base AS build
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json nest-cli.json ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npm run build

# 3) runner (image finale)
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

EXPOSE 8080

# ✅ generate (déjà fait), migrate deploy, puis run
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
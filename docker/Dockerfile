# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app

# Prisma a besoin des libs SSL + certs
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*


FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev


FROM base AS build
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json nest-cli.json ./
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
RUN npm run build


FROM base AS runner
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

EXPOSE 3000
CMD ["sh", "-c", "npx prisma generate && node dist/main.js"]

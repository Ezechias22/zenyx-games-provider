# ZENYX GAMES Provider API (NestJS) — Production-Ready Skeleton

ZENYX GAMES est un **Game Provider** (fournisseur de jeux casino).  
Cette API est conçue pour être intégrée par des **opérateurs** (sites casino), pas par les joueurs.

## ✅ Fonctionnalités
- NestJS + TypeScript
- PostgreSQL (Prisma)
- Redis (locks anti double-spin)
- Wallet + ledger (transactions atomiques)
- Provably Fair (serverSeedHash, serverSeed, clientSeed, nonce)
- API opérateur sécurisée (API Key + HMAC + IP whitelist)
- Swagger (OpenAPI)
- Docker / docker-compose

## 🚀 Démarrage
1. Copier `.env.example` vers `.env` et ajuster les valeurs.
2. Lancer:
```bash
docker-compose up -d --build
```
3. Appliquer la migration Prisma:
```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

## 🔐 Création d'un opérateur
Endpoint interne protégé par `x-master-token`:

`POST /v1/operator/create`

Headers:
- `x-master-token: <MASTER_ADMIN_TOKEN>`

Body:
```json
{ "name": "CasinoX", "ipWhitelist": ["127.0.0.1"] }
```

Réponse: `apiKey` + `apiSecret` (secret affiché une seule fois).

## 🔏 Signature HMAC (opérateur)
Headers obligatoires sur les endpoints casino:
- `X-API-KEY`
- `X-SIGNATURE`
- `X-TIMESTAMP` (ms epoch)

Payload signé:
`payload = "{ts}.{METHOD}.{URL}.{sha256(JSON_body)}"`
`signature = hmac_sha256_hex(apiSecret, payload)`

## 🎰 Flow jeu
1) `POST /v1/casino/game/init` -> retourne `roundId` + `serverSeedHash`  
2) `POST /v1/casino/game/play` -> débite la mise, calcule résultat, crédite gain, settle round  
3) `GET /v1/casino/game/verify/:roundId` -> révèle `serverSeed` pour vérification (après settlement)

## ⚠️ Notes production
- Mettre l'API derrière un reverse proxy (Nginx) et gérer `X-Forwarded-For`.
- Stockage des secrets opérateurs : ici chiffrés AES-GCM via `PROVIDER_ENC_KEY`.
- Ajuster rate limits, whitelist IP, monitoring et alerting.

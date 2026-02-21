// src/public/public.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import { join } from 'path';
import * as fs from 'fs/promises';

import { RedisService } from '../common/redis/redis.service';
import { GamesService } from '../games/games.service';
import { PublicGuard } from './public.guard';
import { PublicPlayDto, PublicRechargeDto, PublicSessionDto } from './dto/public.dto';

import { getCatalogList } from '../games/catalog';
import { WalletService } from '../wallet/wallet.service';
import { PrismaService } from '../common/prisma/prisma.service';

function randomId(): string {
  return randomBytes(16).toString('hex');
}

async function listSymbolPaths(gameId: string): Promise<string[]> {
  try {
    const dir = join(process.cwd(), 'public', 'assets', gameId, 'symbols');
    const files = await fs.readdir(dir);
    return files
      .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .map((f) => `/assets/${gameId}/symbols/${f}`);
  } catch {
    return [];
  }
}

function cleanBaseUrl(u: string) {
  return String(u || '').trim().replace(/\/+$/, '');
}

/**
 * Le provider renvoie parfois une grid "colonnes" (5 colonnes x 3 lignes),
 * mais le game-server affiche plus simplement une grid "lignes" (3 lignes x 5 colonnes).
 */
function normalizeGridToRows(grid: any): string[][] | null {
  if (!Array.isArray(grid) || grid.length === 0) return null;

  // Si c'est déjà 3 lignes (rows) => 3 arrays de longueur 5
  if (grid.length === 3 && Array.isArray(grid[0]) && grid[0].length === 5) {
    return grid as string[][];
  }

  // Si c'est 5 colonnes (cols) => 5 arrays de longueur 3, on transpose en 3x5
  if (grid.length === 5 && Array.isArray(grid[0]) && grid[0].length === 3) {
    const rows = 3;
    const cols = 5;
    const out: string[][] = Array.from({ length: rows }, () => Array(cols).fill(''));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        out[r][c] = String(grid[c][r] ?? '');
      }
    }
    return out;
  }

  // Format inconnu -> on laisse tel quel si c'est 2D
  if (Array.isArray(grid[0])) return grid as string[][];
  return null;
}

/**
 * Mapping minimal pour éviter "Invalid symbol cell".
 */
function normalizeSymbolKey(cell: any): string {
  const v = String(cell ?? '').trim();
  if (!v) return 'unknown';

  if (v === 'W') return 'wild';
  if (v === 'S') return 'scatter';

  if (!/^[a-zA-Z0-9_\-]+$/.test(v)) return v;
  return v;
}

@ApiTags('public')
@ApiSecurity('x-public-token')
@ApiSecurity('x-operator-key')
@Controller('public')
@UseGuards(PublicGuard)
export class PublicController {
  constructor(
    private readonly redis: RedisService,
    private readonly games: GamesService,
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /v1/public/games
   */
  @Get('games')
  async gamesList() {
    const list = getCatalogList();

    const out = await Promise.all(
      list.map(async (g) => {
        const assets: any = {
          cover: g.assets.cover,
          background: g.assets.background,
        };

        if (g.kind === 'SLOT') {
          assets.symbols = await listSymbolPaths(g.id);
        }

        return {
          id: g.id,
          name: g.name,
          kind: g.kind,
          rtp: g.rtp,
          volatility: g.volatility,
          ui: g.ui,
          assets,
        };
      }),
    );

    return out;
  }

  /**
   * POST /v1/public/session
   */
  @Post('session')
  async createSession(@Body() dto: PublicSessionDto, @Req() req: any) {
    const operatorId = req.operator.id;

    const initRes = await this.games.init(operatorId, {
      gameCode: dto.gameCode,
      playerExternalId: dto.playerExternalId,
      currency: dto.currency,
      clientSeed: dto.clientSeed,
    });

    const sessionId = `sess_${randomId()}`;
    const ttl = Number(process.env.PUBLIC_SESSION_TTL_SEC || '3600');

    const payload = {
      operatorId,
      roundId: initRes.roundId,
      gameCode: initRes.gameCode,
      playerExternalId: dto.playerExternalId,
      currency: dto.currency,
      createdAt: new Date().toISOString(),
    };

    await this.redis.setJson(`public:session:${sessionId}`, payload, ttl);

    const apiPrefix = (process.env.API_BASE_PATH || 'v1').replace(/^\/+/, '');

    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : cleanBaseUrl(process.env.PUBLIC_BASE_URL || '');

    const resolvedBase = cleanBaseUrl(baseUrl);

    if (!resolvedBase) {
      throw new BadRequestException(
        'Missing RAILWAY_PUBLIC_DOMAIN or PUBLIC_BASE_URL for launchUrl',
      );
    }

    const launchUrl = `${resolvedBase}/${apiPrefix}/launch?s=${encodeURIComponent(sessionId)}`;

    return { sessionId, launchUrl, ttlSec: ttl };
  }

  /**
   * POST /v1/public/play
   */
  @Post('play')
  async play(@Body() dto: PublicPlayDto, @Req() req: any) {
    const operatorId = req.operator.id;

    const key = `public:session:${dto.sessionId}`;
    const session = await this.redis.getJson<any>(key);

    if (!session || session.operatorId !== operatorId) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const tryPlay = async (roundId: string) => {
      return this.games.play(operatorId, {
        roundId,
        bet: dto.bet,
        clientSeed: dto.clientSeed,
        idempotencyKey: dto.idempotencyKey,

        // ✅ SLOT FEATURES
        buyFreeSpins: dto.buyFreeSpins,

        // ✅ GAMBLE FEATURES
        gamble: dto.gamble,
        gamblePick: dto.gamblePick,
      } as any);
    };

    let res: any;

    try {
      res = await tryPlay(session.roundId);
    } catch (e: any) {
      const msg = e?.response?.message || e?.message || '';

      if (String(msg).includes('Round already played')) {
        const initRes = await this.games.init(operatorId, {
          gameCode: session.gameCode,
          playerExternalId: session.playerExternalId,
          currency: session.currency,
          clientSeed: dto.clientSeed,
        });

        session.roundId = initRes.roundId;
        await this.redis.setJson(
          key,
          session,
          Number(process.env.PUBLIC_SESSION_TTL_SEC || '3600'),
        );

        res = await tryPlay(session.roundId);
      } else {
        throw e;
      }
    }

    try {
      if (res?.kind === 'SLOT' && res?.result) {
        const grid = normalizeGridToRows(res.result.grid);
        if (grid) {
          res.result.grid = grid.map((row) => row.map(normalizeSymbolKey));
        }
        if (Array.isArray(res.result.symbols)) {
          res.result.symbols = res.result.symbols.map(normalizeSymbolKey);
        }
      }
    } catch {
      // no-op
    }

    return res;
  }

  /**
   * POST /v1/public/recharge
   * Crédit wallet (utile pour tests / demo / game-server).
   */
  @Post('recharge')
  async recharge(@Body() dto: PublicRechargeDto, @Req() req: any) {
    const operatorId = req.operator.id;

    const playerExternalId = String(dto.playerExternalId || '').trim();
    const currency = String(dto.currency || '').trim();
    const amount = Number(dto.amount);

    if (!playerExternalId) throw new BadRequestException('playerExternalId is required');
    if (!currency) throw new BadRequestException('currency is required');
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Invalid amount');

    // ✅ S’assure que le player existe (sinon wallet.credit peut échouer)
    await this.prisma.player.upsert({
      where: { operatorId_externalId: { operatorId, externalId: playerExternalId } },
      update: {},
      create: { operatorId, externalId: playerExternalId },
      select: { id: true },
    });

    await this.wallet.credit(operatorId, playerExternalId, currency, amount, {
      idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:recharge` : undefined,
      referenceId: dto.idempotencyKey ? `recharge:${dto.idempotencyKey}` : `recharge:${randomId()}`,
      meta: { type: 'PUBLIC_RECHARGE' },
    });

    const balance = await this.wallet.getBalance(operatorId, playerExternalId, currency);

    return {
      ok: true,
      playerExternalId,
      currency,
      amount,
      balance,
    };
  }
}
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
import { PublicPlayDto, PublicSessionDto } from './dto/public.dto';

import { getCatalogList } from '../games/catalog';

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

// ✅ Convertit symbols -> grid si nécessaire (compat game-server)
function ensureSlotGrid(result: any) {
  if (!result || result.type !== 'SLOT') return;

  // déjà OK
  if (result.grid) return;

  const symbols = result.symbols;

  // Cas 1: déjà une matrice 2D
  if (Array.isArray(symbols) && Array.isArray(symbols[0])) {
    result.grid = symbols;
    return;
  }

  // Cas 2: tableau "flat" => essayer 5x3
  if (Array.isArray(symbols) && symbols.length) {
    const COLS = 5;
    const ROWS = 3;

    // Interprétation A: [col0r0, col0r1, col0r2, col1r0...]
    const gridCols: any[] = [];
    for (let c = 0; c < COLS; c++) {
      const col = symbols.slice(c * ROWS, (c + 1) * ROWS);
      if (col.length) gridCols.push(col);
    }

    if (gridCols.length === COLS && gridCols.every((c) => c.length === ROWS)) {
      result.grid = gridCols;
      return;
    }

    // Interprétation B: [row0c0, row0c1...]
    const gridRows: any[] = [];
    for (let r = 0; r < ROWS; r++) {
      const row = symbols.slice(r * COLS, (r + 1) * COLS);
      if (row.length) gridRows.push(row);
    }

    result.grid = gridRows;
  }
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
  ) {}

  /**
   * GET /v1/public/games
   * Catalogue public utilisé par le GAME SERVER (iframe).
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
   * Crée session publique + renvoie launchUrl (DOIT POINTER VERS LE PROVIDER)
   */
  @Post('session')
  async createSession(@Body() dto: PublicSessionDto, @Req() req: any) {
    const operatorId = req.operator.id;

    // 1) init round côté provider
    const initRes = await this.games.init(operatorId, {
      gameCode: dto.gameCode,
      playerExternalId: dto.playerExternalId,
      currency: dto.currency,
      clientSeed: dto.clientSeed,
    });

    // 2) session publique
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

    // ✅ 3) launchUrl -> PROVIDER + /v1/launch (globalPrefix)
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

    // IMPORTANT: /v1/launch (pas /launch)
    const launchUrl = `${resolvedBase}/${apiPrefix}/launch?s=${encodeURIComponent(
      sessionId,
    )}`;

    return {
      sessionId,
      launchUrl,
      ttlSec: ttl,
    };
  }

  /**
   * POST /v1/public/play
   * Appelé UNIQUEMENT par le game-server.
   */
  @Post('play')
  async play(@Body() dto: PublicPlayDto, @Req() req: any) {
    const operatorId = req.operator.id;

    const session = await this.redis.getJson<any>(
      `public:session:${dto.sessionId}`,
    );

    if (!session || session.operatorId !== operatorId) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const data: any = await this.games.play(operatorId, {
      roundId: session.roundId,
      bet: dto.bet,
      clientSeed: dto.clientSeed,
      idempotencyKey: dto.idempotencyKey,
    });

    // ✅ fix: compat pour game-server => ajouter result.grid si manquant
    ensureSlotGrid(data?.result);

    return data;
  }
}

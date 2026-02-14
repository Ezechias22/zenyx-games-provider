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

    return this.games.play(operatorId, {
      roundId: session.roundId,
      bet: dto.bet,
      clientSeed: dto.clientSeed,
      idempotencyKey: dto.idempotencyKey,
    });
  }
}

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
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

import { RedisService } from '../common/redis/redis.service';
import { GamesService } from '../games/games.service';
import { PublicGuard } from './public.guard';
import { PublicPlayDto, PublicSessionDto } from './dto/public.dto';

// ✅ catalogue central (source unique de vérité)
import { getCatalogList } from '../games/catalog';

function randomId(): string {
  return randomBytes(16).toString('hex');
}

function listSymbolsMap(symbolsDirUrl?: string): Record<string, string> | undefined {
  if (!symbolsDirUrl) return undefined;

  // symbolsDirUrl = "/assets/<game>/symbols"
  const rel = symbolsDirUrl.replace(/^\/+/, ''); // "assets/<game>/symbols"
  const abs = join(process.cwd(), 'public', rel); // "/app/public/assets/<game>/symbols"

  if (!existsSync(abs)) return undefined;

  const files = readdirSync(abs).filter((f) => f.toLowerCase().endsWith('.png'));

  const map: Record<string, string> = {};
  for (const f of files) {
    const key = f.replace(/\.png$/i, '');
    map[key] = `${symbolsDirUrl}/${f}`;
  }
  return map;
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
   * → Images, métadonnées UI, RTP, type + symbols map
   */
  @Get('games')
  async gamesList() {
    return getCatalogList().map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind,
      rtp: g.rtp,
      volatility: g.volatility,
      ui: g.ui,
      assets: {
        cover: g.assets.cover,
        background: g.assets.background,
        symbols: g.kind === 'SLOT' ? listSymbolsMap(g.assets.symbolsDir) : undefined,
      },
    }));
  }

  /**
   * POST /v1/public/session
   * Crée une session "publique" et retourne un launchUrl iframe-ready (PROVIDER).
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

    // 2) créer session publique
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

    // 3) launchUrl DOIT pointer vers le provider (iframe)
    const providerBase =
      String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '') ||
      (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '');

    if (!providerBase) {
      throw new BadRequestException('PUBLIC_BASE_URL or RAILWAY_PUBLIC_DOMAIN is not configured');
    }

    const launchUrl = `${providerBase}/launch?s=${encodeURIComponent(sessionId)}`;

    return {
      sessionId,
      launchUrl,
      ttlSec: ttl,
    };
  }

  /**
   * POST /v1/public/play
   * Appelé UNIQUEMENT par le GAME SERVER.
   */
  @Post('play')
  async play(@Body() dto: PublicPlayDto, @Req() req: any) {
    const operatorId = req.operator.id;

    const session = await this.redis.getJson<any>(`public:session:${dto.sessionId}`);

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

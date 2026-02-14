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

  @Get('games')
  async gamesList() {
    const list = getCatalogList();

    const out = await Promise.all(
      list.map(async (g) => {
        const assets: any = {
          cover: g.assets.cover,
          background: g.assets.background,
        };

        // ✅ SLOT: renvoyer les symbols dans le catalog
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

    // ✅ 3) launchUrl DOIT POINTER VERS LE PROVIDER
    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');

    const resolvedBase = baseUrl || '';
    if (!resolvedBase) {
      throw new BadRequestException(
        'Missing PUBLIC_BASE_URL or RAILWAY_PUBLIC_DOMAIN for launchUrl',
      );
    }

    const launchUrl = `${resolvedBase}/launch?s=${encodeURIComponent(sessionId)}`;

    return {
      sessionId,
      launchUrl,
      ttlSec: ttl,
    };
  }

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

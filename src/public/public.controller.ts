import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UnauthorizedException,
  Get,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RedisService } from '../common/redis/redis.service';
import { GamesService } from '../games/games.service';
import { PublicGuard } from './public.guard';
import { PublicPlayDto, PublicSessionDto } from './dto/public.dto';
import { randomBytes } from 'crypto';

function randomId(): string {
  return randomBytes(16).toString('hex');
}

@ApiTags('public')
@ApiSecurity('x-public-token')
@ApiSecurity('x-operator-key')
@Controller('public')
@UseGuards(PublicGuard)
export class PublicController {
  constructor(private redis: RedisService, private games: GamesService) {}

  // ✅ NOUVEAU : liste jeux (pour le game-server)
  @Get('games')
  async gamesList() {
    // IMPORTANT: doit matcher /v1/provider/games
    // (ici on renvoie la liste statique)
    return [
      { id: 'fruit_classic', kind: 'SLOT', rtp: 0.96 },
      { id: 'egypt_riches', kind: 'SLOT', rtp: 0.96 },
      { id: 'jungle_wild', kind: 'SLOT', rtp: 0.96 },
      { id: 'luxury_gold', kind: 'SLOT', rtp: 0.96 },
      { id: 'diamond_rush', kind: 'SLOT', rtp: 0.96 },
      { id: 'fire_reels', kind: 'SLOT', rtp: 0.96 },
      { id: 'mystic_fortune', kind: 'SLOT', rtp: 0.96 },
      { id: 'crash_multiplier', kind: 'CRASH', rtp: 0.97 },
      { id: 'dice_over_under', kind: 'DICE', rtp: 0.99 },
    ];
  }

  @Post('session')
  async createSession(@Body() dto: PublicSessionDto, @Req() req: any) {
    const operatorId = req.operator.id;

    const gameServerBase = String(process.env.GAME_SERVER_BASE_URL || '').replace(/\/+$/, '');
    if (!gameServerBase) {
      throw new BadRequestException('GAME_SERVER_BASE_URL is not configured');
    }

    const initRes = await this.games.init(operatorId, dto as any);

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

    const launchUrl = `${gameServerBase}/play?sessionId=${encodeURIComponent(sessionId)}`;

    return {
      sessionId,
      launchUrl,
      ttlSec: ttl,
      init: initRes,
    };
  }

  @Post('play')
  async play(@Body() dto: PublicPlayDto, @Req() req: any) {
    const operatorId = req.operator.id;

    const s = await this.redis.getJson<any>(`public:session:${dto.sessionId}`);
    if (!s || s.operatorId !== operatorId) {
      throw new UnauthorizedException('Invalid session');
    }

    return this.games.play(operatorId, {
      roundId: s.roundId,
      bet: dto.bet,
      clientSeed: dto.clientSeed,
      idempotencyKey: dto.idempotencyKey,
    } as any);
  }
}

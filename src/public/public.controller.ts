import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { RedisService } from '../common/redis/redis.service';
import { GamesService } from '../games/games.service';
import { PublicGuard } from './public.guard';
import { PublicPlayDto, PublicSessionDto } from './dto/public.dto';
import crypto from 'crypto';

function randomId(): string {
  return crypto.randomBytes(16).toString('hex');
}

@ApiTags('public')
@ApiSecurity('x-public-token')
@ApiSecurity('x-operator-key')
@Controller('public')
@UseGuards(PublicGuard)
export class PublicController {
  constructor(private redis: RedisService, private games: GamesService) {}

  /**
   * Crée une session "publique" qui retourne un launchUrl (iframe).
   * Le site casino N'APPELLE PAS /casino/game/init directement.
   *
   * Flow :
   * - Ton site appelle /public/session
   * - API crée roundId côté provider
   * - API stocke roundId dans Redis (sessionId)
   * - API retourne launchUrl = GAME_SERVER/play?sessionId=...
   */
  @Post('session')
  async createSession(@Body() dto: PublicSessionDto, @Req() req: any) {
    const operatorId = req.operator.id;

    const gameServerBase = String(process.env.GAME_SERVER_BASE_URL || '').replace(/\/+$/, '');
    if (!gameServerBase) {
      throw new BadRequestException('GAME_SERVER_BASE_URL is not configured');
    }

    // 1) init normal (création roundId)
    const initRes = await this.games.init(operatorId, dto as any);

    // 2) save session in redis
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

    // 3) build launch url for iframe game server
    const launchUrl = `${gameServerBase}/play?sessionId=${encodeURIComponent(sessionId)}`;

    // ✅ on retourne minimal (site casino n’a pas besoin de roundId)
    return {
      sessionId,
      launchUrl,
      ttlSec: ttl,
      // si tu veux masquer encore plus, commente la ligne init
      init: initRes,
    };
  }

  /**
   * Endpoint "public play" : le site jeu (game-server) appelle ça,
   * avec sessionId, et l’API translate -> roundId interne.
   */
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

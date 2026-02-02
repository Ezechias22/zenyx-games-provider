import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { OperatorAuthGuard } from '../operator/operator.guard';
import { GamesService } from './games.service';
import { GameInitDto, GamePlayDto } from './dto/game.dto';

@ApiTags('games')
@ApiSecurity('x-api-key')
@ApiSecurity('x-signature')
@Controller('casino/game')
@UseGuards(OperatorAuthGuard)
export class GamesController {
  constructor(private gamesService: GamesService) {}

  @Post('init')
  async init(@Body() dto: GameInitDto, @Req() req: any) {
    const gameCode = dto.gameCode ?? dto.gameId;
    const playerExternalId = dto.playerExternalId ?? dto.playerId;

    if (!gameCode || typeof gameCode !== 'string' || gameCode.length < 2) {
      throw new BadRequestException('Missing gameCode (or gameId)');
    }
    if (
      !playerExternalId ||
      typeof playerExternalId !== 'string' ||
      playerExternalId.length < 1
    ) {
      throw new BadRequestException('Missing playerExternalId (or playerId)');
    }
    if (!dto.currency || typeof dto.currency !== 'string' || dto.currency.length < 2) {
      throw new BadRequestException('Missing currency');
    }

    // ✅ DTO normalisé: TS sait que c’est string
    return this.gamesService.init(req.operator.id, {
      gameCode,
      playerExternalId,
      currency: dto.currency,
      clientSeed: dto.clientSeed,
    });
  }

  @Post('play')
  async play(@Body() dto: GamePlayDto, @Req() req: any) {
    return this.gamesService.play(req.operator.id, dto);
  }

  @Get('verify/:roundId')
  async verify(@Param('roundId') roundId: string, @Req() req: any) {
    return this.gamesService.verify(req.operator.id, roundId);
  }
}

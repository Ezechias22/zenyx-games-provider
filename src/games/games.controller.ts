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
    // Accept aliases
    const gameCode = dto.gameCode ?? dto.gameId;
    const playerExternalId = dto.playerExternalId ?? dto.playerId;

    if (!gameCode || gameCode.length < 2) {
      throw new BadRequestException('Missing gameCode (or gameId)');
    }
    if (!playerExternalId || playerExternalId.length < 1) {
      throw new BadRequestException('Missing playerExternalId (or playerId)');
    }

    // Normalize payload for the service (keep same DTO shape)
    const normalized: GameInitDto = {
      ...dto,
      gameCode,
      playerExternalId,
    };

    return this.gamesService.init(req.operator.id, normalized);
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

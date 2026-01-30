import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
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
    return this.gamesService.init(req.operator.id, dto);
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

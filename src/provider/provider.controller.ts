import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ProviderService } from './provider.service';
import { ListGamesQueryDto } from './dto/list-games.dto';
import { RtpSimDto } from './dto/rtp-sim.dto';
import { OperatorAuthGuard } from '../operator/operator.guard';

@ApiTags('provider')
@ApiSecurity('x-api-key')
@ApiSecurity('x-signature')
@Controller('provider')
@UseGuards(OperatorAuthGuard)
export class ProviderController {
  constructor(private svc: ProviderService) {}

  @Get('games')
  async list(@Query() q: ListGamesQueryDto) {
    return this.svc.listEngines(q.kind).map(e => ({ id: e.id, kind: e.kind, rtp: e.rtp }));
  }

  @Get('games/:gameId/config')
  async config(@Param('gameId') gameId: string) {
    return this.svc.getGameConfig(gameId);
  }

  @Post('fairness/verify')
  async verify(@Body() body: any) {
    // body: { serverSeed, clientSeed, nonce, gameId, action }
    return this.svc.verifyFairness(body);
  }

  @Post('rtp/simulate')
  async sim(@Body() dto: RtpSimDto) {
    return this.svc.simulateRtp(dto.gameId, dto.spins, dto.bet ?? '1');
  }
}

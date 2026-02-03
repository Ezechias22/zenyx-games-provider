import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { OperatorAuthGuard } from '../../operator/operator.guard';
import { GameLaunchDto } from './dto/launch.dto';
import { GameLaunchService } from './launch.service';

@Controller('casino/game')
@UseGuards(OperatorAuthGuard)
export class GameLaunchController {
  constructor(private launcher: GameLaunchService) {}

  @Post('launch')
  async launch(@Body() dto: GameLaunchDto, @Req() req: any) {
    return this.launcher.createLaunchUrl(req.operator.id, dto.roundId);
  }
}

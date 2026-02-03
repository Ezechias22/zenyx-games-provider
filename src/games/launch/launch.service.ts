import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PublicLaunchService } from '../../public/public.service';

@Injectable()
export class GameLaunchService {
  constructor(private prisma: PrismaService, private launch: PublicLaunchService) {}

  async createLaunchUrl(operatorId: string, roundId: string) {
    const round = await this.prisma.gameRound.findFirst({ where: { id: roundId, operatorId } });
    if (!round) throw new NotFoundException('Round not found');

    const player = await this.prisma.player.findUnique({ where: { id: round.playerId } });
    if (!player) throw new BadRequestException('Player not found');

    const base = (process.env.GAME_SERVER_BASE_URL || '').replace(/\/+$/, '');
    if (!base) throw new Error('Missing GAME_SERVER_BASE_URL env');

    const expSeconds = Number(process.env.LAUNCH_TOKEN_TTL_SECONDS || '600'); // 10 min default
    const exp = Math.floor(Date.now() / 1000) + expSeconds;

    const token = this.launch.signLaunchToken({
      operatorId,
      roundId: round.id,
      gameCode: round.gameCode,
      currency: round.currency,
      exp,
    });

    const launchUrl = `${base}/play/${encodeURIComponent(round.gameCode)}?t=${encodeURIComponent(token)}`;
    return { launchUrl, expiresIn: expSeconds };
  }
}

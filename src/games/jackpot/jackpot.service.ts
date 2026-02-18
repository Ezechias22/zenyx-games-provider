import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { fairnessU01 } from '../core/fairness';

@Injectable()
export class JackpotService {
  constructor(private prisma: PrismaService) {}

  async ensurePool(gameCode: string) {
    return this.prisma.progressiveJackpot.upsert({
      where: { gameCode },
      update: {},
      create: { gameCode, pool: 0 },
    });
  }

  async contribute(gameCode: string, bet: number) {
    const contribution = bet * 0.02; // 2% contribution
    await this.prisma.progressiveJackpot.update({
      where: { gameCode },
      data: { pool: { increment: contribution } },
    });
  }

  async tryHit(gameCode: string, serverSeed: string, clientSeed: string, nonce: number) {
    const jp = await this.prisma.progressiveJackpot.findUnique({
      where: { gameCode },
    });
    if (!jp) return { hit: false, amount: 0 };

    const r = fairnessU01(serverSeed, clientSeed, nonce, 'jackpot');

    if (r < jp.hitRate) {
      const amount = Number(jp.pool);
      await this.prisma.progressiveJackpot.update({
        where: { gameCode },
        data: { pool: 0 },
      });
      return { hit: true, amount };
    }

    return { hit: false, amount: 0 };
  }

  async getPool(gameCode: string) {
    const jp = await this.prisma.progressiveJackpot.findUnique({
      where: { gameCode },
    });
    return Number(jp?.pool ?? 0);
  }
}

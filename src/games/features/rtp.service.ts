import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'

type FactorKey = string // `${operatorId}:${gameCode}`

@Injectable()
export class RtpService {
  private factorCache = new Map<FactorKey, number>()

  constructor(private prisma: PrismaService) {}

  private key(operatorId: string, gameCode: string) {
    return `${operatorId}:${gameCode}`
  }

  /**
   * Charge/seed settings et calcule un facteur (cache mémoire)
   * Appelle ça au début de play() pour avoir un RTP dynamique réel.
   *
   * ⚠️ nécessite OperatorGameSettings dans Prisma
   */
  async loadFactor(operatorId: string, gameCode: string) {
    const s = await this.prisma.operatorGameSettings.upsert({
      where: { operatorId_gameCode: { operatorId, gameCode } },
      update: {},
      create: { operatorId, gameCode },
    })

    const baseRtp = 0.96
    const target = Number(s.targetRtp ?? baseRtp)
    const factor = target / baseRtp

    this.factorCache.set(this.key(operatorId, gameCode), factor)

    return { targetRtp: target, factor }
  }

  /**
   * Utilisation:
   *   await this.rtp.loadFactor(operatorId, round.gameCode)
   *   const applied = this.rtp.apply(winAmount, round.gameCode, operatorId)
   */
  apply(win: number, gameCode: string, operatorId?: string) {
    const w = Number(win)
    if (!Number.isFinite(w) || w < 0) return { win: 0, factor: 1 }

    const factor =
      operatorId != null
        ? this.factorCache.get(this.key(operatorId, gameCode)) ?? 1
        : 1

    return { win: w * factor, factor }
  }
}
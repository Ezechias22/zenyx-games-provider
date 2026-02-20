import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../common/prisma/prisma.service'
import { createHash } from 'crypto'

@Injectable()
export class JackpotService {
  constructor(private prisma: PrismaService) {}

  /**
   * Contribution progressive.
   * - Compatible avec ton schéma JackpotPool(operatorId, currency, tier)
   * - Dans ton code actuel tu passes gameCode à la place de currency => on le traite comme scopeKey.
   */
  async addContribution(operatorId: string, scopeKey: string, amount: number, seed: number) {
    const op = (operatorId || '').trim()
    const key = (scopeKey || '').trim()

    const amt = Number(amount)
    const s = Number(seed)

    if (!op) return
    if (!key) return
    if (!Number.isFinite(amt) || amt <= 0) return
    if (!Number.isFinite(s) || s < 0) return

    await this.prisma.jackpotPool.upsert({
      where: {
        operatorId_currency_tier: { operatorId: op, currency: key, tier: 'GRAND' },
      },
      update: {
        amount: { increment: amt },
        seed: s,
      },
      create: {
        operatorId: op,
        currency: key,
        tier: 'GRAND',
        amount: amt,
        seed: s,
      },
    })
  }

  /**
   * TryWin déterministe.
   * - chance 0..1
   * - payout = meterBefore (cap optional)
   * - reset meter => seed
   */
  async tryWin(params: {
    operatorId: string
    gameCode: string // utilisé comme scopeKey
    seed: number
    chance: number
    maxPayout?: number
    serverSeed: string
    clientSeed: string
    nonce: number
  }) {
    const operatorId = (params.operatorId || '').trim()
    const scopeKey = (params.gameCode || '').trim()

    const seed = Number(params.seed)
    const chance = Number(params.chance)
    const nonce = Number(params.nonce)

    if (!operatorId) return { won: false, payout: 0, roll: null, meterBefore: 0, meterAfter: 0 }
    if (!scopeKey) return { won: false, payout: 0, roll: null, meterBefore: 0, meterAfter: 0 }
    if (!Number.isFinite(seed) || seed < 0) return { won: false, payout: 0, roll: null, meterBefore: 0, meterAfter: 0 }
    if (!Number.isFinite(chance) || chance <= 0) return { won: false, payout: 0, roll: null, meterBefore: 0, meterAfter: 0 }
    if (!Number.isFinite(nonce) || nonce < 0) return { won: false, payout: 0, roll: null, meterBefore: 0, meterAfter: 0 }
    if (!params.serverSeed) return { won: false, payout: 0, roll: null, meterBefore: 0, meterAfter: 0 }

    // assure pool existe
    const pool = await this.prisma.jackpotPool.upsert({
      where: {
        operatorId_currency_tier: { operatorId, currency: scopeKey, tier: 'GRAND' },
      },
      update: {},
      create: {
        operatorId,
        currency: scopeKey,
        tier: 'GRAND',
        amount: 0,
        seed,
      },
    })

    const meterBefore = Number(pool.amount)

    // roll deterministe 0..1
    const h = createHash('sha256')
      .update(`${params.serverSeed}:${params.clientSeed || ''}:${nonce}:JACKPOT`)
      .digest('hex')

    const rollInt = parseInt(h.slice(0, 8), 16)
    const roll = rollInt / 0xffffffff

    const won = roll < chance
    if (!won) {
      return { won: false, payout: 0, roll, meterBefore, meterAfter: meterBefore }
    }

    // payout (cap optionnel)
    let payout = meterBefore
    const maxPayout = params.maxPayout != null ? Number(params.maxPayout) : undefined
    if (Number.isFinite(maxPayout as any) && (maxPayout as number) >= 0) {
      payout = Math.min(payout, maxPayout as number)
    }

    const meterAfter = Number(pool.seed)

    await this.prisma.jackpotPool.update({
      where: {
        operatorId_currency_tier: { operatorId, currency: scopeKey, tier: 'GRAND' },
      },
      data: { amount: meterAfter },
    })

    return { won: true, payout, roll, meterBefore, meterAfter }
  }
}
import { BadRequestException, Injectable } from '@nestjs/common'
import { createHash } from 'crypto'

type BonusPrize =
  | { type: 'CASH'; mul: number }
  | { type: 'FS'; fs: number }

@Injectable()
export class BonusService {
  /**
   * Trigger déterministe: rollFloat < chance
   * chance ex: 0.02 => 2%
   */
  shouldTrigger(params: {
    serverSeed: string
    clientSeed: string
    nonce: number
    chance: number
  }): boolean {
    const chance = Number(params.chance)
    if (!Number.isFinite(chance) || chance <= 0) return false
    if (chance >= 1) return true

    const serverSeed = params.serverSeed || ''
    const clientSeed = params.clientSeed || ''
    const nonce = Number(params.nonce)

    if (!serverSeed) throw new BadRequestException('Missing serverSeed')
    if (!Number.isFinite(nonce) || nonce < 0) throw new BadRequestException('Invalid nonce')

    const h = createHash('sha256')
      .update(`${serverSeed}:${clientSeed}:${nonce}:BONUS_TRIGGER`)
      .digest('hex')

    const rollInt = parseInt(h.slice(0, 8), 16)
    const roll = rollInt / 0xffffffff // 0..1

    return roll < chance
  }

  /**
   * Wheel spin déterministe
   * - Retourne win CASH + events
   * - Peut aussi retourner un prix FS (à appliquer sur nextSessionData si tu veux)
   */
  spin(params: { serverSeed: string; clientSeed: string; nonce: number; bet: number }) {
    const serverSeed = params.serverSeed || ''
    const clientSeed = params.clientSeed || ''
    const nonce = Number(params.nonce)
    const bet = Number(params.bet)

    if (!serverSeed) throw new BadRequestException('Missing serverSeed')
    if (!Number.isFinite(nonce) || nonce < 0) throw new BadRequestException('Invalid nonce')
    if (!Number.isFinite(bet) || bet < 0) throw new BadRequestException('Invalid bet')

    // Table wheel (tu peux ajuster)
    const wheel: BonusPrize[] = [
      { type: 'CASH', mul: 2 },
      { type: 'CASH', mul: 5 },
      { type: 'CASH', mul: 10 },
      { type: 'FS', fs: 5 },
      { type: 'FS', fs: 10 },
      { type: 'CASH', mul: 20 },
    ]

    const h = createHash('sha256')
      .update(`${serverSeed}:${clientSeed}:${nonce}:BONUS_SPIN`)
      .digest('hex')

    const rollInt = parseInt(h.slice(0, 8), 16)
    const index = rollInt % wheel.length
    const prize = wheel[index]

    const cashWin = prize.type === 'CASH' ? bet * prize.mul : 0
    const win = Number(cashWin.toFixed(8))

    const events = [
      { t: 'BONUS_TRIGGER', ts: Date.now(), d: {} },
      { t: 'BONUS_START', ts: Date.now(), d: {} },
      { t: 'BONUS_WHEEL_SPIN', ts: Date.now(), d: { index, prize } },
      { t: 'BONUS_END', ts: Date.now(), d: { win, prize } },
    ]

    return { win, prize, events }
  }
}
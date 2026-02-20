import { BadRequestException, Injectable } from '@nestjs/common'
import { createHash } from 'crypto'

type Pick = 'RED' | 'BLACK'

@Injectable()
export class GambleService {
  /**
   * Stake = lastWin (déjà gagné) qu'on remet en jeu
   */
  parseStake(lastWin: any): number {
    const stake = Number(lastWin)
    if (!Number.isFinite(stake) || stake <= 0) throw new BadRequestException('Nothing to gamble')
    return Number(stake.toFixed(8))
  }

  /**
   * Résultat déterministe basé sur seeds + nonce
   * - Pas de Math.random
   * - Auditability: mêmes inputs => même output
   */
  resolve(params: {
    serverSeed: string
    clientSeed: string
    nonce: number
    pick?: Pick
  }) {
    const pick = (params.pick ?? 'RED') as Pick
    if (pick !== 'RED' && pick !== 'BLACK') throw new BadRequestException('Invalid gamble pick')

    const serverSeed = params.serverSeed || ''
    const clientSeed = params.clientSeed || ''
    const nonce = Number(params.nonce)

    if (!serverSeed) throw new BadRequestException('Missing serverSeed')
    if (!Number.isFinite(nonce) || nonce < 0) throw new BadRequestException('Invalid nonce')

    // Hash stable
    const h = createHash('sha256')
      .update(`${serverSeed}:${clientSeed}:${nonce}:GAMBLE`)
      .digest('hex')

    // roll 0..9999
    const roll = parseInt(h.slice(0, 8), 16) % 10000
    const color: Pick = roll % 2 === 0 ? 'RED' : 'BLACK'
    const win = color === pick

    return { win, color, roll }
  }
}
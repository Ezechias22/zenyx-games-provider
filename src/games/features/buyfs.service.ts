import { BadRequestException, Injectable } from '@nestjs/common'

@Injectable()
export class BuyFsService {
  /**
   * Retourne le coût d'achat des FreeSpins.
   * - Compatible avec ton GamesService actuel: this.buyfs.getCost(round.gameCode, bet)
   * - Supporte multiplier dynamique: this.buyfs.getCost(gameCode, bet, settings.buyFsMul)
   */
  getCost(gameCode: string, bet: number, buyFsMul = 100) {
    const code = (gameCode || '').trim()
    if (!code) throw new BadRequestException('Invalid gameCode')

    const b = Number(bet)
    if (!Number.isFinite(b) || b <= 0) throw new BadRequestException('Invalid bet')

    const mul = Number(buyFsMul)
    if (!Number.isFinite(mul) || mul <= 0) throw new BadRequestException('Invalid buyFsMul')

    const cost = b * mul

    // garde 8 décimales comme le reste du provider (optionnel)
    const costFixed = Number(cost.toFixed(8))

    return { cost: costFixed, mul }
  }
}

// ✅ Alias si ton GamesService importe BuyFreeSpinsService
export { BuyFsService as BuyFreeSpinsService }
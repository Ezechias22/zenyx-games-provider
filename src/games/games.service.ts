import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { WalletService } from '../wallet/wallet.service';
import { FairnessService } from './engine/fairness.service';
import { sha256Hex } from '../common/security/crypto.util';

import { SlotFruitStarService } from './slots/fruit_star/slot.service';
import { CrashService } from './crash/crash.service';
import { DiceService } from './dice/dice.service';

import { GameInitNormalizedDto, GamePlayDto } from './dto/game.dto';

function stableNum(n: number): number {
  if (!Number.isFinite(n) || n < 0) throw new BadRequestException('Invalid number');
  return n;
}

// ✅ IDs EXACTS renvoyés par /v1/public/games (catalog) ou /v1/provider/games
const SLOT_GAMES = new Set([
  'fruit_classic',
  'egypt_riches',
  'jungle_wild',
  'luxury_gold',
  'diamond_rush',
  'fire_reels',
  'mystic_fortune',
]);

const CRASH_GAMES = new Set(['crash_multiplier']);
const DICE_GAMES = new Set(['dice_over_under']);

@Injectable()
export class GamesService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private wallet: WalletService,
    private fairness: FairnessService,

    // SLOT (ton slot actuel)
    private slotFruit: SlotFruitStarService,

    // ✅ nouveaux moteurs
    private crash: CrashService,
    private dice: DiceService,
  ) {}

  private kindOf(gameCode: string): 'SLOT' | 'CRASH' | 'DICE' {
    const code = (gameCode || '').trim();
    if (SLOT_GAMES.has(code)) return 'SLOT';
    if (CRASH_GAMES.has(code)) return 'CRASH';
    if (DICE_GAMES.has(code)) return 'DICE';
    throw new BadRequestException('Unknown gameCode');
  }

  async init(operatorId: string, dto: GameInitNormalizedDto) {
    const gameCode = (dto.gameCode || '').trim();
    const playerExternalId = (dto.playerExternalId || '').trim();
    const currency = (dto.currency || '').trim();

    const kind = this.kindOf(gameCode);

    const { serverSeed, serverSeedHash } = this.fairness.generateServerSeed();
    const clientSeed = dto.clientSeed || `player:${playerExternalId}`;

    const player = await this.prisma.player.upsert({
      where: { operatorId_externalId: { operatorId, externalId: playerExternalId } },
      update: {},
      create: { operatorId, externalId: playerExternalId },
    });

    const round = await this.prisma.gameRound.create({
      data: {
        operatorId,
        playerId: player.id,
        gameCode,
        betAmount: '0',
        winAmount: '0',
        currency,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce: 0,
        status: 'CREATED',
        result: '{}',
      },
    });

    const bal = await this.wallet.getBalance(operatorId, playerExternalId, currency);

    // rtp/volatility selon le type
    const meta =
      kind === 'SLOT'
        ? { rtp: this.slotFruit.rtp, volatility: this.slotFruit.volatility }
        : kind === 'CRASH'
          ? { rtp: this.crash.rtp, volatility: this.crash.volatility }
          : { rtp: this.dice.rtp, volatility: this.dice.volatility };

    return {
      provider: 'ZENYX GAMES',
      roundId: round.id,
      gameCode,
      kind,
      rtp: meta.rtp,
      volatility: meta.volatility,
      fairness: { serverSeedHash },
      wallet: bal,
    };
  }

  async play(operatorId: string, dto: GamePlayDto) {
    const round = await this.prisma.gameRound.findFirst({ where: { id: dto.roundId, operatorId } });
    if (!round) throw new NotFoundException('Round not found');
    if (round.status !== 'CREATED') throw new BadRequestException('Round already played');

    const bet = stableNum(dto.bet);
    const kind = this.kindOf(round.gameCode);

    const lockKey = `lock:spin:${operatorId}:${round.playerId}`;
    const locked = await this.redis.acquireLock(lockKey, 5_000);
    if (!locked) throw new BadRequestException('Spin in progress');

    try {
      // Idempotency
      if (dto.idempotencyKey) {
        const requestHash = sha256Hex(JSON.stringify(dto));
        const existing = await this.prisma.idempotencyKey.findUnique({
          where: { operatorId_key: { operatorId, key: dto.idempotencyKey } },
        });
        if (existing) {
          if (existing.endpoint !== 'game/play' || existing.requestHash !== requestHash) {
            throw new BadRequestException('Idempotency key conflict');
          }
          return JSON.parse(existing.response);
        }
      }

      // Debit bet
      const player = await this.prisma.player.findUnique({ where: { id: round.playerId } });
      if (!player) throw new BadRequestException('Player not found');

      await this.wallet.debit(operatorId, player.externalId, round.currency, bet, {
        idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:debit` : undefined,
        referenceId: `round:${round.id}`,
        meta: { gameCode: round.gameCode, kind },
      });

      const nextNonce = round.nonce + 1;
      const clientSeed = dto.clientSeed || round.clientSeed;

      // ---------- PLAY ----------
      let playRes: { winAmount: number; roundResult: any };

      if (kind === 'SLOT') {
        playRes = this.slotFruit.play({
          serverSeed: round.serverSeed,
          clientSeed,
          nonce: nextNonce,
          bet,
        });
      } else if (kind === 'CRASH') {
        const cashoutAt = Number(dto.crashCashoutAt);
        playRes = this.crash.play({
          serverSeed: round.serverSeed,
          clientSeed,
          nonce: nextNonce,
          bet,
          cashoutAt,
        });
      } else {
        // DICE
        const mode = dto.diceMode as any;
        const target = Number(dto.diceTarget);

        // dice.play est async dans ton service wrapper
        playRes = await this.dice.play({
          serverSeed: round.serverSeed,
          clientSeed,
          nonce: nextNonce,
          bet,
          mode,
          target,
          roundId: round.id,
        } as any);
      }

      const win = stableNum(playRes.winAmount);

      if (win > 0) {
        await this.wallet.credit(operatorId, player.externalId, round.currency, win, {
          idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:credit` : undefined,
          referenceId: `round:${round.id}`,
          meta: { gameCode: round.gameCode, kind },
        });
      }

      const updatedRound = await this.prisma.gameRound.update({
        where: { id: round.id },
        data: {
          betAmount: bet.toFixed(8),
          winAmount: win.toFixed(8),
          clientSeed,
          nonce: nextNonce,
          status: 'SETTLED',
          settledAt: new Date(),
          result: JSON.stringify(playRes.roundResult),
        },
      });

      const balance = await this.wallet.getBalance(operatorId, player.externalId, round.currency);

      const response = {
        provider: 'ZENYX GAMES',
        roundId: updatedRound.id,
        gameCode: updatedRound.gameCode,
        kind,
        bet: updatedRound.betAmount.toString(),
        win: updatedRound.winAmount.toString(),
        currency: updatedRound.currency,
        result: JSON.parse(updatedRound.result),
        nonce: updatedRound.nonce,
        balance,
      };

      if (dto.idempotencyKey) {
        await this.prisma.idempotencyKey.create({
          data: {
            operatorId,
            key: dto.idempotencyKey,
            endpoint: 'game/play',
            requestHash: sha256Hex(JSON.stringify(dto)),
            response: JSON.stringify(response),
          },
        });
      }

      return response;
    } finally {
      await this.redis.releaseLock(lockKey);
    }
  }

  async verify(operatorId: string, roundId: string) {
    const round = await this.prisma.gameRound.findFirst({ where: { id: roundId, operatorId } });
    if (!round) throw new NotFoundException('Round not found');

    return {
      provider: 'ZENYX GAMES',
      roundId: round.id,
      gameCode: round.gameCode,
      kind: this.kindOf(round.gameCode),
      status: round.status,
      fairness: {
        serverSeedHash: round.serverSeedHash,
        serverSeed: round.serverSeed,
        clientSeed: round.clientSeed,
        nonce: round.nonce,
      },
      result: JSON.parse(round.result),
      createdAt: round.createdAt,
      settledAt: round.settledAt,
    };
  }
}

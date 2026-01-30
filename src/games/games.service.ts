import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { WalletService } from '../wallet/wallet.service';
import { FairnessService } from './engine/fairness.service';
import { sha256Hex } from '../common/security/crypto.util';
import { SlotFruitStarService } from './slots/fruit_star/slot.service';
import { GameInitDto, GamePlayDto } from './dto/game.dto';

function stableNum(n: number): number {
  if (!Number.isFinite(n) || n < 0) throw new BadRequestException('Invalid number');
  return n;
}

@Injectable()
export class GamesService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private wallet: WalletService,
    private fairness: FairnessService,
    private slotFruit: SlotFruitStarService,
  ) {}

  private getGame(gameCode: string) {
    if (gameCode === this.slotFruit.gameCode) return this.slotFruit;
    throw new BadRequestException('Unknown gameCode');
  }

  async init(operatorId: string, dto: GameInitDto) {
    const game = this.getGame(dto.gameCode);
    const { serverSeed, serverSeedHash } = this.fairness.generateServerSeed();
    const clientSeed = dto.clientSeed || `player:${dto.playerExternalId}`;
    const player = await this.prisma.player.upsert({
      where: { operatorId_externalId: { operatorId, externalId: dto.playerExternalId } },
      update: {},
      create: { operatorId, externalId: dto.playerExternalId },
    });

    const round = await this.prisma.gameRound.create({
      data: {
        operatorId,
        playerId: player.id,
        gameCode: dto.gameCode,
        betAmount: '0',
        winAmount: '0',
        currency: dto.currency,
        serverSeed,
        serverSeedHash,
        clientSeed,
        nonce: 0,
        status: 'CREATED',
        result: '{}',
      },
    });

    const bal = await this.wallet.getBalance(operatorId, dto.playerExternalId, dto.currency);

    return {
      provider: 'ZENYX GAMES',
      roundId: round.id,
      gameCode: dto.gameCode,
      rtp: game.rtp,
      volatility: game.volatility,
      fairness: { serverSeedHash },
      wallet: bal,
    };
  }

  async play(operatorId: string, dto: GamePlayDto) {
    const round = await this.prisma.gameRound.findFirst({ where: { id: dto.roundId, operatorId } });
    if (!round) throw new NotFoundException('Round not found');
    if (round.status !== 'CREATED') throw new BadRequestException('Round already played');

    const bet = stableNum(dto.bet);
    const game = this.getGame(round.gameCode);

    const lockKey = `lock:spin:${operatorId}:${round.playerId}`;
    const locked = await this.redis.acquireLock(lockKey, 5_000);
    if (!locked) throw new BadRequestException('Spin in progress');

    try {
      // Idempotency per operator on play endpoint
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

      const debitRes = await this.wallet.debit(operatorId, player.externalId, round.currency, bet, {
        idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:debit` : undefined,
        referenceId: `round:${round.id}`,
        meta: { gameCode: round.gameCode },
      });

      const nextNonce = round.nonce + 1;
      const clientSeed = dto.clientSeed || round.clientSeed;

      const playRes = game.play({
        serverSeed: round.serverSeed,
        clientSeed,
        nonce: nextNonce,
        bet,
      });

      const win = stableNum(playRes.winAmount);

      if (win > 0) {
        await this.wallet.credit(operatorId, player.externalId, round.currency, win, {
          idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:credit` : undefined,
          referenceId: `round:${round.id}`,
          meta: { gameCode: round.gameCode },
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

      // Best-effort store tx round linkage
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
      status: round.status,
      fairness: {
        serverSeedHash: round.serverSeedHash,
        serverSeed: round.serverSeed, // revealed (operators can expose to players after settlement)
        clientSeed: round.clientSeed,
        nonce: round.nonce,
      },
      result: JSON.parse(round.result),
      createdAt: round.createdAt,
      settledAt: round.settledAt,
    };
  }
}

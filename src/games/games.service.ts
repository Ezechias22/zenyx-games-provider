// src/games/games.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { WalletService } from '../wallet/wallet.service';
import { FairnessService } from './engine/fairness.service';
import { sha256Hex } from '../common/security/crypto.util';
import { fairnessU01 } from './core/fairness';

import { CrashService } from './crash/crash.service';
import { DiceService } from './dice/dice.service';

import { JackpotService } from './jackpot/jackpot.service';

import { GameInitNormalizedDto, GamePlayDto } from './dto/game.dto';
import { ProviderService } from '../provider/provider.service';

function stableNum(n: number): number {
  if (!Number.isFinite(n) || n < 0) throw new BadRequestException('Invalid number');
  return n;
}

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
    private providerSvc: ProviderService,
    private crash: CrashService,
    private dice: DiceService,
    private jackpot: JackpotService,
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
      where: {
        operatorId_externalId: { operatorId, externalId: playerExternalId },
      },
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

    // meta RTP (facultatif)
    let rtp = 0;
    let volatility: any = undefined;

    try {
      const engine = this.providerSvc.getEngine(gameCode);
      rtp = engine.rtp;
    } catch {
      rtp =
        kind === 'CRASH'
          ? this.crash.rtp
          : kind === 'DICE'
            ? this.dice.rtp
            : 0.96;
    }

    return {
      provider: 'ZENYX GAMES',
      roundId: round.id,
      gameCode,
      kind,
      rtp,
      volatility,
      fairness: { serverSeedHash },
      wallet: bal,
    };
  }

  async play(operatorId: string, dto: GamePlayDto) {
    const round = await this.prisma.gameRound.findFirst({
      where: { id: dto.roundId, operatorId },
    });
    if (!round) throw new NotFoundException('Round not found');
    if (round.status !== 'CREATED') throw new BadRequestException('Round already played');

    const bet = stableNum(dto.bet);
    const kind = this.kindOf(round.gameCode);

    const lockKey = `lock:spin:${operatorId}:${round.playerId}`;
    const locked = await this.redis.acquireLock(lockKey, 5_000);
    if (!locked) throw new BadRequestException('Spin in progress');

    try {
      // ✅ Idempotency (endpoint game/play)
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

      const player = await this.prisma.player.findUnique({ where: { id: round.playerId } });
      if (!player) throw new BadRequestException('Player not found');

      const nextNonce = round.nonce + 1;
      const clientSeed = dto.clientSeed || round.clientSeed;

      let winAmount = 0;
      let roundResult: any = {};

      // ------------------ SLOT ------------------
      if (kind === 'SLOT') {
        const engine = this.providerSvc.getEngine(round.gameCode);

        // ✅ Load persistent slot session (FS state)
        const ss = await this.prisma.slotSession.upsert({
          where: {
            operatorId_playerId_gameCode: {
              operatorId,
              playerId: player.id,
              gameCode: round.gameCode,
            },
          },
          update: {},
          create: {
            operatorId,
            playerId: player.id,
            gameCode: round.gameCode,
            data: '{}',
          },
        });

        let sessionData: any = {};
        try {
          sessionData = JSON.parse(ss.data || '{}');
        } catch {
          sessionData = {};
        }

        if ((dto as any).buyFeature === 'FREE_SPINS') {
          const cost = bet * 50; // 50x bet cost

          await this.wallet.debit(operatorId, player.externalId, round.currency, cost, {
            referenceId: `round:${round.id}`,
          });

          sessionData.freeSpinsRemaining = 10;
        }

        const fsRemainingBefore = Number(sessionData?.freeSpinsRemaining ?? 0);
        const betCost = fsRemainingBefore > 0 ? 0 : bet;

        // ✅ Debit only if not in free spins
        if (betCost > 0) {
          await this.wallet.debit(operatorId, player.externalId, round.currency, betCost, {
            idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:debit` : undefined,
            referenceId: `round:${round.id}`,
            meta: { gameCode: round.gameCode, kind },
          });
        }

        // ✅ Progressive Jackpot pool
        await this.jackpot.ensurePool(round.gameCode);

        if (betCost > 0) {
          await this.jackpot.contribute(round.gameCode, betCost);
        }

        const ctx: any = {
          operatorId,
          playerId: String(round.playerId),
          currency: round.currency,
          gameId: round.gameCode,
          bet: bet.toFixed(8),
          clientSeed,
          serverSeed: round.serverSeed,
          nonce: nextNonce,
          sessionData, // ✅ IMPORTANT for FS
        };

        const { result, nextSessionData } = await engine.handle(ctx, {
          type: 'SPIN',
          payload: { roundId: round.id },
        });

        // ✅ Persist FS session
        await this.prisma.slotSession.update({
          where: {
            operatorId_playerId_gameCode: {
              operatorId,
              playerId: player.id,
              gameCode: round.gameCode,
            },
          },
          data: { data: JSON.stringify(nextSessionData || {}) },
        });

        // Grid is in REELS_STOP
        const reelsStop = (result as any).events?.find((e: any) => e.t === 'REELS_STOP');
        const grid = reelsStop?.d?.grid ?? null;

        winAmount = Number((result as any).win);

        const jackpotRes = await this.jackpot.tryHit(
          round.gameCode,
          round.serverSeed,
          clientSeed,
          nextNonce
        );

        if (jackpotRes.hit) {
          winAmount += jackpotRes.amount;
        }

        roundResult = {
          type: 'SLOT',
          bet,
          betCost, // ✅ 0 during FS
          win: winAmount,
          jackpot: {
            hit: jackpotRes.hit,
            amount: jackpotRes.amount,
          },
          grid,
          events: (result as any).events ?? [],
          freeSpins: {
            before: fsRemainingBefore,
            after: Number((nextSessionData as any)?.freeSpinsRemaining ?? 0),
            active: Number((nextSessionData as any)?.freeSpinsRemaining ?? 0) > 0,
            multiplier: Number((nextSessionData as any)?.freeSpinMultiplier ?? 1),
          },
        };
      }

      // ------------------ CRASH ------------------
      else if (kind === 'CRASH') {
        await this.wallet.debit(operatorId, player.externalId, round.currency, bet, {
          idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:debit` : undefined,
          referenceId: `round:${round.id}`,
          meta: { gameCode: round.gameCode, kind },
        });

        const cashoutAt = Number((dto as any).crashCashoutAt);
        const playRes = this.crash.play({
          serverSeed: round.serverSeed,
          clientSeed,
          nonce: nextNonce,
          bet,
          cashoutAt,
        });

        winAmount = Number(playRes.winAmount);
        roundResult = playRes.roundResult;
      }

      // ------------------ DICE ------------------
      else {
        await this.wallet.debit(operatorId, player.externalId, round.currency, bet, {
          idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:debit` : undefined,
          referenceId: `round:${round.id}`,
          meta: { gameCode: round.gameCode, kind },
        });

        const mode = (dto as any).diceMode as any;
        const target = Number((dto as any).diceTarget);

        const playRes = await this.dice.play({
          serverSeed: round.serverSeed,
          clientSeed,
          nonce: nextNonce,
          bet,
          mode,
          target,
          roundId: round.id,
        } as any);

        winAmount = Number(playRes.winAmount);
        roundResult = playRes.roundResult;
      }

      let win = stableNum(winAmount);
      // ==========================
      // 🎯 PROGRESSIVE JACKPOT (SLOT only)
      // ==========================
      if (kind === 'SLOT') {
        const jp = await this.prisma.progressiveJackpot.upsert({
          where: { gameCode: round.gameCode },
          update: {},
          create: {
            gameCode: round.gameCode,
            pool: 1000, // seed initial
            hitRate: 0.00002, // 0.002%
          },
        });

        const contribution = bet * 0.01; // 1% goes to jackpot

        await this.prisma.progressiveJackpot.update({
          where: { gameCode: round.gameCode },
          data: {
            pool: { increment: contribution },
          },
        });

        // RNG deterministic jackpot trigger
        const jpRoll = fairnessU01(round.serverSeed, clientSeed, nextNonce, 'jackpot');

        if (jpRoll < Number(jp.hitRate)) {
          const jackpotWin = Number(jp.pool);

          win += jackpotWin;

          await this.prisma.progressiveJackpot.update({
            where: { gameCode: round.gameCode },
            data: { pool: 1000 }, // reset
          });

          (roundResult as any).jackpot = {
            won: true,
            amount: jackpotWin,
          };

          (roundResult as any).events = [
            ...(((roundResult as any).events) || []),
            { t: 'BONUS_TRIGGER', ts: Date.now(), d: { type: 'JACKPOT', amount: jackpotWin } },
          ];
        } else {
          (roundResult as any).jackpot = {
            won: false,
            pool: Number(jp.pool),
          };
        }
      }

      // ✅ Credit win
      if (win > 0) {
        await this.wallet.credit(operatorId, player.externalId, round.currency, win, {
          idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:credit` : undefined,
          referenceId: `round:${round.id}`,
          meta: { gameCode: round.gameCode, kind },
        });
      }

      // ✅ Store betAmount as REAL cost (0 if FS)
      const betAmountToStore =
        kind === 'SLOT' && typeof roundResult?.betCost === 'number'
          ? (roundResult.betCost as number)
          : bet;

      const updatedRound = await this.prisma.gameRound.update({
        where: { id: round.id },
        data: {
          betAmount: betAmountToStore.toFixed(8),
          winAmount: win.toFixed(8),
          clientSeed,
          nonce: nextNonce,
          status: 'SETTLED',
          settledAt: new Date(),
          result: JSON.stringify(roundResult),
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

      // ✅ Save idempotency response
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
    const round = await this.prisma.gameRound.findFirst({
      where: { id: roundId, operatorId },
    });
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
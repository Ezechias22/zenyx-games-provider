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

import { CrashService } from './crash/crash.service';
import { DiceService } from './dice/dice.service';

import { GameInitNormalizedDto, GamePlayDto } from './dto/game.dto';

import { EngineRegistry } from './core/registry';
import { ZenyxRoundResult } from './core/events';
import { mustGetCatalogItem } from './catalog';

// ✅ Slot engines “config-based” (pas d’emoji)
import { FRUIT_CLASSIC_ENGINE } from './slots/fruit_classic/slot.engine';
import { EGYPT_RICHES_ENGINE } from './slots/egypt_riches/slot.engine';
import { JUNGLE_WILD_ENGINE } from './slots/jungle_wild/slot.engine';
import { LUXURY_GOLD_ENGINE } from './slots/luxury_gold/slot.engine';
import { DIAMOND_RUSH_ENGINE } from './slots/diamond_rush/slot.engine';
import { FIRE_REELS_ENGINE } from './slots/fire_reels/slot.engine';
import { MYSTIC_FORTUNE_ENGINE } from './slots/mystic_fortune/slot.engine';

function stableNum(n: number): number {
  if (!Number.isFinite(n) || n < 0) throw new BadRequestException('Invalid number');
  return n;
}

// ✅ IDs EXACTS renvoyés par /v1/public/games (catalog)
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

function extractGridFromRound(rr: ZenyxRoundResult): string[][] | null {
  const ev = (rr.events || []).find((e: any) => e?.t === 'REELS_STOP');
  const grid = ev?.d?.grid;
  if (!Array.isArray(grid)) return null;
  // grid attendu: string[][]
  if (Array.isArray(grid[0])) return grid as string[][];
  return null;
}

function flattenGrid(grid: string[][] | null): string[] {
  if (!grid) return [];
  const out: string[] = [];
  for (const row of grid) {
    if (Array.isArray(row)) out.push(...row.map(String));
  }
  return out;
}

@Injectable()
export class GamesService {
  // ✅ Registry local des engines SLOT
  private slotRegistry = new EngineRegistry();

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private wallet: WalletService,
    private fairness: FairnessService,

    private crash: CrashService,
    private dice: DiceService,
  ) {
    // ✅ register slots
    this.slotRegistry.register(FRUIT_CLASSIC_ENGINE);
    this.slotRegistry.register(EGYPT_RICHES_ENGINE);
    this.slotRegistry.register(JUNGLE_WILD_ENGINE);
    this.slotRegistry.register(LUXURY_GOLD_ENGINE);
    this.slotRegistry.register(DIAMOND_RUSH_ENGINE);
    this.slotRegistry.register(FIRE_REELS_ENGINE);
    this.slotRegistry.register(MYSTIC_FORTUNE_ENGINE);
  }

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
    const item = mustGetCatalogItem(gameCode);

    return {
      provider: 'ZENYX GAMES',
      roundId: round.id,
      gameCode,
      kind,
      rtp: item.rtp,
      volatility: item.volatility,
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
      let winAmount = 0;
      let roundResult: any = {};

      if (kind === 'SLOT') {
        const item = mustGetCatalogItem(round.gameCode);
        const engine: any = this.slotRegistry.get(round.gameCode);

        const ctx: any = {
          operatorId,
          playerId: player.externalId,
          currency: round.currency,
          gameId: round.gameCode,
          bet: String(bet), // decimal string
          clientSeed,
          serverSeed: round.serverSeed,
          nonce: nextNonce,
          sessionData: {}, // (bonus later)
        };

        const action = { type: 'SPIN', payload: { roundId: round.id } };

        const handled = await engine.handle(ctx, action);
        const rr: ZenyxRoundResult = handled.result;

        const grid = extractGridFromRound(rr);
        const symbols = flattenGrid(grid);

        // ✅ Convertir en format attendu par game-server
        roundResult = {
          type: 'SLOT',
          grid,                 // ✅ IMPORTANT
          symbols,              // ✅ IMPORTANT (liste de IDs)
          multiplier: 0,
          bet: Number(bet),
          win: Number(rr.win),
          rtp: item.rtp,
          volatility: item.volatility,
        };

        winAmount = Number(rr.win);
      } else if (kind === 'CRASH') {
        const cashoutAt = Number(dto.crashCashoutAt);
        const playRes = this.crash.play({
          serverSeed: round.serverSeed,
          clientSeed,
          nonce: nextNonce,
          bet,
          cashoutAt,
        });
        winAmount = Number(playRes.winAmount);
        roundResult = playRes.roundResult;
      } else {
        const mode = dto.diceMode as any;
        const target = Number(dto.diceTarget);

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

      const win = stableNum(winAmount);

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
        result: JSON.parse(updatedRound.result), // ✅ contient grid maintenant
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

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
import { ProviderService } from '../provider/provider.service';

import { BuyFreeSpinsService } from './features/buyfs.service';
import { GambleService } from './features/gamble.service';
import { JackpotService } from './features/jackpot.service';
import { RtpService } from './features/rtp.service';
import { BonusService } from './features/bonus.service';

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

type OperatorSettings = {
  targetRtp: number;
  buyFsMul: number;
  bonusChance: number;
  jackpotRate: number;
  jackpotChance: number;
};

function normalizeSettings(s: Partial<OperatorSettings> | null | undefined): OperatorSettings {
  const targetRtp = Number(s?.targetRtp ?? 0.96);
  const buyFsMul = Number(s?.buyFsMul ?? 100);
  const bonusChance = Number(s?.bonusChance ?? 0.0);
  const jackpotRate = Number(s?.jackpotRate ?? 0.0);
  const jackpotChance = Number(s?.jackpotChance ?? 0.0);

  return {
    targetRtp: Number.isFinite(targetRtp) && targetRtp > 0 ? targetRtp : 0.96,
    buyFsMul: Number.isFinite(buyFsMul) && buyFsMul > 0 ? buyFsMul : 100,
    bonusChance: Number.isFinite(bonusChance) && bonusChance >= 0 ? bonusChance : 0,
    jackpotRate: Number.isFinite(jackpotRate) && jackpotRate >= 0 ? jackpotRate : 0,
    jackpotChance: Number.isFinite(jackpotChance) && jackpotChance >= 0 ? jackpotChance : 0,
  };
}

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
    private buyfs: BuyFreeSpinsService,
    private gambleSvc: GambleService,
    private jackpot: JackpotService,
    private rtp: RtpService,
    private bonus: BonusService,
  ) {}

  private kindOf(gameCode: string): 'SLOT' | 'CRASH' | 'DICE' {
    const code = (gameCode || '').trim();
    if (SLOT_GAMES.has(code)) return 'SLOT';
    if (CRASH_GAMES.has(code)) return 'CRASH';
    if (DICE_GAMES.has(code)) return 'DICE';
    throw new BadRequestException('Unknown gameCode');
  }

  private async loadOperatorSettings(operatorId: string, gameCode: string): Promise<OperatorSettings> {
    // Si OperatorGameSettings n'existe pas encore en DB, tu peux mettre try/catch.
    // Mais si tu as fait la migration, ça marche direct.
    try {
      const s = await this.prisma.operatorGameSettings.upsert({
        where: { operatorId_gameCode: { operatorId, gameCode } },
        update: {},
        create: { operatorId, gameCode },
      });
      return normalizeSettings(s as any);
    } catch {
      // fallback safe si table non encore migrée
      return normalizeSettings(null);
    }
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
    const locked = await this.redis.acquireLock(lockKey, 7_000);
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

      const player = await this.prisma.player.findUnique({ where: { id: round.playerId } });
      if (!player) throw new BadRequestException('Player not found');

      const nextNonce = round.nonce + 1;
      const clientSeed = dto.clientSeed || round.clientSeed;

      let winAmount = 0;
      let roundResult: any = {};

      // ✅ load per operator/game settings
      const settings = await this.loadOperatorSettings(operatorId, round.gameCode);

      if (kind === 'SLOT') {
        const engine: any = this.providerSvc.getEngine(round.gameCode);

        // ✅ Load persistent sessionData
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

        // ===========
        // GAMBLE (double or nothing) — no new round, uses THIS roundId
        // ===========
        if (dto.gamble) {
          const stake = this.gambleSvc.parseStake(sessionData?.lastWin);
          if (!sessionData?.lastWinGamblable) throw new BadRequestException('Nothing to gamble');

          await this.wallet.debit(operatorId, player.externalId, round.currency, stake, {
            idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:gamble:debit` : undefined,
            referenceId: `round:${round.id}:gamble`,
            meta: { gameCode: round.gameCode, kind: 'SLOT', feature: 'GAMBLE' },
          });

          const g = this.gambleSvc.resolve({
            serverSeed: round.serverSeed,
            clientSeed,
            nonce: nextNonce,
            pick: dto.gamblePick,
          });

          let payout = 0;
          if (g.win) {
            payout = stake * 2;
            await this.wallet.credit(operatorId, player.externalId, round.currency, payout, {
              idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:gamble:credit` : undefined,
              referenceId: `round:${round.id}:gamble`,
              meta: { gameCode: round.gameCode, kind: 'SLOT', feature: 'GAMBLE' },
            });
          }

          sessionData.lastWinGamblable = false;
          sessionData.lastWin = String(g.win ? payout : 0);

          await this.prisma.slotSession.update({
            where: {
              operatorId_playerId_gameCode: {
                operatorId,
                playerId: player.id,
                gameCode: round.gameCode,
              },
            },
            data: { data: JSON.stringify(sessionData || {}) },
          });

          const balance = await this.wallet.getBalance(operatorId, player.externalId, round.currency);

          roundResult = {
            type: 'SLOT',
            feature: 'GAMBLE',
            stake,
            result: g.win ? 'WIN' : 'LOSE',
            color: g.color,
            roll: g.roll,
            win: g.win ? payout : 0,
            events: [
              { t: 'GAMBLE_START', ts: Date.now(), d: { stake, pick: dto.gamblePick ?? null } },
              { t: 'GAMBLE_RESULT', ts: Date.now(), d: { win: g.win, payout, color: g.color, roll: g.roll } },
            ],
          };

          const updatedRound = await this.prisma.gameRound.update({
            where: { id: round.id },
            data: {
              betAmount: '0',
              winAmount: String(g.win ? payout : 0),
              clientSeed,
              nonce: nextNonce,
              status: 'SETTLED',
              settledAt: new Date(),
              result: JSON.stringify(roundResult),
            },
          });

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
        }

        const fsRemainingBefore = Number(sessionData?.freeSpinsRemaining ?? 0);
        const inFS = fsRemainingBefore > 0;

        // ===========
        // BUY FS (paid action)
        // ===========
        if (dto.buyFreeSpins) {
          if (inFS) throw new BadRequestException('Already in FREE_SPINS');

          // ✅ dynamic multiplier from OperatorGameSettings
          const { cost } = this.buyfs.getCost(round.gameCode, bet, settings.buyFsMul);

          await this.wallet.debit(operatorId, player.externalId, round.currency, cost, {
            idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:buyfs:debit` : undefined,
            referenceId: `round:${round.id}:buyfs`,
            meta: { gameCode: round.gameCode, kind: 'SLOT', feature: 'BUY_FS' },
          });

          const ctx: any = {
            operatorId,
            playerId: String(round.playerId),
            currency: round.currency,
            gameId: round.gameCode,
            bet: bet.toFixed(8),
            clientSeed,
            serverSeed: round.serverSeed,
            nonce: nextNonce,
            sessionData,
            settings,
          };

          const { result, nextSessionData } = await engine.handle(ctx, {
            type: 'BUY_FS',
            payload: { roundId: round.id },
          });

          await this.prisma.slotSession.update({
            where: {
              operatorId_playerId_gameCode: { operatorId, playerId: player.id, gameCode: round.gameCode },
            },
            data: { data: JSON.stringify(nextSessionData || {}) },
          });

          winAmount = 0;
          roundResult = {
            type: 'SLOT',
            bet,
            betCost: cost,
            win: 0,
            grid: null,
            events: (result as any).events ?? [],
            freeSpins: {
              before: fsRemainingBefore,
              after: Number((nextSessionData as any)?.freeSpinsRemaining ?? 0),
              active: Number((nextSessionData as any)?.freeSpinsRemaining ?? 0) > 0,
              multiplier: Number((nextSessionData as any)?.freeSpinMultiplier ?? 1),
            },
            buyFreeSpins: true,
          };

          const updatedRound = await this.prisma.gameRound.update({
            where: { id: round.id },
            data: {
              betAmount: Number(cost).toFixed(8),
              winAmount: '0.00000000',
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
        }

        const betCost = inFS ? 0 : bet;

        // ✅ Debit only if not in free spins
        if (betCost > 0) {
          await this.wallet.debit(operatorId, player.externalId, round.currency, betCost, {
            idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:debit` : undefined,
            referenceId: `round:${round.id}`,
            meta: { gameCode: round.gameCode, kind },
          });
        }

        const cfg = (engine as any)?.config as any;

        // ✅ jackpot contribution on paid spins (dynamic rate overrides config if provided)
        const jackpotEnabled = Boolean(cfg?.jackpot?.enabled);
        const seed = Number(cfg?.jackpot?.seed ?? 0);

        const dynRate = settings.jackpotRate;
        const cfgRate = Number(cfg?.jackpot?.contributionRate ?? 0);
        const rate = dynRate > 0 ? dynRate : cfgRate;

        if (betCost > 0 && jackpotEnabled && Number.isFinite(seed) && seed >= 0 && Number.isFinite(rate) && rate > 0) {
          await this.jackpot.addContribution(operatorId, round.gameCode, betCost * rate, seed);
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
          sessionData,
          settings,
        };

        const { result, nextSessionData } = await engine.handle(ctx, {
          type: 'SPIN',
          payload: { roundId: round.id },
        });

        // ✅ Save session data
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

        const reelsStop = (result as any).events?.find((e: any) => e.t === 'REELS_STOP');
        const grid = reelsStop?.d?.grid ?? null;

        winAmount = Number((result as any).win);

        // ✅ RTP dynamique (par operator/game)
        // loadFactor cache optionnel : ici on calcule juste factor depuis settings
        await this.rtp.loadFactor(operatorId, round.gameCode)
        const applied = this.rtp.apply(winAmount, round.gameCode, operatorId)
        winAmount = applied.win

        // ✅ Bonus Wheel (paid spins only, configurable)
        let bonusInfo: any = null;
        if (betCost > 0 && settings.bonusChance > 0) {
          const should = this.bonus.shouldTrigger({
            serverSeed: round.serverSeed,
            clientSeed,
            nonce: nextNonce,
            chance: settings.bonusChance,
          });

          if (should) {
            const b = this.bonus.spin({
              serverSeed: round.serverSeed,
              clientSeed,
              nonce: nextNonce,
              bet,
            });

            bonusInfo = b;

            // cash bonus
            if (b.win > 0) winAmount += b.win;

            // FS bonus
            if (b.prize?.type === 'FS') {
              const add = Number(b.prize.fs ?? 0);
              if (Number.isFinite(add) && add > 0) {
                (nextSessionData as any) = nextSessionData || {};
                const cur = Number((nextSessionData as any).freeSpinsRemaining ?? 0);
                (nextSessionData as any).freeSpinsRemaining = cur + add;
              }
            }
          }
        }

        // ✅ jackpot tryWin on paid spins only (dynamic chance overrides config if provided)
        let jackpotInfo: any = null;
        const dynChance = settings.jackpotChance;
        const cfgChance = Number(cfg?.jackpot?.chance ?? 0);
        const chance = dynChance > 0 ? dynChance : cfgChance;

        if (betCost > 0 && jackpotEnabled && Number.isFinite(seed) && seed >= 0 && Number.isFinite(chance) && chance > 0) {
          const maxPayout = cfg?.jackpot?.maxPayout != null ? Number(cfg.jackpot.maxPayout) : undefined;

          const jw = await this.jackpot.tryWin({
            operatorId,
            gameCode: round.gameCode,
            seed,
            chance,
            maxPayout,
            serverSeed: round.serverSeed,
            clientSeed,
            nonce: nextNonce,
          });

          jackpotInfo = jw;
          if (jw.won && jw.payout > 0) {
            winAmount += jw.payout;
          }
        }

        // ✅ Save session data AGAIN if bonus modified it (FS added)
        if (bonusInfo?.prize?.type === 'FS') {
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
        }

        roundResult = {
          type: 'SLOT',
          bet,
          betCost,
          win: winAmount,
          grid,
          events: [
            ...(result as any).events ?? [],
            { t: 'RTP_APPLIED', ts: Date.now(), d: { factor: applied.factor, targetRtp: settings.targetRtp } },
            ...(bonusInfo ? bonusInfo.events : []),
            ...(jackpotInfo
              ? [
                  { t: 'JACKPOT_METER_UPDATE', ts: Date.now(), d: { meterBefore: jackpotInfo.meterBefore, meterAfter: jackpotInfo.meterAfter } },
                  ...(jackpotInfo.won ? [{ t: 'JACKPOT_WIN', ts: Date.now(), d: { payout: jackpotInfo.payout, roll: jackpotInfo.roll } }] : []),
                ]
              : []),
          ],
          freeSpins: {
            before: fsRemainingBefore,
            after: Number((nextSessionData as any)?.freeSpinsRemaining ?? 0),
            active: Number((nextSessionData as any)?.freeSpinsRemaining ?? 0) > 0,
            multiplier: Number((nextSessionData as any)?.freeSpinMultiplier ?? 1),
          },
          settings: {
            targetRtp: settings.targetRtp,
            buyFsMul: settings.buyFsMul,
            bonusChance: settings.bonusChance,
            jackpotRate: settings.jackpotRate,
            jackpotChance: settings.jackpotChance,
          },
        };
      } else if (kind === 'CRASH') {
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
      } else {
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

      const win = stableNum(winAmount);

      if (win > 0) {
        await this.wallet.credit(operatorId, player.externalId, round.currency, win, {
          idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}:credit` : undefined,
          referenceId: `round:${round.id}`,
          meta: { gameCode: round.gameCode, kind },
        });
      }

      // ✅ betAmount stocké = coût réel (0 si FS)
      const betAmountToStore =
        kind === 'SLOT' && typeof roundResult?.betCost === 'number'
          ? (roundResult.betCost as number)
          : bet;

      const updatedRound = await this.prisma.gameRound.update({
        where: { id: round.id },
        data: {
          betAmount: Number(betAmountToStore).toFixed(8),
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
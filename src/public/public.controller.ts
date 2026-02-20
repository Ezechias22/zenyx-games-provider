import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import { join } from 'path';
import * as fs from 'fs/promises';

import { RedisService } from '../common/redis/redis.service';
import { GamesService } from '../games/games.service';
import { PublicGuard } from './public.guard';
import { PublicPlayDto, PublicSessionDto } from './dto/public.dto';

import { getCatalogList } from '../games/catalog';

function randomId(): string {
  return randomBytes(16).toString('hex');
}

async function listSymbolPaths(gameId: string): Promise<string[]> {
  try {
    const dir = join(process.cwd(), 'public', 'assets', gameId, 'symbols');
    const files = await fs.readdir(dir);
    return files
      .filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f))
      .map((f) => `/assets/${gameId}/symbols/${f}`);
  } catch {
    return [];
  }
}

function cleanBaseUrl(u: string) {
  return String(u || '').trim().replace(/\/+$/, '');
}

/**
 * Le provider renvoie parfois une grid "colonnes" (5 colonnes x 3 lignes),
 * mais le game-server affiche plus simplement une grid "lignes" (3 lignes x 5 colonnes).
 */
function normalizeGridToRows(grid: any): string[][] | null {
  if (!Array.isArray(grid) || grid.length === 0) return null;

  // Si c'est déjà 3 lignes (rows) => 3 arrays de longueur 5
  if (grid.length === 3 && Array.isArray(grid[0]) && grid[0].length === 5) {
    return grid as string[][];
  }

  // Si c'est 5 colonnes (cols) => 5 arrays de longueur 3, on transpose en 3x5
  if (grid.length === 5 && Array.isArray(grid[0]) && grid[0].length === 3) {
    const rows = 3;
    const cols = 5;
    const out: string[][] = Array.from({ length: rows }, () => Array(cols).fill(''));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        out[r][c] = String(grid[c][r] ?? '');
      }
    }
    return out;
  }

  // Format inconnu -> on laisse tel quel si c'est 2D
  if (Array.isArray(grid[0])) return grid as string[][];
  return null;
}

/**
 * Mapping minimal pour éviter "Invalid symbol cell".
 * - Si la cell est déjà un filename (ex: "wild", "scatter", "cherry") => ok
 * - Si c'est "W"/"S" => map vers wild/scatter
 * - Si c'est vide => "unknown"
 *
 * NOTE: Si ton game-server attend des URL directes, tu peux switcher pour renvoyer des URL ici.
 * Pour l’instant, on renvoie des "keys" propres et stables.
 */
function normalizeSymbolKey(cell: any): string {
  const v = String(cell ?? '').trim();
  if (!v) return 'unknown';

  if (v === 'W') return 'wild';
  if (v === 'S') return 'scatter';

  // sécurité: éviter caractères cassés
  // (on garde lettres/chiffres/_/-, sinon on met unknown)
  if (!/^[a-zA-Z0-9_\-]+$/.test(v)) return v; // on ne casse pas si tu utilises EG1/EG2 etc.

  return v;
}

@ApiTags('public')
@ApiSecurity('x-public-token')
@ApiSecurity('x-operator-key')
@Controller('public')
@UseGuards(PublicGuard)
export class PublicController {
  constructor(
    private readonly redis: RedisService,
    private readonly games: GamesService,
  ) {}

  /**
   * GET /v1/public/games
   * Catalogue public utilisé par le GAME SERVER (iframe).
   */
  @Get('games')
  async gamesList() {
    const list = getCatalogList();

    const out = await Promise.all(
      list.map(async (g) => {
        const assets: any = {
          cover: g.assets.cover,
          background: g.assets.background,
        };

        if (g.kind === 'SLOT') {
          assets.symbols = await listSymbolPaths(g.id);
        }

        return {
          id: g.id,
          name: g.name,
          kind: g.kind,
          rtp: g.rtp,
          volatility: g.volatility,
          ui: g.ui,
          assets,
        };
      }),
    );

    return out;
  }

  /**
   * POST /v1/public/session
   * Crée session publique + renvoie launchUrl (DOIT POINTER VERS LE PROVIDER)
   */
  @Post('session')
  async createSession(@Body() dto: PublicSessionDto, @Req() req: any) {
    const operatorId = req.operator.id;

    // 1) init round côté provider
    const initRes = await this.games.init(operatorId, {
      gameCode: dto.gameCode,
      playerExternalId: dto.playerExternalId,
      currency: dto.currency,
      clientSeed: dto.clientSeed,
    });

    // 2) session publique
    const sessionId = `sess_${randomId()}`;
    const ttl = Number(process.env.PUBLIC_SESSION_TTL_SEC || '3600');

    const payload = {
      operatorId,
      roundId: initRes.roundId,
      gameCode: initRes.gameCode,
      playerExternalId: dto.playerExternalId,
      currency: dto.currency,
      createdAt: new Date().toISOString(),
    };

    await this.redis.setJson(`public:session:${sessionId}`, payload, ttl);

    // ✅ 3) launchUrl -> PROVIDER + /v1/launch (globalPrefix)
    const apiPrefix = (process.env.API_BASE_PATH || 'v1').replace(/^\/+/, '');

    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : cleanBaseUrl(process.env.PUBLIC_BASE_URL || '');

    const resolvedBase = cleanBaseUrl(baseUrl);

    if (!resolvedBase) {
      throw new BadRequestException(
        'Missing RAILWAY_PUBLIC_DOMAIN or PUBLIC_BASE_URL for launchUrl',
      );
    }

    // IMPORTANT: /v1/launch (pas /launch)
    const launchUrl = `${resolvedBase}/${apiPrefix}/launch?s=${encodeURIComponent(
      sessionId,
    )}`;

    return {
      sessionId,
      launchUrl,
      ttlSec: ttl,
    };
  }

  /**
   * POST /v1/public/play
   * Appelé UNIQUEMENT par le game-server.
   *
   * FIX IMPORTANT:
   * - Si "Round already played", on recrée automatiquement un nouveau round pour le MÊME sessionId.
   * - On normalise result.grid en 3x5 (lignes) et on nettoie les symbol keys.
   */
  @Post('play')
  async play(@Body() dto: PublicPlayDto, @Req() req: any) {
    const operatorId = req.operator.id;

    const key = `public:session:${dto.sessionId}`;
    const session = await this.redis.getJson<any>(key);

    if (!session || session.operatorId !== operatorId) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const tryPlay = async (roundId: string) => {
      return this.games.play(operatorId, {
        roundId,
        bet: dto.bet,
        clientSeed: dto.clientSeed,
        idempotencyKey: dto.idempotencyKey,
      });
    };

    let res: any;

    try {
      res = await tryPlay(session.roundId);
    } catch (e: any) {
      const msg =
        e?.response?.message ||
        e?.message ||
        '';

      // ✅ Si le round est déjà joué, on init un NOUVEAU round et on rejoue
      if (String(msg).includes('Round already played')) {
        const initRes = await this.games.init(operatorId, {
          gameCode: session.gameCode,
          playerExternalId: session.playerExternalId,
          currency: session.currency,
          clientSeed: dto.clientSeed,
        });

        session.roundId = initRes.roundId;
        await this.redis.setJson(key, session, Number(process.env.PUBLIC_SESSION_TTL_SEC || '3600'));

        res = await tryPlay(session.roundId);
      } else {
        throw e;
      }
    }

    // Normalisation SLOT grid + symbols
    try {
      if (res?.kind === 'SLOT' && res?.result) {
        const grid = normalizeGridToRows(res.result.grid);
        if (grid) {
          res.result.grid = grid.map((row) => row.map(normalizeSymbolKey));
        }
        if (Array.isArray(res.result.symbols)) {
          res.result.symbols = res.result.symbols.map(normalizeSymbolKey);
        }
      }
    } catch {
      // no-op : on ne casse pas la réponse
    }

    return res;
  }
}
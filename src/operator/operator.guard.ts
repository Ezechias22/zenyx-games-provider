import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { OperatorService } from './operator.service';
import {
  hmacSha256Hex,
  sha256Hex,
  timingSafeEqualHex,
} from '../common/security/crypto.util';
import { isIpAllowed } from '../common/security/ip.util';

function getRawBody(req: Request): string {
  // NOTE: We sign a stable JSON string for dev simplicity.
  // In production, use raw-body middleware and sign raw bytes to avoid stringify differences.
  return JSON.stringify(req.body ?? {});
}

function getClientIp(req: Request): string {
  // 1) x-forwarded-for (if behind proxy)
  const xff = req.header('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return normalizeIp(first);
  }

  // 2) express req.ip
  const ip = (req.ip || '').toString();
  if (ip) return normalizeIp(ip);

  // 3) socket remoteAddress
  const remote = (req.socket?.remoteAddress || '').toString();
  return normalizeIp(remote);
}

function normalizeIp(ip: string): string {
  let v = (ip || '').trim();

  // Remove IPv6 zone index if present (rare)
  // e.g. "fe80::1%lo0"
  const zoneIdx = v.indexOf('%');
  if (zoneIdx !== -1) v = v.substring(0, zoneIdx);

  // Common localhost representations
  if (v === '::1') return '127.0.0.1';

  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  if (v.startsWith('::ffff:')) {
    const mapped = v.substring('::ffff:'.length);
    if (mapped) return mapped;
  }

  return v;
}

@Injectable()
export class OperatorAuthGuard implements CanActivate {
  constructor(private operatorService: OperatorService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();

    const apiKey = String(req.header('X-API-KEY') || '');
    const signature = String(req.header('X-SIGNATURE') || '');
    const ts = String(req.header('X-TIMESTAMP') || '');

    if (!apiKey || !signature || !ts) {
      throw new UnauthorizedException('Missing operator headers');
    }

    const op = await this.operatorService.findByApiKey(apiKey);
    if (!op || !op.isActive) {
      throw new UnauthorizedException('Operator not active');
    }

    // --- IP Whitelist ---
    const ip = getClientIp(req);

    // Optional dev bypass (set in .env): DISABLE_IP_WHITELIST=true
    const disableIpWhitelist =
      String(process.env.DISABLE_IP_WHITELIST || '').toLowerCase() === 'true';

    if (!disableIpWhitelist) {
      const whitelist = this.operatorService.parseWhitelistJson(op.ipWhitelist);

      // DEV log to know what the server actually sees
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log(
          '[OperatorAuthGuard] client ip =',
          ip,
          'req.ip =',
          req.ip,
          'remote =',
          req.socket?.remoteAddress,
          'xff =',
          req.header('x-forwarded-for'),
          'whitelist =',
          whitelist,
        );
      }

      if (!isIpAllowed(ip, whitelist)) {
        throw new UnauthorizedException('IP not allowed');
      }
    }

    // --- Timestamp window ---
    const skewMax = Number(process.env.SIGNATURE_MAX_SKEW_MS || '300000');
    const now = Date.now();
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > skewMax) {
      throw new UnauthorizedException(
        'Signature timestamp outside allowed window',
      );
    }

    // --- Signature verification ---
    const body = getRawBody(req);
    const payload = `${ts}.${req.method.toUpperCase()}.${req.originalUrl}.${sha256Hex(
      body,
    )}`;

    const secret = this.operatorService.getOperatorSecretPlain(op as any);
    const expectedSig = hmacSha256Hex(secret, payload);

    if (!timingSafeEqualHex(signature, expectedSig)) {
      throw new UnauthorizedException('Invalid signature');
    }

    (req as any).operator = { id: op.id, apiKey: op.apiKey, name: op.name };
    return true;
  }
}

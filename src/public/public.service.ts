import { Injectable, UnauthorizedException } from '@nestjs/common';
import crypto from 'crypto';

export type LaunchTokenPayload = {
  v: 1;
  operatorId: string;
  roundId: string;
  gameCode: string;
  currency: string;
  exp: number; // unix seconds
};

function base64url(input: Buffer | string) {
  const b = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return b
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function base64urlJson(obj: any) {
  return base64url(JSON.stringify(obj));
}

function hmacSha256(secret: string, data: string) {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest();
}

@Injectable()
export class PublicLaunchService {
  private get secret(): string {
    const s = process.env.JWT_LAUNCH_SECRET || '';
    if (!s) {
      throw new Error('Missing JWT_LAUNCH_SECRET env');
    }
    return s;
  }

  signLaunchToken(payload: Omit<LaunchTokenPayload, 'v'>): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const full: LaunchTokenPayload = { v: 1, ...payload };

    const h = base64urlJson(header);
    const p = base64urlJson(full);
    const data = `${h}.${p}`;
    const sig = base64url(hmacSha256(this.secret, data));
    return `${data}.${sig}`;
  }

  verifyLaunchToken(token: string): LaunchTokenPayload {
    try {
      const parts = String(token || '').split('.');
      if (parts.length !== 3) throw new Error('bad token');

      const [h, p, s] = parts;
      const data = `${h}.${p}`;
      const expected = base64url(hmacSha256(this.secret, data));

      // timing safe compare
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(s, 'utf8');
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        throw new Error('bad signature');
      }

      const payloadJson = Buffer.from(p.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8');
      const payload = JSON.parse(payloadJson) as LaunchTokenPayload;

      if (!payload?.operatorId || !payload?.roundId || !payload?.exp) throw new Error('bad payload');

      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) throw new Error('expired');

      return payload;
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired launch token');
    }
  }
}

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

function normalizeIp(ip: string): string {
  let v = (ip || '').trim();
  const zoneIdx = v.indexOf('%');
  if (zoneIdx !== -1) v = v.substring(0, zoneIdx);
  if (v === '::1') return '127.0.0.1';
  if (v.startsWith('::ffff:')) return v.substring('::ffff:'.length);
  return v;
}

function getClientIp(req: Request): string {
  const xff = req.header('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return normalizeIp(first);
  }
  const ip = (req.ip || '').toString();
  if (ip) return normalizeIp(ip);
  return normalizeIp((req.socket?.remoteAddress || '').toString());
}

function isIpAllowed(ip: string, whitelist: string[]): boolean {
  if (!whitelist?.length) return true; // si vide -> autoriser (ou mets false si tu veux strict)
  return whitelist.includes(ip);
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();

    const token = String(req.header('x-master-token') || '');
    const expected = String(process.env.MASTER_ADMIN_TOKEN || '');

    if (!token || !expected || token !== expected) {
      throw new UnauthorizedException('Invalid master token');
    }

    // Optionnel: whitelist IP admin (CSV)
    const adminIpCsv = String(process.env.ADMIN_IP_WHITELIST || '').trim();
    if (adminIpCsv) {
      const whitelist = adminIpCsv.split(',').map(s => s.trim()).filter(Boolean);
      const ip = getClientIp(req);
      if (!isIpAllowed(ip, whitelist)) {
        throw new UnauthorizedException('Admin IP not allowed');
      }
    }

    return true;
  }
}

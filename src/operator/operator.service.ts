import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { hashSecret, randomHex, verifySecret } from '../common/security/crypto.util';
import { encryptToBase64, decryptFromBase64 } from '../common/security/aes.util';
import { UpdateWhitelistDto } from './dto/update-whitelist.dto';
import { RotateSecretDto } from './dto/rotate-secret.dto';

type AuditMeta = {
  ip?: string;
  userAgent?: string;
  requestId?: string;
};

@Injectable()
export class OperatorService {
  constructor(private prisma: PrismaService) {}

  // ---------- ADMIN AUDIT ----------
  async auditAdminAction(params: {
    action: string;
    operatorId?: string;
    ip?: string;
    userAgent?: string;
    requestId?: string;
    details?: any;
  }) {
    const requestId = (params.requestId && String(params.requestId).trim()) || `req_${randomHex(12)}`;

    // operatorId is required by schema; for purely provider-level actions you can store a dummy one,
    // but here we always have operator context for our endpoints.
    if (!params.operatorId) return;

    await this.prisma.auditLog.create({
      data: {
        operatorId: params.operatorId,
        action: params.action,
        ip: params.ip || '',
        userAgent: params.userAgent || '',
        requestId,
        details: JSON.stringify(params.details ?? {}),
      },
    });
  }

  // ---------- CREATE ----------
  async createOperator(name: string, ipWhitelist: string[] = []) {
    const cleanName = String(name || '').trim();
    if (!cleanName) throw new BadRequestException('name is required');

    const whitelist = (ipWhitelist || []).map((x) => String(x).trim()).filter(Boolean);

    const apiKey = `op_${randomHex(16)}`;
    const apiSecretPlain = `sec_${randomHex(24)}`;
    const apiSecretHash = hashSecret(apiSecretPlain);
    const apiSecretEnc = encryptToBase64(apiSecretPlain);

    const operator = await this.prisma.operator.create({
      data: {
        name: cleanName,
        apiKey,
        apiSecretHash,
        apiSecretEnc,
        ipWhitelist: JSON.stringify(whitelist),
      },
      select: { id: true, name: true, apiKey: true, createdAt: true },
    });

    // Return secret once
    return { operator, apiSecret: apiSecretPlain };
  }

  // ---------- READ ----------
  async findByApiKey(apiKey: string) {
    return this.prisma.operator.findUnique({ where: { apiKey } });
  }

  async getOperatorAdmin(apiKey: string) {
    const key = String(apiKey || '').trim();
    if (!key) throw new BadRequestException('apiKey is required');

    const op = await this.prisma.operator.findUnique({
      where: { apiKey: key },
      select: {
        id: true,
        name: true,
        apiKey: true,
        ipWhitelist: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!op) throw new NotFoundException('Operator not found');

    return {
      operator: {
        ...op,
        ipWhitelist: this.parseWhitelistJson(op.ipWhitelist),
      },
    };
  }

  // ---------- WHITELIST UPDATE ----------
  async updateWhitelist(dto: UpdateWhitelistDto, audit?: AuditMeta) {
    const apiKey = String(dto.apiKey || '').trim();
    if (!apiKey) throw new BadRequestException('apiKey is required');

    const whitelist = (dto.ipWhitelist || []).map((x) => String(x).trim()).filter(Boolean);
    if (whitelist.length === 0) throw new BadRequestException('ipWhitelist must not be empty');

    const existing = await this.prisma.operator.findUnique({
      where: { apiKey },
      select: { id: true, name: true, apiKey: true, ipWhitelist: true, isActive: true },
    });
    if (!existing) throw new NotFoundException('Operator not found');

    const updated = await this.prisma.operator.update({
      where: { apiKey },
      data: {
        ipWhitelist: JSON.stringify(whitelist),
        isActive: typeof dto.isActive === 'boolean' ? dto.isActive : undefined,
      },
      select: {
        id: true,
        name: true,
        apiKey: true,
        ipWhitelist: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await this.auditAdminAction({
      action: 'OPERATOR_UPDATE_WHITELIST',
      operatorId: updated.id,
      ip: audit?.ip,
      userAgent: audit?.userAgent,
      requestId: audit?.requestId,
      details: {
        apiKey,
        before: {
          ipWhitelist: this.parseWhitelistJson(existing.ipWhitelist),
          isActive: existing.isActive,
        },
        after: {
          ipWhitelist: whitelist,
          isActive: updated.isActive,
        },
      },
    });

    return {
      operator: {
        id: updated.id,
        name: updated.name,
        apiKey: updated.apiKey,
        isActive: updated.isActive,
        ipWhitelist: whitelist,
        updatedAt: updated.updatedAt,
      },
    };
  }

  // ---------- ROTATE SECRET ----------
  async rotateSecret(dto: RotateSecretDto, audit?: AuditMeta) {
    const apiKey = String(dto.apiKey || '').trim();
    if (!apiKey) throw new BadRequestException('apiKey is required');

    const existing = await this.prisma.operator.findUnique({
      where: { apiKey },
      select: { id: true, name: true, apiKey: true, isActive: true },
    });
    if (!existing) throw new NotFoundException('Operator not found');

    const apiSecretPlain = `sec_${randomHex(24)}`;
    const apiSecretHash = hashSecret(apiSecretPlain);
    const apiSecretEnc = encryptToBase64(apiSecretPlain);

    const updated = await this.prisma.operator.update({
      where: { apiKey },
      data: {
        apiSecretHash,
        apiSecretEnc,
        isActive: typeof dto.isActive === 'boolean' ? dto.isActive : undefined,
      },
      select: { id: true, name: true, apiKey: true, isActive: true, updatedAt: true },
    });

    await this.auditAdminAction({
      action: 'OPERATOR_ROTATE_SECRET',
      operatorId: updated.id,
      ip: audit?.ip,
      userAgent: audit?.userAgent,
      requestId: audit?.requestId,
      details: {
        apiKey,
        note: 'Secret rotated; new secret returned once by API response',
        beforeIsActive: existing.isActive,
        afterIsActive: updated.isActive,
      },
    });

    return {
      operator: {
        id: updated.id,
        name: updated.name,
        apiKey: updated.apiKey,
        isActive: updated.isActive,
        updatedAt: updated.updatedAt,
      },
      apiSecret: apiSecretPlain, // RETURN ONCE
    };
  }

  // ---------- OPERATOR SECRET ----------
  getOperatorSecretPlain(operator: { apiSecretEnc: string }): string {
    return decryptFromBase64(operator.apiSecretEnc);
  }

  async validateOperatorSecret(apiKey: string, secret: string) {
    const op = await this.findByApiKey(apiKey);
    if (!op || !op.isActive) throw new UnauthorizedException('Operator not active');
    if (!verifySecret(secret, op.apiSecretHash)) throw new UnauthorizedException('Invalid operator secret');
    return op;
  }

  // ---------- UTILS ----------
  parseWhitelistJson(raw: string): string[] {
    try {
      const a = JSON.parse(raw);
      return Array.isArray(a) ? a.map(String) : [];
    } catch {
      return [];
    }
  }
}

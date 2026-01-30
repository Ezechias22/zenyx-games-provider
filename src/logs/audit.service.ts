import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async logOperatorEvent(params: {
    operatorId: string;
    action: string;
    ip: string;
    userAgent?: string;
    details?: Record<string, unknown>;
  }) {
    const requestId = uuidv4();
    await this.prisma.auditLog.create({
      data: {
        operatorId: params.operatorId,
        action: params.action,
        ip: params.ip,
        userAgent: params.userAgent,
        requestId,
        details: JSON.stringify(params.details || {}),
      },
    });
    return requestId;
  }
}

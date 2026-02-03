import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { OperatorService } from '../operator/operator.service';

@Injectable()
export class PublicGuard implements CanActivate {
  constructor(private operatorService: OperatorService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();

    const token = String(req.header('x-public-token') || '');
    if (!token || token !== String(process.env.PUBLIC_TOKEN || '')) {
      throw new UnauthorizedException('Invalid public token');
    }

    // On exige un operatorKey pour savoir quel operator utilise le provider
    const operatorKey = String(req.header('x-operator-key') || '');
    if (!operatorKey) {
      throw new UnauthorizedException('Missing x-operator-key');
    }

    const op = await this.operatorService.findByApiKey(operatorKey);
    if (!op || !op.isActive) {
      throw new UnauthorizedException('Operator not active');
    }

    (req as any).operator = { id: op.id, apiKey: op.apiKey, name: op.name };
    return true;
  }
}

import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OperatorService } from './operator.service';
import { CreateOperatorDto } from './dto/create-operator.dto';
import { UpdateWhitelistDto } from './dto/update-whitelist.dto';
import { RotateSecretDto } from './dto/rotate-secret.dto';

@ApiTags('operator')
@Controller('operator')
export class OperatorController {
  constructor(private readonly operatorService: OperatorService) {}

  private assertMaster(masterToken: string) {
    const expected = process.env.MASTER_ADMIN_TOKEN || '';
    if (!expected || masterToken !== expected) {
      throw new UnauthorizedException('Invalid master token');
    }
  }

  // --- CREATE (returns apiSecret ONCE) ---
  @Post('create')
  @ApiBearerAuth()
  async create(
    @Body() dto: CreateOperatorDto,
    @Headers('x-master-token') masterToken: string,
    @Headers('user-agent') userAgent: string,
    @Headers('x-request-id') requestId: string,
    @Ip() ip: string,
  ) {
    this.assertMaster(masterToken);

    const res = await this.operatorService.createOperator(dto.name, dto.ipWhitelist || []);

    await this.operatorService.auditAdminAction({
      action: 'OPERATOR_CREATE',
      ip,
      userAgent,
      requestId,
      details: {
        createdOperatorId: res.operator.id,
        apiKey: res.operator.apiKey,
        name: res.operator.name,
        ipWhitelist: dto.ipWhitelist || [],
      },
      operatorId: res.operator.id,
    });

    return { ...res, createdFromIp: ip };
  }

  // --- UPDATE WHITELIST (no secret) ---
  @Post('update-whitelist')
  @ApiBearerAuth()
  async updateWhitelist(
    @Body() dto: UpdateWhitelistDto,
    @Headers('x-master-token') masterToken: string,
    @Headers('user-agent') userAgent: string,
    @Headers('x-request-id') requestId: string,
    @Ip() ip: string,
  ) {
    this.assertMaster(masterToken);

    const res = await this.operatorService.updateWhitelist(dto, {
      ip,
      userAgent,
      requestId,
    });

    return { ...res, updatedFromIp: ip };
  }

  // --- GET OPERATOR (admin read) ---
  @Get('get/:apiKey')
  @ApiBearerAuth()
  async getOperator(
    @Param('apiKey') apiKey: string,
    @Headers('x-master-token') masterToken: string,
    @Headers('user-agent') userAgent: string,
    @Headers('x-request-id') requestId: string,
    @Ip() ip: string,
  ) {
    this.assertMaster(masterToken);

    const res = await this.operatorService.getOperatorAdmin(apiKey);

    await this.operatorService.auditAdminAction({
      action: 'OPERATOR_GET',
      ip,
      userAgent,
      requestId,
      details: { apiKey },
      operatorId: res.operator.id,
    });

    return { ...res, readFromIp: ip };
  }

  // --- ROTATE SECRET (returns apiSecret ONCE) ---
  @Post('rotate-secret')
  @ApiBearerAuth()
  async rotateSecret(
    @Body() dto: RotateSecretDto,
    @Headers('x-master-token') masterToken: string,
    @Headers('user-agent') userAgent: string,
    @Headers('x-request-id') requestId: string,
    @Ip() ip: string,
  ) {
    this.assertMaster(masterToken);

    const res = await this.operatorService.rotateSecret(dto, {
      ip,
      userAgent,
      requestId,
    });

    return { ...res, rotatedFromIp: ip };
  }
}

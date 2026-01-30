import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { OperatorAuthGuard } from '../operator/operator.guard';
import { WalletService } from './wallet.service';
import { WalletBalanceDto, WalletCreditDto, WalletDebitDto, WalletRollbackDto } from './dto/wallet.dto';

@ApiTags('wallet')
@ApiSecurity('x-api-key')
@ApiSecurity('x-signature')
@Controller('casino/wallet')
@UseGuards(OperatorAuthGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Post('balance')
  async balance(@Body() dto: WalletBalanceDto, @Req() req: any) {
    return this.walletService.getBalance(req.operator.id, dto.playerExternalId, dto.currency);
  }

  @Post('debit')
  async debit(@Body() dto: WalletDebitDto, @Req() req: any) {
    return this.walletService.debit(req.operator.id, dto.playerExternalId, dto.currency, dto.amount, {
      idempotencyKey: dto.idempotencyKey,
      referenceId: dto.referenceId,
      meta: dto.meta,
    });
  }

  @Post('credit')
  async credit(@Body() dto: WalletCreditDto, @Req() req: any) {
    return this.walletService.credit(req.operator.id, dto.playerExternalId, dto.currency, dto.amount, {
      idempotencyKey: dto.idempotencyKey,
      referenceId: dto.referenceId,
      meta: dto.meta,
    });
  }

  @Post('rollback')
  async rollback(@Body() dto: WalletRollbackDto, @Req() req: any) {
    return this.walletService.rollback(req.operator.id, dto.transactionId, dto.idempotencyKey);
  }
}

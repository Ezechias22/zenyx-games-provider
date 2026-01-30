import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { OperatorModule } from '../operator/operator.module'; // ✅

@Module({
  imports: [OperatorModule], // ✅ pour OperatorService/Guard
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}

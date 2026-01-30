import { Module } from '@nestjs/common';
import { OperatorService } from './operator.service';
import { OperatorController } from './operator.controller';
import { OperatorAuthGuard } from './operator.guard';

@Module({
  controllers: [OperatorController],
  providers: [OperatorService, OperatorAuthGuard],
  exports: [OperatorService, OperatorAuthGuard], // ✅ export pour d'autres modules
})
export class OperatorModule {}

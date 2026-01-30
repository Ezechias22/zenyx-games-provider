import { Module } from '@nestjs/common';
import { FairnessService } from './fairness.service';
import { RngService } from './rng.service';

@Module({
  providers: [FairnessService, RngService],
  exports: [FairnessService, RngService],
})
export class EngineModule {}

import { Module } from '@nestjs/common';
import { SlotFruitStarService } from './slot.service';
import { EngineModule } from '../../engine/engine.module';

@Module({
  imports: [EngineModule],
  providers: [SlotFruitStarService],
  exports: [SlotFruitStarService],
})
export class SlotFruitStarModule {}

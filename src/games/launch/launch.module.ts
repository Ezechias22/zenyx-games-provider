import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { PublicModule } from '../../public/public.module';
import { GameLaunchController } from './launch.controller';
import { GameLaunchService } from './launch.service';

@Module({
  imports: [PrismaModule, PublicModule],
  controllers: [GameLaunchController],
  providers: [GameLaunchService],
})
export class GameLaunchModule {}

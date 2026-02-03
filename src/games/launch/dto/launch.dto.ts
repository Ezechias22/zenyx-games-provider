import { IsString, MinLength } from 'class-validator';

export class GameLaunchDto {
  @IsString()
  @MinLength(10)
  roundId!: string;
}

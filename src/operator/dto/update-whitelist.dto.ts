import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateWhitelistDto {
  @IsString()
  apiKey!: string;

  @IsArray()
  @IsString({ each: true })
  ipWhitelist!: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

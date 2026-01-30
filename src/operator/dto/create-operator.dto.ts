import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateOperatorDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsArray()
  ipWhitelist?: string[];
}

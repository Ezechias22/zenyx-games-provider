import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class RotateSecretDto {
  @IsString()
  apiKey!: string;

  // optionnel: désactiver/activer lors de la rotation
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

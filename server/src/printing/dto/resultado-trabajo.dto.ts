import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ResultadoTrabajoDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsBoolean()
  exitoso!: boolean;

  @IsOptional()
  @IsBoolean()
  reintentable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  error?: string;
}

import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ActualizarIndicacionesDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  indicaciones?: string;
}

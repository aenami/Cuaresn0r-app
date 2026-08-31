import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSubcuentaDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  nombre?: string;
}

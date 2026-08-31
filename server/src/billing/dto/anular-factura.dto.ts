import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AnularFacturaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  motivo!: string;
}

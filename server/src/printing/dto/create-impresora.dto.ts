import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DestinoImpresion } from '../../generated/prisma/client';

export class CreateImpresoraDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  nombre!: string;

  @IsEnum(DestinoImpresion)
  destino!: DestinoImpresion;

  // IP o hostname en la LAN del restaurante (protocolo RAW 9100).
  @IsNotEmpty()
  @IsString()
  @MaxLength(45)
  host!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  puerto?: number;

  @IsOptional()
  @IsIn([58, 80])
  anchoPapel?: number;
}

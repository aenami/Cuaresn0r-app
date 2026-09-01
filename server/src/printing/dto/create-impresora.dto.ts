import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DestinoImpresion } from '../../generated/prisma/client';

export class CreateImpresoraDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(30)
  nombre!: string;

  @IsEnum(DestinoImpresion)
  destino!: DestinoImpresion;

  // Nombre exacto de la cola instalada en Windows. Ambas impresoras actuales
  // se configuran como EPSON TM-m30II y el agente envia ESC/POS en modo RAW.
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  dispositivo!: string;

  // Reservado para una posible impresora por red en el futuro.
  @IsOptional()
  @IsString()
  @MaxLength(45)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  puerto?: number;

  @IsOptional()
  @IsIn([58, 80])
  anchoPapel?: number;
}

import { IsInt } from 'class-validator';

export class TransferirMesaDto {
  @IsInt()
  idMesaDestino!: number;
}

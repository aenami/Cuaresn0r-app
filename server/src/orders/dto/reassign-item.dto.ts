import { IsInt } from 'class-validator';

export class ReassignItemDto {
  @IsInt()
  idSubcuenta!: number;
}

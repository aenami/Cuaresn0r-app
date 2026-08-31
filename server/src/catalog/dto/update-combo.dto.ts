import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateComboDto } from './create-combo.dto';

export class UpdateComboDto extends PartialType(CreateComboDto) {
  // Si se envia "componentes", se reemplaza la lista completa (no es un merge).
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

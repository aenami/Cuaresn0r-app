import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateImpresoraDto } from './create-impresora.dto';

export class UpdateImpresoraDto extends PartialType(CreateImpresoraDto) {
  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}

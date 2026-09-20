import { OmitType } from '@nestjs/mapped-types';
import { CreateInventoryCountDto } from './create-inventory-count.dto';

export class CreateCountElementDto extends OmitType(CreateInventoryCountDto, [
  'fecha',
] as const) {}

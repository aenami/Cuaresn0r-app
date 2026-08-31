import { PartialType } from '@nestjs/mapped-types';
import { CreateAreaDto } from './area.dto';

export class UpdateAreaDto extends PartialType(CreateAreaDto) {}

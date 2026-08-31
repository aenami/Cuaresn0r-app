import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCajaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  nombre!: string;
}

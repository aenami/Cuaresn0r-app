import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CrearFichaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  numero!: string;
}

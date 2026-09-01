import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CrearComentarioCuentaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  texto!: string;
}

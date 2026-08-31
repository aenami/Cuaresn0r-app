import { IsNotEmpty, IsString, Length } from "class-validator";

export class CreateAreaDto {
  @IsNotEmpty()
  @IsString()
  name!: string;
  @IsNotEmpty()
  @IsString()
  @Length(1, 5)
  identifier!: string;
}
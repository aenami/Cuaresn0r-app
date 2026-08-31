import { IsString, MinLength } from 'class-validator';

// Reseteo por ADMIN: no se pide la contraseña actual (el admin no la conoce;
// es justo el caso de "el usuario la olvido"). Distinto de ChangePasswordDto,
// que si exige la actual porque lo usa el propio usuario sobre /me.
export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { AUTH_PASSWORD_MAX, AUTH_PASSWORD_MIN } from '../auth-input.validation';

export class LoginDto {
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsEmail({}, { message: 'Indique um e-mail válido.' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(AUTH_PASSWORD_MIN, {
    message: `A palavra-passe deve ter pelo menos ${AUTH_PASSWORD_MIN} caracteres.`,
  })
  @MaxLength(AUTH_PASSWORD_MAX)
  password!: string;
}

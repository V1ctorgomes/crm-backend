import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import {
  AUTH_NAME_MAX,
  AUTH_PASSWORD_MAX,
  AUTH_PASSWORD_MIN,
} from '../auth-input.validation';

export class RegisterDto {
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  @IsEmail({}, { message: 'Indique um e-mail válido.' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(AUTH_PASSWORD_MIN)
  @MaxLength(AUTH_PASSWORD_MAX)
  password!: string;

  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MinLength(2, { message: 'Indique o seu nome (mínimo 2 caracteres).' })
  @MaxLength(AUTH_NAME_MAX)
  name!: string;
}

import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

describe('Auth DTOs', () => {
  it('rejeita login com e-mail inválido', async () => {
    const dto = plainToInstance(LoginDto, { email: 'bad', password: '12345678' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('aceita login válido', async () => {
    const dto = plainToInstance(LoginDto, {
      email: ' User@Example.com ',
      password: '12345678',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.email).toBe('user@example.com');
  });

  it('rejeita registo com nome curto', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: 'a@b.co',
      password: '12345678',
      name: 'a',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});

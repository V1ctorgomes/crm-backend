import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Lista de roles permitidos. Se omitido ou vazio, qualquer usuario autenticado passa. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

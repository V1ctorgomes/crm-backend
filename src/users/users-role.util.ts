import { ForbiddenException } from '@nestjs/common';

export function canManageAllUsers(role: string): boolean {
  return role === 'ADMIN' || role === 'DEVELOPER';
}

/** Papéis que ADMIN ou DEVELOPER podem atribuir a outros utilizadores. */
export function resolveManagedUserRole(actorRole: string, requestedRole: unknown): 'USER' | 'DEVELOPER' {
  const r = String(requestedRole || 'USER').toUpperCase();
  if (actorRole === 'DEVELOPER') {
    if (r === 'ADMIN') {
      throw new ForbiddenException('Developers não podem atribuir papel ADMIN.');
    }
    return r === 'DEVELOPER' ? 'DEVELOPER' : 'USER';
  }
  if (actorRole === 'ADMIN') {
    if (r === 'ADMIN') {
      throw new ForbiddenException('Administradores não podem atribuir papel ADMIN a outros utilizadores.');
    }
    return r === 'DEVELOPER' ? 'DEVELOPER' : 'USER';
  }
  return 'USER';
}

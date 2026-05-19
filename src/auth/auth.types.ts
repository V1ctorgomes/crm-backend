/** Payload assinado no JWT (sub = userId). */
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: string;
}

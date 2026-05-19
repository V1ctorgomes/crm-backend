/** Campos de utilizador seguros para resposta JSON (nunca incluir `password`). */
export const USER_PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  approved: true,
  createdAt: true,
  updatedAt: true,
  profilePictureUrl: true,
} as const;

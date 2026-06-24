export function whatsappActorFromReq(req: { user: { userId: string; email: string; role: string } }) {
  return { userId: req.user.userId, email: req.user.email, role: req.user.role };
}

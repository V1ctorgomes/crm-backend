-- Rótulo do remetente em mensagens de grupo WhatsApp
ALTER TABLE "Message" ADD COLUMN "groupSenderLabel" TEXT;

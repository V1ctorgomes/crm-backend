import { BadRequestException } from '@nestjs/common';

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/webm',
  'audio/wav',
  'audio/aac',
  'video/mp4',
  'video/webm',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

const BLOCKED_EXT = new Set([
  'exe',
  'bat',
  'cmd',
  'com',
  'msi',
  'scr',
  'ps1',
  'sh',
  'js',
  'jar',
  'html',
  'htm',
  'svg',
]);

export const CRM_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

type MulterFile = {
  mimetype?: string;
  size?: number;
  originalname?: string;
};

export function assertCrmUpload(file: MulterFile | undefined, label = 'Ficheiro'): void {
  if (!file) {
    throw new BadRequestException(`${label} em falta.`);
  }
  const size = Number(file.size ?? 0);
  if (size <= 0 || size > CRM_UPLOAD_MAX_BYTES) {
    throw new BadRequestException(
      `${label} inválido ou excede ${CRM_UPLOAD_MAX_BYTES / (1024 * 1024)} MB.`,
    );
  }
  const name = String(file.originalname || '').toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  if (ext && BLOCKED_EXT.has(ext)) {
    throw new BadRequestException(`Tipo de ficheiro não permitido (.${ext}).`);
  }
  const mime = String(file.mimetype || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!mime || !ALLOWED_MIMES.has(mime)) {
    throw new BadRequestException(
      'Tipo de ficheiro não permitido. Envie imagem, áudio, vídeo ou documento suportado.',
    );
  }
}

import { BadRequestException } from '@nestjs/common';

const PROFILE_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

type MulterFile = {
  mimetype?: string;
  size?: number;
  originalname?: string;
};

/** Valida upload de foto de perfil (tipo e tamanho). */
export function assertProfileImageUpload(file: MulterFile | undefined): void {
  if (!file) return;
  const mime = String(file.mimetype || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!PROFILE_IMAGE_MIMES.has(mime)) {
    throw new BadRequestException(
      'Formato de imagem não suportado. Use JPEG, PNG, WebP ou GIF.',
    );
  }
  const size = Number(file.size ?? 0);
  if (size > PROFILE_IMAGE_MAX_BYTES) {
    throw new BadRequestException('A imagem de perfil não pode exceder 5 MB.');
  }
}

import {
  coerceWebmAttachmentToAudioIfNeeded,
  resolveUploadedMimeType,
} from './whatsapp-upload-mime.util';

export type PreparedMediaFile = {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  mediatype: 'document' | 'image' | 'video' | 'audio';
  fallbackText: string;
};

export async function prepareOutboundMediaFile(file: any): Promise<PreparedMediaFile> {
  let fileBuffer: Buffer | undefined = file?.buffer;
  if (!fileBuffer && file?.path) {
    const { readFile } = await import('fs/promises');
    fileBuffer = await readFile(file.path);
  }
  const fileOriginalName = String(file?.originalname || 'arquivo.bin');
  let fileMimeType = resolveUploadedMimeType(fileOriginalName, String(file?.mimetype || 'application/octet-stream'));
  fileMimeType = coerceWebmAttachmentToAudioIfNeeded(fileOriginalName, fileMimeType);

  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('empty-file');
  }

  let mediatype: PreparedMediaFile['mediatype'] = 'document';
  let fallbackText = 'Documento';
  if (fileMimeType.startsWith('image')) {
    mediatype = 'image';
    fallbackText = 'Imagem';
  } else if (fileMimeType.startsWith('video')) {
    mediatype = 'video';
    fallbackText = 'Vídeo';
  } else if (fileMimeType.startsWith('audio')) {
    mediatype = 'audio';
    fallbackText = 'Áudio';
  }

  return {
    buffer: fileBuffer,
    originalName: fileOriginalName,
    mimeType: fileMimeType,
    mediatype,
    fallbackText,
  };
}

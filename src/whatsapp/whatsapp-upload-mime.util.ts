/** Multer/browsers por vezes enviam gravações como `application/octet-stream`. */
export function resolveUploadedMimeType(fileName: string, declaredMime: string): string {
  const d = String(declaredMime || '').trim();
  const lower = d.toLowerCase();
  const fn = String(fileName || '').toLowerCase();
  const ext = fn.includes('.') ? fn.slice(fn.lastIndexOf('.') + 1) : '';

  if (lower && lower !== 'application/octet-stream' && lower !== 'binary/octet-stream') {
    return d;
  }

  const map: Record<string, string> = {
    webm: 'audio/webm',
    m4a: 'audio/mp4',
    mp4: 'audio/mp4',
    opus: 'audio/ogg',
    ogg: 'audio/ogg',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    aac: 'audio/aac',
  };
  if (ext && map[ext]) return map[ext];

  return d || 'application/octet-stream';
}

export function coerceWebmAttachmentToAudioIfNeeded(fileName: string, mime: string): string {
  const fn = String(fileName || '').toLowerCase();
  const base = String(mime || '')
    .toLowerCase()
    .split(';')[0]
    .trim();
  if (!fn.endsWith('.webm')) return mime;
  if (base === 'video/webm' || base === 'application/octet-stream') {
    return 'audio/webm';
  }
  return mime;
}

// src/lib/storage/cloudinary.ts

export const MEDIA_MAX_BYTES = 16 * 1024 * 1024;

export const MEDIA_MAX_BYTES_BY_KIND = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 16 * 1024 * 1024,
} as const;

export function buildMediaPath(
  accountId: string,
  fileName: string,
  now: number | null = Date.now(),
  subfolder?: string
): string {
  const safeBase =
    fileName
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 40) || 'file';
  const dir = subfolder
    ? `account-${accountId}/${subfolder}`
    : `account-${accountId}`;
  const stamp = now === null ? '' : `${now}-`;
  return `wa-crm/${dir}/${stamp}${safeBase}`;
}

export function resourceTypeForMime(
  mimeType: string | null
): 'image' | 'video' | 'raw' {
  if (!mimeType) return 'raw';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/') || mimeType.startsWith('audio/'))
    return 'video';
  return 'raw';
}

export function splitMediaPath(path: string): {
  folder: string;
  publicId: string;
} {
  const idx = path.lastIndexOf('/');
  return { folder: path.slice(0, idx), publicId: path.slice(idx + 1) };
}

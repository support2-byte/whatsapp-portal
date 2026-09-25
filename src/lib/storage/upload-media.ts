import {
  buildMediaPath,
  MEDIA_MAX_BYTES,
  MEDIA_MAX_BYTES_BY_KIND,
} from '@/lib/storage/cloudinary';

export { buildMediaPath, MEDIA_MAX_BYTES, MEDIA_MAX_BYTES_BY_KIND };

export interface UploadAccountMediaResult {
  publicUrl: string;
  path: string;
}

export async function uploadAccountMedia(
  bucket: string,
  file: File
): Promise<UploadAccountMediaResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('subfolder', bucket);

  const res = await fetch('/api/media/upload', { method: 'POST', body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? 'Upload failed.');

  return { publicUrl: json.publicUrl as string, path: json.path as string };
}

export async function deleteAccountMedia(
  _bucket: string,
  path: string
): Promise<void> {
  const res = await fetch('/api/media/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicId: path }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.error ?? 'Delete failed.');
  }
}

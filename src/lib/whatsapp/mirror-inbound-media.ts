import { downloadMedia } from './meta-api';
import { extensionForMime } from '@/lib/media/filename';
import {
  buildMediaPath,
  MEDIA_MAX_BYTES,
  resourceTypeForMime,
  splitMediaPath,
} from '@/lib/storage/cloudinary';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
});
export interface MirrorStorage {
  from(bucket: string): {
    upload(
      path: string,
      body: Uint8Array | Buffer,
      options: { contentType: string; cacheControl: string; upsert: boolean }
    ): Promise<{ error: { message: string } | null }>;
    getPublicUrl(path: string): { data: { publicUrl: string } };
  };
}

export const MIRROR_BUCKET = 'chat-media';

export const MIRROR_FOLDER = 'inbound';

export interface MirrorInboundMediaArgs {
  /** Tenant. Drives the account-scoped path the bucket's policies expect. */
  accountId: string;
  /** Meta's media id. Makes the object path deterministic. */
  mediaId: string;
  /** Short-lived CDN URL from `getMediaUrl`. */
  downloadUrl: string;
  accessToken: string;
  /** Meta's `mime_type` for the media. */
  mimeType?: string | null;
  /** Meta's `file_size`, when it gave us one — lets us skip before downloading. */
  fileSize?: number | null;
  /** `document.filename`, when the sender's client supplied one. */
  fileName?: string | null;
  /** Meta's message timestamp (epoch SECONDS) — keeps download names distinct. */
  messageTimestamp?: string | number | null;
  /** Injected in tests. */
  download?: typeof downloadMedia;
}

export function normalizeMimeType(value?: string | null): string | null {
  if (!value) return null;
  const base = value.split(';')[0].trim().toLowerCase();
  return base.includes('/') ? base : null;
}

function kindForMime(mimeType: string | null): string {
  if (!mimeType) return 'file';
  const [top] = mimeType.split('/');
  if (top === 'image' || top === 'video' || top === 'audio') return top;
  if (top === 'text' || top === 'application') return 'document';
  return 'file';
}

export function mirrorFileName(args: {
  mediaId: string;
  mimeType: string | null;
  fileName?: string | null;
  messageTimestamp?: string | number | null;
}): string {
  const { mediaId, mimeType, fileName, messageTimestamp } = args;
  const ext = extensionForMime(mimeType);

  const stem = (fileName ?? '')
    .split(/[\\/]/)
    .pop()!
    .replace(/\.[^.]+$/, '')
    .trim();
  if (stem) return `${mediaId}-${stem}.${ext}`;

  const kind = kindForMime(mimeType);
  const stamp = String(messageTimestamp ?? '').replace(/\D/g, '');
  return `${mediaId}-${stamp ? `${kind}-${stamp}` : kind}.${ext}`;
}

/**
 * Download the bytes from Meta and put them in `chat-media`.
 *
 * @returns the durable public URL, or `null` if the mirror was skipped
 *          or failed — in which case the caller must fall back to the
 *          proxy URL.
 */
export async function mirrorInboundMedia(
  args: MirrorInboundMediaArgs
): Promise<string | null> {
  const {
    accountId,
    mediaId,
    downloadUrl,
    accessToken,
    mimeType,
    fileSize,
    fileName,
    messageTimestamp,
    download = downloadMedia,
  } = args;

  const normalizedMime = normalizeMimeType(mimeType);

  if (typeof fileSize === 'number' && fileSize > MEDIA_MAX_BYTES) {
    console.warn(
      `[mirror-media] skipping ${mediaId}: ${fileSize} bytes exceeds the ${MEDIA_MAX_BYTES}-byte bucket limit`
    );
    return null;
  }

  try {
    const { buffer, contentType } = await download({
      downloadUrl,
      accessToken,
    });

    if (buffer.byteLength > MEDIA_MAX_BYTES) {
      console.warn(
        `[mirror-media] skipping ${mediaId}: downloaded ${buffer.byteLength} bytes, over the ${MEDIA_MAX_BYTES}-byte bucket limit`
      );
      return null;
    }

    const uploadType =
      normalizedMime ??
      normalizeMimeType(contentType) ??
      'application/octet-stream';

    const objectName = mirrorFileName({
      mediaId,
      mimeType: uploadType,
      fileName,
      messageTimestamp,
    });
    const path = buildMediaPath(accountId, objectName, null, MIRROR_FOLDER);
    const { folder, publicId } = splitMediaPath(path);
    try {
      const result = await cloudinary.uploader.upload(
        `data:${uploadType};base64,${buffer.toString('base64')}`,
        {
          public_id: publicId,
          folder,
          resource_type: resourceTypeForMime(uploadType),
          overwrite: true,
        }
      );
      return result.secure_url ?? null;
    } catch (uploadErr) {
      console.warn(
        `[mirror-media] upload failed for ${mediaId} (${uploadType}):`,
        uploadErr instanceof Error ? uploadErr.message : uploadErr
      );
      return null;
    }
  } catch (error) {
    console.warn(
      `[mirror-media] could not mirror ${mediaId}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

import JSZip from 'jszip';
import type { ExportData } from './conversation-export';
import {
  archiveMediaFileName,
  downloadBlob,
  exportFileStem,
} from './conversation-export';
import { buildPdfBlob } from './pdf-export';
import { buildTextTranscript } from './text-export';

export async function buildAndDownloadZipExport(
  data: ExportData
): Promise<void> {
  const zip = new JSZip();
  const stem = exportFileStem(data);

  const [pdfBlob, transcript] = await Promise.all([
    buildPdfBlob(data),
    buildTextTranscript(data),
  ]);

  zip.file(`${stem}.pdf`, pdfBlob);
  zip.file(`${stem}.txt`, transcript);

  const mediaFolder = zip.folder('media');

  for (let i = 0; i < data.messages.length; i++) {
    const message = data.messages[i];
    const fileName = archiveMediaFileName(message, i);
    if (!fileName || !message.mediaUrl) continue;

    try {
      const res = await fetch(message.mediaUrl);
      if (!res.ok) continue;
      const blob = await res.blob();
      mediaFolder?.file(fileName, blob);
    } catch (err) {
      console.warn(
        'chat export: failed to download attachment for archive',
        message.id,
        err
      );
    }
  }

  const archiveBlob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(archiveBlob, `${stem}.zip`);
}

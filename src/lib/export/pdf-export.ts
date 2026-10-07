import { jsPDF } from 'jspdf';
import type { ExportData, ExportMessage } from './conversation-export';
import {
  archiveMediaFileName,
  downloadBlob,
  exportFileStem,
} from './conversation-export';
import { loadImageAsBase64 } from './logo-format';

const PAGE = { width: 210, height: 297 };

const MARGIN = {
  top: 41,
  bottom: 22,
  side: 12,
};

const HEADER_HEIGHT = 23;

const COMPANY = {
  name: 'Royal Gulf Shipping & Logistics',
  address:
    '21 6a st - Ras Al Khor Industrial Area 2 - Dubai - United Arab Emirates',
  phone: '+971 50 972 4214',
  email: 'info@royalgulfshipping.com',
  website: 'royalgulfshipping.com',
};

const BRAND = {
  teal: [9, 125, 118] as [number, number, number],
  orange: [243, 129, 32] as [number, number, number],
  dark: [35, 45, 45] as [number, number, number],
  gray: [105, 105, 105] as [number, number, number],
  lightGray: [225, 225, 225] as [number, number, number],
};
const CONTENT_WIDTH = PAGE.width - MARGIN.side * 2;
const BUBBLE_MAX_WIDTH = CONTENT_WIDTH * 0.72;
const BUBBLE_PAD_X = 4;
const BUBBLE_PAD_Y = 3;
const LINE_HEIGHT = 4.6;
const META_LINE_HEIGHT = 3.6;
const BUBBLE_GAP = 3.5;
const FONT_SIZE_BODY = 9.5;
const FONT_SIZE_META = 7.2;
const FONT_SIZE_REF = 6.4;

const IMAGE_MAX_WIDTH = BUBBLE_MAX_WIDTH - BUBBLE_PAD_X * 2;
const IMAGE_MAX_HEIGHT = 80;
const IMAGE_CAPTION_GAP = 2;
const REF_LINE_HEIGHT = 3.4;
const REF_LINE_GAP = 1;

const STATUS_LABEL: Record<string, string> = {
  sending: 'Sending',
  sent: '✓',
  delivered: '✓✓',
  read: '✓✓',
  failed: 'Failed',
};

function drawSingleTick(doc: jsPDF, x: number, y: number) {
  doc.setDrawColor(110, 110, 110);
  doc.setLineWidth(0.35);

  doc.line(x, y - 1.7, x + 1.2, y - 0.5);
  doc.line(x + 1.2, y - 0.5, x + 3.2, y - 2.4);
}

function drawDoubleTick(doc: jsPDF, x: number, y: number, blue = false) {
  if (blue) {
    doc.setDrawColor(53, 125, 190);
  } else {
    doc.setDrawColor(110, 110, 110);
  }

  doc.setLineWidth(0.35);

  doc.line(x, y - 1.7, x + 1.2, y - 0.5);
  doc.line(x + 1.2, y - 0.5, x + 3.2, y - 2.4);

  doc.line(x + 1.8, y - 1.7, x + 3.0, y - 0.5);
  doc.line(x + 3.0, y - 0.5, x + 5.0, y - 2.4);
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function pdfSafeText(value: string): string {
  return Array.from(value)
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      if (code <= 0xff) return ch;
      const decomposed = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
      return Array.from(decomposed)
        .map((c) => (c.codePointAt(0)! <= 0xff ? c : '?'))
        .join('');
    })
    .join('');
}

function captionFromPlaceholder(text: string): string {
  return text.replace(/^\[(?:Image|Video|Document)\]\s*/, '').trim();
}

type JsPdfImageFormat = 'JPEG' | 'PNG' | 'WEBP' | 'GIF' | 'BMP';

function jsPdfImageFormat(mimeType: string | null): JsPdfImageFormat | null {
  switch ((mimeType ?? '').toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'JPEG';
    case 'image/png':
      return 'PNG';
    case 'image/webp':
      return 'WEBP';
    case 'image/gif':
      return 'GIF';
    case 'image/bmp':
      return 'BMP';
    default:
      return null;
  }
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

function fitImageMm(pixelWidth: number, pixelHeight: number) {
  if (pixelWidth <= 0 || pixelHeight <= 0) return { width: 0, height: 0 };
  let width = IMAGE_MAX_WIDTH;
  let height = (pixelHeight / pixelWidth) * width;
  if (height > IMAGE_MAX_HEIGHT) {
    const scale = IMAGE_MAX_HEIGHT / height;
    height = IMAGE_MAX_HEIGHT;
    width *= scale;
  }
  return { width, height };
}

interface BubbleImage {
  dataUri: string;
  format: JsPdfImageFormat;
  width: number;
  height: number;
}

async function loadBubbleImage(
  doc: jsPDF,
  message: ExportMessage
): Promise<BubbleImage | null> {
  if (message.contentType !== 'image' || !message.mediaUrl) return null;

  try {
    const res = await fetch(message.mediaUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const format =
      jsPdfImageFormat(message.mediaType) ?? jsPdfImageFormat(blob.type);
    if (!format) return null;
    const dataUri = await blobToDataUri(blob);
    const props = doc.getImageProperties(dataUri);
    const { width, height } = fitImageMm(props.width, props.height);
    if (width <= 0 || height <= 0) return null;
    return { dataUri, format, width, height };
  } catch (err) {
    console.warn(
      'chat export: failed to embed image for message',
      message.id,
      err
    );
    return null;
  }
}

interface PreparedBubble {
  message: ExportMessage;
  isOutbound: boolean;
  senderLabel: string;
  image: BubbleImage | null;
  archiveRef: string | null;
  lines: string[];
  bubbleWidth: number;
  bodyHeight: number;
  totalHeight: number;
}

async function prepareBubble(
  doc: jsPDF,
  message: ExportMessage,
  index: number
): Promise<PreparedBubble> {
  const isOutbound = message.senderType !== 'customer';
  const senderLabel = pdfSafeText(message.senderLabel);
  const image = await loadBubbleImage(doc, message);

  const archiveFileName = archiveMediaFileName(message, index);
  const archiveRef = archiveFileName
    ? `Archived as: media/${archiveFileName}`
    : null;

  doc.setFontSize(FONT_SIZE_BODY);
  const rawText = image
    ? captionFromPlaceholder(message.text)
    : message.text || '(empty message)';
  const text = pdfSafeText(rawText);
  const lines = text
    ? (doc.splitTextToSize(
        text,
        BUBBLE_MAX_WIDTH - BUBBLE_PAD_X * 2
      ) as string[])
    : [];

  doc.setFontSize(FONT_SIZE_BODY);
  const widestLine = lines.reduce(
    (max, l) => Math.max(max, doc.getTextWidth(l)),
    doc.getTextWidth(senderLabel)
  );

  doc.setFontSize(FONT_SIZE_META);
  const metaText = isOutbound
    ? `${formatTimestamp(message.createdAt)}  \u00b7  ${STATUS_LABEL[message.status] ?? message.status}`
    : formatTimestamp(message.createdAt);
  const metaWidth = doc.getTextWidth(metaText);

  doc.setFontSize(FONT_SIZE_REF);
  const archiveRefWidth = archiveRef ? doc.getTextWidth(archiveRef) : 0;
  doc.setFontSize(FONT_SIZE_BODY);

  const bubbleWidth = Math.min(
    BUBBLE_MAX_WIDTH,
    Math.max(widestLine, metaWidth, archiveRefWidth, image?.width ?? 0) +
      BUBBLE_PAD_X * 2
  );

  const bodyHeight = lines.length * LINE_HEIGHT;
  const senderLineHeight = META_LINE_HEIGHT + 1;
  const metaLineHeight = META_LINE_HEIGHT + 1;
  const imageBlockHeight = image ? image.height + IMAGE_CAPTION_GAP : 0;
  const archiveRefHeight = archiveRef ? REF_LINE_HEIGHT + REF_LINE_GAP : 0;
  const totalHeight =
    BUBBLE_PAD_Y * 2 +
    senderLineHeight +
    imageBlockHeight +
    bodyHeight +
    archiveRefHeight +
    metaLineHeight;

  return {
    message,
    isOutbound,
    senderLabel,
    image,
    archiveRef,
    lines,
    bubbleWidth,
    bodyHeight,
    totalHeight,
  };
}

function drawPageChrome(
  doc: jsPDF,
  data: ExportData,
  pageNum: number,
  pageCount: number,
  logoBase64: string | null
) {
  const pageWidth = PAGE.width;
  const pageHeight = PAGE.height;

  doc.setFillColor(...BRAND.teal);
  doc.rect(0, 0, pageWidth, 2, 'F');

  let headerX = MARGIN.side;

  if (logoBase64) {
    try {
      const props = doc.getImageProperties(logoBase64);

      const maxW = 24;
      const maxH = 15;

      const ratio = props.width / props.height;

      let logoW = maxW;
      let logoH = logoW / ratio;

      if (logoH > maxH) {
        logoH = maxH;
        logoW = logoH * ratio;
      }

      doc.addImage(logoBase64, 'PNG', MARGIN.side, 6, logoW, logoH);

      headerX += logoW + 5;
    } catch {}
  }

  doc
    .setFont('helvetica', 'bold')
    .setFontSize(10.5)
    .setTextColor(...BRAND.teal);

  doc.text(COMPANY.name, headerX, 9);

  doc
    .setFont('helvetica', 'normal')
    .setFontSize(6.4)
    .setTextColor(...BRAND.gray);

  doc.text(COMPANY.address, headerX, 13);

  doc.setFontSize(6.4).setTextColor(...BRAND.gray);

  doc.text(`${COMPANY.phone}  |  ${COMPANY.email}`, headerX, 16.5);

  doc
    .setFont('helvetica', 'bold')
    .setFontSize(13)
    .setTextColor(...BRAND.orange);

  doc.text('CHAT EXPORT', pageWidth - MARGIN.side, 9, { align: 'right' });

  doc
    .setFont('helvetica', 'normal')
    .setFontSize(6.8)
    .setTextColor(...BRAND.gray);

  doc.text('CONVERSATION TRANSCRIPT', pageWidth - MARGIN.side, 13, {
    align: 'right',
  });

  doc.setFontSize(6.8).setTextColor(...BRAND.gray);

  doc.text(`Page ${pageNum} of ${pageCount}`, pageWidth - MARGIN.side, 17, {
    align: 'right',
  });

  doc.setDrawColor(...BRAND.lightGray);
  doc.setLineWidth(0.3);

  doc.line(MARGIN.side, HEADER_HEIGHT, pageWidth - MARGIN.side, HEADER_HEIGHT);

  doc
    .setFont('helvetica', 'bold')
    .setFontSize(8.5)
    .setTextColor(...BRAND.dark);

  doc.text(
    `${pdfSafeText(data.contactName)}  ${pdfSafeText(data.contactPhone)}`,
    MARGIN.side,
    29
  );

  doc
    .setFont('helvetica', 'normal')
    .setFontSize(6.8)
    .setTextColor(...BRAND.gray);

  doc.text(pdfSafeText(data.accountName), MARGIN.side, 33);

  doc.setDrawColor(...BRAND.lightGray);
  doc.setLineWidth(0.3);

  doc.line(MARGIN.side, 37, pageWidth - MARGIN.side, 37);

  doc.saveGraphicsState();

  doc.setTextColor(235, 242, 241);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);

  doc.text('ROYAL GULF SHIPPING', pageWidth / 2, pageHeight / 2, {
    align: 'center',
    angle: 35,
  });

  doc.restoreGraphicsState();

  const footerY = pageHeight - 16;

  doc.setFillColor(...BRAND.orange);
  doc.rect(0, footerY - 1.2, pageWidth, 1.2, 'F');

  doc.setFillColor(...BRAND.teal);
  doc.rect(0, footerY, pageWidth, 16, 'F');

  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(255, 255, 255);

  doc.text(`Tel: ${COMPANY.phone}`, MARGIN.side, footerY + 7);

  doc.text(COMPANY.email, pageWidth / 2, footerY + 7, { align: 'center' });

  doc.text(COMPANY.website, pageWidth - MARGIN.side, footerY + 7, {
    align: 'right',
  });

  doc.setFontSize(5.8).setTextColor(220, 235, 233);

  doc.text(
    'Generated automatically from stored WhatsApp Business API records.',
    pageWidth / 2,
    footerY + 11.5,
    { align: 'center' }
  );
}

function drawBubble(
  doc: jsPDF,
  bubble: PreparedBubble,
  y: number,
  startLine = 0,
  endLine?: number
) {
  const { message, isOutbound, image, archiveRef } = bubble;
  const showImage = startLine === 0 && image !== null;
  const showArchiveRef = startLine === 0 && archiveRef !== null;
  const lines = bubble.lines.slice(startLine, endLine ?? bubble.lines.length);
  const bodyHeight = lines.length * LINE_HEIGHT;
  const senderLineHeight = META_LINE_HEIGHT + 1;
  const metaLineHeight = META_LINE_HEIGHT + 1;
  const imageBlockHeight = showImage ? image!.height + IMAGE_CAPTION_GAP : 0;
  const archiveRefHeight = showArchiveRef ? REF_LINE_HEIGHT + REF_LINE_GAP : 0;
  const height =
    BUBBLE_PAD_Y * 2 +
    senderLineHeight +
    imageBlockHeight +
    bodyHeight +
    archiveRefHeight +
    metaLineHeight;
  const x = isOutbound
    ? PAGE.width - MARGIN.side - bubble.bubbleWidth
    : MARGIN.side;

  if (message.status === 'failed') {
    doc.setFillColor(253, 232, 232);
  } else if (isOutbound) {
    doc.setFillColor(219, 237, 219);
  } else {
    doc.setFillColor(241, 241, 241);
  }
  doc.roundedRect(x, y, bubble.bubbleWidth, height, 1.5, 1.5, 'F');

  let cursorY = y + BUBBLE_PAD_Y + senderLineHeight - 1.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(FONT_SIZE_META);
  doc.setTextColor(70, 70, 70);
  const label =
    startLine > 0 ? `${bubble.senderLabel} (continued)` : bubble.senderLabel;
  doc.text(label, x + BUBBLE_PAD_X, cursorY);

  cursorY += LINE_HEIGHT;

  if (showImage) {
    doc.addImage(
      image!.dataUri,
      image!.format,
      x + BUBBLE_PAD_X,
      cursorY,
      image!.width,
      image!.height
    );
    cursorY += image!.height + IMAGE_CAPTION_GAP;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT_SIZE_BODY);
  doc.setTextColor(20, 20, 20);
  lines.forEach((line) => {
    doc.text(line, x + BUBBLE_PAD_X, cursorY);
    cursorY += LINE_HEIGHT;
  });

  if (showArchiveRef) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(FONT_SIZE_REF);
    doc.setTextColor(130, 130, 130);
    doc.text(archiveRef!, x + BUBBLE_PAD_X, cursorY);
    cursorY += REF_LINE_HEIGHT + REF_LINE_GAP;
  }

  const isLastChunk = (endLine ?? bubble.lines.length) >= bubble.lines.length;
  doc.setCharSpace(0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT_SIZE_META);
  doc.setTextColor(110, 110, 110);
  const metaY = cursorY + 1.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT_SIZE_META);
  doc.setTextColor(110, 110, 110);

  const timestamp = formatTimestamp(message.createdAt);

  doc.text(timestamp, x + BUBBLE_PAD_X, metaY);

  let metaX = x + BUBBLE_PAD_X + doc.getTextWidth(timestamp) + 2;

  if (isOutbound && isLastChunk) {
    const status = message.status;

    if (status === 'sent') {
      drawSingleTick(doc, metaX, metaY);
    } else if (status === 'delivered') {
      drawDoubleTick(doc, metaX, metaY, false);
    } else if (status === 'read') {
      drawDoubleTick(doc, metaX, metaY, true);
    } else if (status === 'failed') {
      doc.setTextColor(180, 60, 60);
      doc.text('Failed', metaX, metaY);
    }
  }

  if (!isLastChunk) {
    doc.setTextColor(110, 110, 110);

    const separator = ' · ';
    const separatorX = metaX + 8;

    doc.text(`${separator}continues on next page →`, separatorX, metaY);
  }

  return height;
}

export async function buildPdfBlob(data: ExportData): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const logoBase64 = await loadImageAsBase64('./logo-2.png').catch(() => null);
  const usableHeight = PAGE.height - MARGIN.top - MARGIN.bottom;

  const bubbles: PreparedBubble[] = [];
  for (let i = 0; i < data.messages.length; i++) {
    bubbles.push(await prepareBubble(doc, data.messages[i], i));
  }

  type PlacedChunk = {
    bubble: PreparedBubble;
    startLine: number;
    endLine: number;
  };
  const pages: PlacedChunk[][] = [[]];
  let y = MARGIN.top;

  const newPage = () => {
    pages.push([]);
    y = MARGIN.top;
  };

  for (const bubble of bubbles) {
    if (bubble.totalHeight <= usableHeight) {
      if (y + bubble.totalHeight > MARGIN.top + usableHeight) newPage();
      pages[pages.length - 1].push({
        bubble,
        startLine: 0,
        endLine: bubble.lines.length,
      });
      y += bubble.totalHeight + BUBBLE_GAP;
    } else {
      let start = 0;
      if (y < MARGIN.top + usableHeight - 20) newPage();
      while (start < bubble.lines.length) {
        const includeImage = start === 0 && bubble.image !== null;
        const includeRef = start === 0 && bubble.archiveRef !== null;
        const imageBlockHeight = includeImage
          ? bubble.image!.height + IMAGE_CAPTION_GAP
          : 0;
        const refHeight = includeRef ? REF_LINE_HEIGHT + REF_LINE_GAP : 0;
        const fixedHeight =
          BUBBLE_PAD_Y * 2 +
          (META_LINE_HEIGHT + 1) * 2 +
          imageBlockHeight +
          refHeight;
        const roomForLines = MARGIN.top + usableHeight - y - fixedHeight;
        const linesThatFit = Math.max(
          1,
          Math.floor(roomForLines / LINE_HEIGHT)
        );
        const end = Math.min(bubble.lines.length, start + linesThatFit);
        pages[pages.length - 1].push({
          bubble,
          startLine: start,
          endLine: end,
        });
        const chunkHeight = fixedHeight + (end - start) * LINE_HEIGHT;
        y += chunkHeight + BUBBLE_GAP;
        start = end;
        if (start < bubble.lines.length) newPage();
      }
    }
  }

  const pageCount = pages.length;
  pages.forEach((chunks, i) => {
    if (i > 0) doc.addPage();
    drawPageChrome(doc, data, i + 1, pageCount, logoBase64);
    let cursorY = MARGIN.top;
    chunks.forEach(({ bubble, startLine, endLine }) => {
      const h = drawBubble(doc, bubble, cursorY, startLine, endLine);
      cursorY += h + BUBBLE_GAP;
    });
  });

  return doc.output('blob');
}

export async function buildAndDownloadPdf(data: ExportData): Promise<void> {
  const blob = await buildPdfBlob(data);
  downloadBlob(blob, `${exportFileStem(data)}.pdf`);
}

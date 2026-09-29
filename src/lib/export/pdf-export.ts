import { jsPDF } from 'jspdf';
import type { ExportData, ExportMessage } from './conversation-export';
import { exportFileStem } from './conversation-export';

const PAGE = { width: 210, height: 297 };
const MARGIN = { top: 22, bottom: 16, side: 12 };
const HEADER_HEIGHT = 16;
const CONTENT_WIDTH = PAGE.width - MARGIN.side * 2;
const BUBBLE_MAX_WIDTH = CONTENT_WIDTH * 0.72;
const BUBBLE_PAD_X = 4;
const BUBBLE_PAD_Y = 3;
const LINE_HEIGHT = 4.6;
const META_LINE_HEIGHT = 3.6;
const BUBBLE_GAP = 3.5;
const FONT_SIZE_BODY = 9.5;
const FONT_SIZE_META = 7.2;

const STATUS_LABEL: Record<string, string> = {
  sending: 'Sending',
  sent: 'Sent \u2713',
  delivered: 'Delivered \u2713\u2713',
  read: 'Read \u2713\u2713',
  failed: 'Failed',
};

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

interface PreparedBubble {
  message: ExportMessage;
  isOutbound: boolean;
  senderLabel: string;
  lines: string[];
  bubbleWidth: number;
  bodyHeight: number;
  totalHeight: number;
}

function prepareBubble(doc: jsPDF, message: ExportMessage): PreparedBubble {
  const isOutbound = message.senderType !== 'customer';
  doc.setFontSize(FONT_SIZE_BODY);
  const text = pdfSafeText(message.text || '(empty message)');
  const senderLabel = pdfSafeText(message.senderLabel);
  const lines = doc.splitTextToSize(
    text,
    BUBBLE_MAX_WIDTH - BUBBLE_PAD_X * 2
  ) as string[];

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
  doc.setFontSize(FONT_SIZE_BODY);

  const bubbleWidth = Math.min(
    BUBBLE_MAX_WIDTH,
    Math.max(widestLine, metaWidth) + BUBBLE_PAD_X * 2
  );

  const bodyHeight = lines.length * LINE_HEIGHT;
  const senderLineHeight = META_LINE_HEIGHT + 1;
  const metaLineHeight = META_LINE_HEIGHT + 1;
  const totalHeight =
    BUBBLE_PAD_Y * 2 + senderLineHeight + bodyHeight + metaLineHeight;

  return {
    message,
    isOutbound,
    senderLabel,
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
  pageCount: number
) {
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text(
    `${pdfSafeText(data.contactName)} \u2014 ${pdfSafeText(data.contactPhone)}`,
    MARGIN.side,
    12
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(pdfSafeText(data.accountName), MARGIN.side, 16.5);
  doc.text(`Page ${pageNum} of ${pageCount}`, PAGE.width - MARGIN.side, 12, {
    align: 'right',
  });
  doc.setDrawColor(220, 220, 220);
  doc.line(
    MARGIN.side,
    HEADER_HEIGHT + 2,
    PAGE.width - MARGIN.side,
    HEADER_HEIGHT + 2
  );

  doc.setFontSize(6.8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    'Exported chat log \u2014 generated automatically from stored WhatsApp Business API records.',
    MARGIN.side,
    PAGE.height - 9
  );
}

function drawBubble(
  doc: jsPDF,
  bubble: PreparedBubble,
  y: number,
  startLine = 0,
  endLine?: number
) {
  const { message, isOutbound } = bubble;
  const lines = bubble.lines.slice(startLine, endLine ?? bubble.lines.length);
  const bodyHeight = lines.length * LINE_HEIGHT;
  const senderLineHeight = META_LINE_HEIGHT + 1;
  const metaLineHeight = META_LINE_HEIGHT + 1;
  const height =
    BUBBLE_PAD_Y * 2 + senderLineHeight + bodyHeight + metaLineHeight;
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
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(FONT_SIZE_BODY);
  doc.setTextColor(20, 20, 20);
  lines.forEach((line) => {
    doc.text(line, x + BUBBLE_PAD_X, cursorY);
    cursorY += LINE_HEIGHT;
  });

  const isLastChunk = (endLine ?? bubble.lines.length) >= bubble.lines.length;
  doc.setFontSize(FONT_SIZE_META);
  doc.setTextColor(110, 110, 110);
  const metaParts = [formatTimestamp(message.createdAt)];
  if (isOutbound && isLastChunk) {
    metaParts.push(STATUS_LABEL[message.status] ?? message.status);
  }
  if (!isLastChunk) metaParts.push('continues on next page \u2192');
  doc.text(metaParts.join('  \u00b7  '), x + BUBBLE_PAD_X, cursorY + 1.5);

  return height;
}

export function buildAndDownloadPdf(data: ExportData) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const usableHeight = PAGE.height - MARGIN.top - MARGIN.bottom;

  const bubbles = data.messages.map((m) => prepareBubble(doc, m));

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
        const fixedHeight = BUBBLE_PAD_Y * 2 + (META_LINE_HEIGHT + 1) * 2;
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
    drawPageChrome(doc, data, i + 1, pageCount);
    let cursorY = MARGIN.top;
    chunks.forEach(({ bubble, startLine, endLine }) => {
      const h = drawBubble(doc, bubble, cursorY, startLine, endLine);
      cursorY += h + BUBBLE_GAP;
    });
  });

  doc.save(`${exportFileStem(data)}.pdf`);
}

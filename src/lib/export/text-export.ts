import type { ExportData, ExportMessage } from './conversation-export';
import { downloadBlob, exportFileStem } from './conversation-export';

const COMPANY = {
  name: 'Royal Gulf Shipping & Logistics',
  phone: '+971 50 972 4214',
  email: 'info@royalgulfshipping.com',
};

const STATUS_LABEL: Record<string, string> = {
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed to send',
};

const SEPARATOR_LENGTH = 60;

function separator(char = '=', length = SEPARATOR_LENGTH): string {
  return char.repeat(length);
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);

  if (Number.isNaN(d.getTime())) {
    return iso;
  }

  return d
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC');
}

function formatField(label: string, value: unknown): string {
  return `${label.padEnd(18, ' ')}: ${String(value ?? 'N/A')}`;
}

function formatStatus(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

function formatSender(message: ExportMessage): string {
  if (message.senderType === 'customer') {
    return `Customer - ${message.senderLabel}`;
  }

  return `${COMPANY.name} - ${message.senderLabel}`;
}

function formatMessageText(text: string): string[] {
  const value = text || '(empty message)';

  return value.split(/\r?\n/).map((line) => `  ${line}`);
}

function formatAttachment(mediaUrl: string): string[] {
  return ['Attachment:', `  ${mediaUrl}`];
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);

  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Builds only the message-history portion of the transcript.
 *
 * IMPORTANT:
 * The SHA-256 hash is calculated from this exact string.
 * Do not include the document header/footer in the hash.
 */
export function buildTextTranscriptBody(data: ExportData): string {
  const lines: string[] = [];

  data.messages.forEach((message, index) => {
    const messageNumber = String(index + 1).padStart(3, '0');

    lines.push(`MESSAGE ${messageNumber}`);
    lines.push(separator('-', SEPARATOR_LENGTH));
    lines.push('');

    lines.push(formatField('Date & Time', formatTimestamp(message.createdAt)));

    lines.push(formatField('From', formatSender(message)));

    lines.push(formatField('Status', formatStatus(message.status)));

    if (message.whatsappMessageId) {
      lines.push(formatField('WhatsApp ID', message.whatsappMessageId));
    }

    lines.push('');
    lines.push('Message:');
    lines.push('');

    lines.push(...formatMessageText(message.text));

    if (message.mediaUrl) {
      lines.push('');
      lines.push(...formatAttachment(message.mediaUrl));
    }

    lines.push('');
    lines.push(separator('-', SEPARATOR_LENGTH));
    lines.push('');
  });

  return lines.join('\n');
}

function buildTranscriptHeader(data: ExportData): string {
  return [
    COMPANY.name.toUpperCase(),
    'WHATSAPP CONVERSATION TRANSCRIPT',
    separator(),
    '',
    'CONVERSATION INFORMATION',
    separator(),
    '',
    formatField('Account', data.accountName),
    formatField('Contact', data.contactName),
    formatField('Phone', data.contactPhone),
    formatField('Conversation ID', data.conversationId),
    formatField('Total Messages', data.messages.length),
    '',
    formatField('Exported By', data.generatedByName),
    formatField('Exporter Email', data.generatedByEmail),
    formatField('Exported At', formatTimestamp(data.generatedAtIso)),
    '',
    separator(),
    '',
    'MESSAGE HISTORY',
    separator(),
    '',
  ].join('\n');
}

function buildTranscriptFooter(hash: string): string {
  return [
    '',
    '',
    separator(),
    'EXPORT INTEGRITY',
    separator(),
    '',
    'The SHA-256 hash below was calculated from the message',
    'transcript body at the time of export.',
    '',
    `SHA-256: ${hash}`,
    '',
    'Recomputing this hash over the same message body should',
    'produce the same value. A different value indicates that',
    'the message body used for verification differs from the',
    'message body represented by this export.',
    '',
    separator(),
    'RECORD INFORMATION',
    separator(),
    '',
    'This transcript was generated automatically from WhatsApp',
    'Business API message records stored in the system database.',
    '',
    'Timestamps are shown in UTC.',
    '',
    'Message delivery statuses and WhatsApp message IDs are',
    'included as reported by WhatsApp/Meta, where available.',
    '',
    'This document is an exported representation of the records',
    'stored in the system and does not independently establish',
    'the authenticity of any underlying communication.',
    '',
    separator(),
    COMPANY.name.toUpperCase(),
    `${COMPANY.email} | ${COMPANY.phone}`,
    separator(),
  ].join('\n');
}

export async function buildTextTranscript(data: ExportData): Promise<string> {
  /*
   * Build the message body first.
   *
   * The hash represents ONLY the message history.
   * Header/footer changes therefore do not affect
   * message integrity verification.
   */
  const body = buildTextTranscriptBody(data);

  const hash = await sha256Hex(body);

  const header = buildTranscriptHeader(data);
  const footer = buildTranscriptFooter(hash);

  return header + body + footer;
}

export async function downloadTextExport(data: ExportData) {
  const transcript = await buildTextTranscript(data);

  const blob = new Blob([transcript], {
    type: 'text/plain;charset=utf-8',
  });

  downloadBlob(blob, `${exportFileStem(data)}.txt`);
}

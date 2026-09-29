import type { ExportData } from './conversation-export';
import { downloadBlob, exportFileStem } from './conversation-export';

const STATUS_LABEL: Record<string, string> = {
  sending: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed to send',
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, ' UTC');
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function buildTextTranscriptBody(data: ExportData): string {
  const lines: string[] = [];
  for (const m of data.messages) {
    const status = STATUS_LABEL[m.status] ?? m.status;
    const waId = m.whatsappMessageId ? `, WA-ID: ${m.whatsappMessageId}` : '';
    lines.push(
      `[${formatTimestamp(m.createdAt)}] ${m.senderLabel} (${status}${waId}):`
    );
    lines.push(`    ${m.text.replace(/\n/g, '\n    ')}`);
    if (m.mediaUrl) {
      lines.push(`    Attachment: ${m.mediaUrl}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function buildTextTranscript(data: ExportData): Promise<string> {
  const body = buildTextTranscriptBody(data);
  const hash = await sha256Hex(body);

  const header = [
    'WHATSAPP CONVERSATION EXPORT',
    '='.repeat(60),
    `Account: ${data.accountName}`,
    `Contact: ${data.contactName} (${data.contactPhone})`,
    `Conversation ID: ${data.conversationId}`,
    `Total messages: ${data.messages.length}`,
    `Exported by: ${data.generatedByName} (${data.generatedByEmail})`,
    `Exported at: ${formatTimestamp(data.generatedAtIso)}`,
    '='.repeat(60),
    '',
  ].join('\n');

  const footer = [
    '',
    '='.repeat(60),
    'This transcript was generated automatically from WhatsApp Business',
    'API message records stored in the system database. Timestamps are',
    "shown in UTC. Each entry's delivery status and WA-ID (where present)",
    'are the values WhatsApp/Meta reported for that message.',
    '',
    'Integrity: the SHA-256 hash below is computed over the message',
    'lines only (between the two "====" rules). Recomputing it over the',
    'same lines in this file should reproduce the same value; a mismatch',
    'means the transcript body was altered after export.',
    `SHA-256: ${hash}`,
    '='.repeat(60),
  ].join('\n');

  return header + body + footer;
}

export async function downloadTextExport(data: ExportData) {
  const transcript = await buildTextTranscript(data);
  const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, `${exportFileStem(data)}.txt`);
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Contact, Conversation, Message } from '@/types';

export interface ExportMessage {
  id: string;
  whatsappMessageId: string | null;
  senderLabel: string;
  senderType: Message['sender_type'];
  contentType: Message['content_type'];
  text: string;
  mediaUrl: string | null;
  mediaType: string | null;
  status: Message['status'];
  createdAt: string;
}
export interface ExportData {
  accountName: string;
  contactName: string;
  contactPhone: string;
  conversationId: string;
  generatedByName: string;
  generatedByEmail: string;
  generatedAtIso: string;
  messages: ExportMessage[];
}

const MAX_PAGE = 1000;

function contentLabel(
  m: Pick<Message, 'content_type' | 'content_text' | 'template_name'>
): string {
  switch (m.content_type) {
    case 'text':
      return m.content_text ?? '';
    case 'image':
      return m.content_text ? `[Image] ${m.content_text}` : '[Image]';
    case 'video':
      return m.content_text ? `[Video] ${m.content_text}` : '[Video]';
    case 'audio':
      return '[Voice/audio message]';
    case 'document':
      return m.content_text ? `[Document] ${m.content_text}` : '[Document]';
    case 'location':
      return '[Location shared]';
    case 'template':
      return m.content_text || `[Template: ${m.template_name ?? 'unknown'}]`;
    case 'interactive':
      return m.content_text || '[Interactive message]';
    default:
      return m.content_text ?? '';
  }
}

function senderLabelFor(
  m: Message,
  contactName: string,
  accountName: string
): string {
  if (m.sender_type === 'customer') return contactName;
  if (m.sender_type === 'bot') return 'AI Assistant';
  const name = m.sender_id ? accountName : 'You';
  return name ?? 'You';
}

const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'video/quicktime': 'mov',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/amr': 'amr',
  'audio/aac': 'aac',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

function extensionFromUrl(url: string): string | null {
  const clean = url.split('?')[0].split('#')[0];
  const match = clean.match(/\.([a-zA-Z0-9]{1,5})$/);
  return match ? match[1].toLowerCase() : null;
}

export function archiveMediaFileName(
  message: Pick<ExportMessage, 'mediaUrl' | 'mediaType' | 'senderType'>,
  index: number
): string | null {
  if (!message.mediaUrl) return null;
  const number = String(index + 1).padStart(3, '0');
  const sender =
    message.senderType === 'customer'
      ? 'customer'
      : message.senderType === 'bot'
        ? 'bot'
        : 'agent';
  const ext =
    MEDIA_EXTENSIONS[(message.mediaType ?? '').toLowerCase()] ??
    extensionFromUrl(message.mediaUrl) ??
    'bin';
  return `${number}_${sender}.${ext}`;
}

export async function fetchConversationExportData(
  supabase: SupabaseClient,
  conversation: Conversation,
  contact: Contact,
  accountName: string,
  generatedByName: string,
  generatedByEmail: string
): Promise<ExportData> {
  const allMessages: Message[] = [];
  for (let from = 0; ; from += MAX_PAGE) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true })
      .range(from, from + MAX_PAGE - 1);
    if (error) throw error;
    allMessages.push(...((data ?? []) as Message[]));
    if (!data || data.length < MAX_PAGE) break;
  }

  const agentIds = Array.from(
    new Set(
      allMessages
        .filter((m) => m.sender_type === 'agent' && m.sender_id)
        .map((m) => m.sender_id as string)
    )
  );
  const profileNames = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name')
      .in('user_id', agentIds);
    profiles?.forEach((p: { user_id: string; full_name: string | null }) => {
      profileNames.set(p.user_id, p.full_name ?? 'Agent');
    });
  }

  const contactName = contact.name || contact.phone || 'Unknown contact';

  console.log(JSON.stringify(allMessages, null, 2));

  return {
    accountName,
    contactName,
    contactPhone: contact.phone || '—',
    conversationId: conversation.id,
    generatedByName,
    generatedByEmail,
    generatedAtIso: new Date().toISOString(),
    messages: allMessages.map((m) => ({
      id: m.id,
      whatsappMessageId: m.message_id ?? null,
      senderLabel: senderLabelFor(m, contactName, accountName),
      senderType: m.sender_type,
      contentType: m.content_type,
      text: contentLabel(m),
      mediaUrl: m.media_url ?? null,
      mediaType: m.media_type ?? null,
      status: m.status,
      createdAt: m.created_at,
    })),
  };
}

export function exportFileStem(data: ExportData): string {
  const safeName = data.contactName.replace(/[^\w\-]+/g, '_').slice(0, 40);
  const date = data.generatedAtIso.slice(0, 10);
  return `whatsapp-chat_${safeName}_${date}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

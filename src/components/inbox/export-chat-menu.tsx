'use client';

import { useState } from 'react';
import { Download, FileText, FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { Contact, Conversation } from '@/types';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { fetchConversationExportData } from '@/lib/export/conversation-export';
import { downloadTextExport } from '@/lib/export/text-export';
import { buildAndDownloadPdf } from '@/lib/export/pdf-export';

interface ExportChatMenuProps {
  conversation: Conversation;
  contact: Contact;
}

export function ExportChatMenu({ conversation, contact }: ExportChatMenuProps) {
  const t = useTranslations('Inbox.messageThread');
  const supabase = createClient();
  const { profile, account } = useAuth();
  const [exporting, setExporting] = useState<'pdf' | 'text' | null>(null);

  async function handleExport(format: 'pdf' | 'text') {
    if (exporting) return;
    setExporting(format);
    try {
      const data = await fetchConversationExportData(
        supabase,
        conversation,
        contact,
        account?.name ?? '—',
        profile?.full_name ?? 'Unknown user',
        profile?.email ?? '—'
      );
      if (data.messages.length === 0) {
        toast.error(t('exportEmpty'));
        return;
      }
      if (format === 'pdf') {
        buildAndDownloadPdf(data);
      } else {
        await downloadTextExport(data);
      }
      toast.success(t('exportSuccess'));
    } catch (err) {
      console.error('chat export failed', err);
      toast.error(t('exportFailed'));
    } finally {
      setExporting(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-7 w-9 items-center justify-center rounded-md transition-colors disabled:opacity-60"
        disabled={exporting !== null}
        title={t('exportChat')}
        aria-label={t('exportChat')}
      >
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="border-border bg-popover w-44"
      >
        <DropdownMenuItem
          onClick={() => handleExport('pdf')}
          className="text-popover-foreground text-sm"
        >
          <FileDown className="h-3.5 w-3.5" />
          {t('exportAsPdf')}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleExport('text')}
          className="text-popover-foreground text-sm"
        >
          <FileText className="h-3.5 w-3.5" />
          {t('exportAsText')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

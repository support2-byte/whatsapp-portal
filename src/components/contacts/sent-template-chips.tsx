"use client";

import { Clock } from "lucide-react";
import { useTemplateCooldowns } from "@/hooks/use-template-cooldowns";
import { formatCountdown, formatRemaining } from "@/lib/whatsapp/template-cooldown";

interface SentTemplateChipsProps {
  phone?: string | null;
  refreshKey?: number;
}

export function SentTemplateChips({ phone, refreshKey = 0 }: SentTemplateChipsProps) {
  const { entries } = useTemplateCooldowns(phone, true, refreshKey);

  if (entries.length === 0) return null;

  return (
    <>
      {entries.map((entry) => (
        <span
          key={entry.name}
          title={`Sent ${new Date(entry.sentAt).toLocaleString()}. Can be sent again in ${formatRemaining(entry.remaining)}.`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300"
        >
          <Clock className="size-3 shrink-0" />
          <span className="text-amber-300/70">Sent</span>
          <span className="truncate">{entry.name}</span>
          <span className="font-mono tabular-nums">{formatCountdown(entry.remaining)}</span>
        </span>
      ))}
    </>
  );
}

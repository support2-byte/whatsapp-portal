"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Conversation } from "@/types";
import { phoneKey } from "@/lib/whatsapp/template-cooldown";
import { TEMPLATE_SENT_EVENT } from "@/lib/whatsapp/template-events";

export interface SentTemplateInfo {
  names: string[];
  lastSentAt: string;
}

const EMPTY = new Map<string, SentTemplateInfo>();
const CHUNK = 200;

export function useSentTemplateSummary(
  conversations: Conversation[],
  resyncToken: number = 0,
) {
  const [summary, setSummary] = useState<Map<string, SentTemplateInfo>>(EMPTY);
  const [version, setVersion] = useState(0);

  const phonesSig = useMemo(() => {
    const set = new Set<string>();
    for (const c of conversations) {
      const phone = c.contact?.phone;
      if (!phone) continue;
      const key = phoneKey(phone);
      if (key) set.add(key);
    }
    return Array.from(set).sort().join(",");
  }, [conversations]);

  useEffect(() => {
    const onSent = () => setVersion((v) => v + 1);
    window.addEventListener(TEMPLATE_SENT_EVENT, onSent);
    return () => window.removeEventListener(TEMPLATE_SENT_EVENT, onSent);
  }, []);

  useEffect(() => {
    if (!phonesSig) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const phones = phonesSig.split(",");
      const next = new Map<string, SentTemplateInfo>();
      for (let i = 0; i < phones.length; i += CHUNK) {
        const { data, error } = await supabase.rpc("template_sent_summary", {
          p_phones: phones.slice(i, i + CHUNK),
        });
        if (error) {
          console.error("Failed to load sent templates:", error.message);
          continue;
        }
        for (const row of (data ?? []) as {
          phone_normalized: string;
          template_name: string;
          last_sent_at: string;
        }[]) {
          const existing = next.get(row.phone_normalized);
          if (existing) {
            existing.names.push(row.template_name);
            if (row.last_sent_at > existing.lastSentAt) {
              existing.lastSentAt = row.last_sent_at;
            }
          } else {
            next.set(row.phone_normalized, {
              names: [row.template_name],
              lastSentAt: row.last_sent_at,
            });
          }
        }
      }
      if (!cancelled) setSummary(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [phonesSig, resyncToken, version]);

  return phonesSig ? summary : EMPTY;
}

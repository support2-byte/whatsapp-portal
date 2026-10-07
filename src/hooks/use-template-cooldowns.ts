"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  TEMPLATE_COOLDOWN_MS,
  cooldownRemainingSeconds,
  phoneKey,
} from "@/lib/whatsapp/template-cooldown";

export interface CooldownEntry {
  name: string;
  sentAt: string;
  remaining: number;
}

const EMPTY: Record<string, string> = {};

export function useTemplateCooldowns(
  phone: string | null | undefined,
  active: boolean,
  refreshKey: number = 0,
) {
  const [loaded, setLoaded] = useState<{
    key: string;
    sends: Record<string, string>;
  }>({ key: "", sends: EMPTY });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const key = phone ? phoneKey(phone) : "";

  useEffect(() => {
    if (!active || !key) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const cutoff = new Date(Date.now() - TEMPLATE_COOLDOWN_MS).toISOString();
      const { data } = await supabase
        .from("template_send_log")
        .select("template_name, sent_at")
        .eq("phone_normalized", key)
        .gte("sent_at", cutoff);
      if (cancelled) return;
      const sends: Record<string, string> = {};
      for (const row of (data ?? []) as { template_name: string; sent_at: string }[]) {
        if (!sends[row.template_name] || row.sent_at > sends[row.template_name]) {
          sends[row.template_name] = row.sent_at;
        }
      }
      setLoaded({ key, sends });
      setNowMs(Date.now());
    })();
    return () => {
      cancelled = true;
    };
  }, [active, key, refreshKey]);

  const sends = key && loaded.key === key ? loaded.sends : EMPTY;
  const hasSends = Object.keys(sends).length > 0;

  useEffect(() => {
    if (!active || !hasSends) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active, hasSends]);

  const entries: CooldownEntry[] = Object.entries(sends)
    .map(([name, sentAt]) => ({
      name,
      sentAt,
      remaining: cooldownRemainingSeconds(sentAt, nowMs),
    }))
    .filter((e) => e.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);

  return { sends, entries, nowMs };
}

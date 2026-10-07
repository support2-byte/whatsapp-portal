import type { SupabaseClient } from "@supabase/supabase-js";

export const TEMPLATE_COOLDOWN_MINUTES = 24 * 60;
export const TEMPLATE_COOLDOWN_MS = TEMPLATE_COOLDOWN_MINUTES * 60 * 1000;

export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "");
}

export interface TemplateClaim {
  claimed: boolean;
  logId: string | null;
  lastSentAt: string | null;
}

export async function claimTemplateSend(
  db: SupabaseClient,
  args: {
    accountId: string;
    templateName: string;
    templateLanguage?: string | null;
    phone: string;
    contactId?: string | null;
    userId?: string | null;
  },
): Promise<TemplateClaim | null> {
  const key = phoneKey(args.phone);
  if (!key) return null;

  const { data, error } = await db.rpc("claim_template_send", {
    p_account_id: args.accountId,
    p_template_name: args.templateName,
    p_template_language: args.templateLanguage ?? null,
    p_phone_normalized: key,
    p_contact_id: args.contactId ?? null,
    p_user_id: args.userId ?? null,
    p_window_minutes: TEMPLATE_COOLDOWN_MINUTES,
  });
  if (error) throw new Error(`Template cooldown check failed: ${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as
    | { claimed: boolean; log_id: string | null; last_sent_at: string | null }
    | undefined;
  if (!row) throw new Error("Template cooldown check returned nothing.");

  return {
    claimed: row.claimed,
    logId: row.log_id,
    lastSentAt: row.last_sent_at,
  };
}

export async function releaseTemplateClaim(
  db: SupabaseClient,
  claim: TemplateClaim | null,
): Promise<void> {
  if (!claim?.claimed || !claim.logId) return;
  await db.from("template_send_log").delete().eq("id", claim.logId);
}

export function cooldownRemainingSeconds(
  lastSentAt: string,
  now: number = Date.now(),
): number {
  const elapsed = now - new Date(lastSentAt).getTime();
  return Math.max(0, Math.ceil((TEMPLATE_COOLDOWN_MS - elapsed) / 1000));
}

export function formatRemaining(seconds: number): string {
  const totalMinutes = Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  if (minutes === 0) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${hours}h ${minutes}m`;
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

export function cooldownMessage(lastSentAt: string): string {
  return `Already sent. This template was sent to this number within the last 24 hours. You can send it again in ${formatRemaining(cooldownRemainingSeconds(lastSentAt))}.`;
}

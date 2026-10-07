export const TEMPLATE_SENT_EVENT = "wacrm:template-sent";

export function notifyTemplateSent(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TEMPLATE_SENT_EVENT));
}

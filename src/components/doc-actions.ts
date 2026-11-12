import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { describeDays } from "@/lib/compliance";
import type { Driver, EnrichedDoc, FleetData } from "@/lib/fleet";

export type ReminderChannel = "email" | "sms" | "magic_link";

const UPLOADABLE_DOC_TYPES = new Set(["cdl", "medical_card", "annual_inspection"]);

export function buildMagicUploadUrl(
  origin: string,
  magicToken: string,
  docType?: string | null,
): string {
  const baseOrigin = origin.replace(/\/+$/, "");
  const path = `${baseOrigin}/u/${magicToken}`;
  if (docType && UPLOADABLE_DOC_TYPES.has(docType)) {
    return `${path}?type=${encodeURIComponent(docType)}`;
  }
  return path;
}

export function formatExpirationDetails(
  doc: Pick<EnrichedDoc, "days" | "expires_on" | "status">,
): string {
  const statusText = describeDays(doc.days);
  if (doc.expires_on) {
    const formattedDate = format(new Date(doc.expires_on + "T00:00:00"), "MMM d, yyyy");
    return `${statusText} (${formattedDate})`;
  }
  return statusText;
}

export function buildReminderEmailHref(params: {
  toEmail?: string | null | undefined;
  driverName: string;
  companyName?: string | null | undefined;
  docLabel: string;
  expirationDetails: string;
  magicUrl: string;
}): string {
  const recipient = (params.toEmail ?? "").trim();
  const carrier = params.companyName?.trim() || "your fleet";
  const subject = `Action Required: ${params.docLabel} (${params.expirationDetails}) — ${carrier}`;
  const bodyLines = [
    `Hi ${params.driverName},`,
    "",
    `Please upload an updated copy of your ${params.docLabel} for ${carrier}.`,
    `Current status: ${params.expirationDetails}`,
    "",
    `Use your secure Magic Upload Link below from your phone (no login or password required):`,
    params.magicUrl,
    "",
    `Thank you,`,
    `${carrier} Safety & Compliance`,
  ];
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join("\n"))}`;
}

export function buildReminderSmsHref(params: {
  toPhone?: string | null | undefined;
  driverName: string;
  docLabel: string;
  expirationDetails: string;
  magicUrl: string;
}): string {
  const cleanPhone = (params.toPhone ?? "").replace(/[^\d+]/g, "");
  const firstName = params.driverName.trim().split(/\s+/)[0] || params.driverName;
  const body = `Hi ${firstName}, your ${params.docLabel} is ${params.expirationDetails}. Upload a quick photo here (no password needed): ${params.magicUrl}`;
  return `sms:${cleanPhone}?&body=${encodeURIComponent(body)}`;
}

export function resolveReminderDriver(
  doc: EnrichedDoc,
  data: FleetData,
  fallbackDriverId?: string,
): Driver | undefined {
  if (doc.driver_id) {
    return data.drivers.find((d) => d.id === doc.driver_id);
  }
  if (fallbackDriverId) {
    return data.drivers.find((d) => d.id === fallbackDriverId);
  }
  return data.drivers[0];
}

export async function logReminder(
  doc: Pick<EnrichedDoc, "id" | "company_id">,
  channel: ReminderChannel,
  sentTo: string | null,
): Promise<boolean> {
  const { error } = await supabase.from("reminders").insert({
    company_id: doc.company_id,
    document_id: doc.id,
    channel,
    sent_to: sentTo || null,
  });
  return !error;
}

export async function sendReminder(doc: EnrichedDoc, data: FleetData) {
  const driver = doc.driver_id ? data.drivers.find((d) => d.id === doc.driver_id) : undefined;
  const sentTo = driver
    ? [driver.phone, driver.email].filter(Boolean).join(" · ")
    : "Fleet manager";
  const ok = await logReminder(doc, "sms_email" as ReminderChannel, sentTo || null);
  if (!ok) {
    toast.error("Could not queue the reminder");
    return;
  }
  toast.success(`Reminder logged for ${doc.ownerName}`, {
    description: `${doc.label}${sentTo ? ` → ${sentTo}` : ""}`,
  });
}

export async function updateExpiration(docId: string, expiresOn: string | null) {
  const { error } = await supabase
    .from("documents")
    .update({ expires_on: expiresOn })
    .eq("id", docId);
  if (error) throw error;
}

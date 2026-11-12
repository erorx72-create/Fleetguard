import { useMemo, useState } from "react";
import { Check, Copy, Link2, Mail, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildMagicUploadUrl,
  buildReminderEmailHref,
  buildReminderSmsHref,
  formatExpirationDetails,
  logReminder,
  resolveReminderDriver,
} from "@/components/doc-actions";
import { useCompany } from "@/hooks/use-company";
import type { EnrichedDoc, FleetData } from "@/lib/fleet";

export function SendReminderDialog({
  doc,
  data,
  open,
  onOpenChange,
}: {
  doc: EnrichedDoc | null;
  data: FleetData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { company } = useCompany();
  const [selectedDriverId, setSelectedDriverId] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const driver = useMemo(() => {
    if (!doc) return undefined;
    return resolveReminderDriver(doc, data, selectedDriverId || undefined);
  }, [doc, data, selectedDriverId]);

  if (!doc) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const magicUrl = driver
    ? buildMagicUploadUrl(origin, driver.magic_token, doc.doc_type)
    : origin
      ? `${origin}/trucks/${doc.ownerId}`
      : "";

  const expirationDetails = formatExpirationDetails(doc);
  const recipientName = doc.ownerKind === "driver" ? doc.ownerName : (driver?.full_name ?? "Team");

  const emailHref = buildReminderEmailHref({
    toEmail: driver?.email,
    driverName: recipientName,
    companyName: company?.name,
    docLabel: `${doc.ownerName} — ${doc.label}`,
    expirationDetails,
    magicUrl,
  });

  const smsHref = buildReminderSmsHref({
    toPhone: driver?.phone,
    driverName: recipientName,
    docLabel: doc.ownerKind === "driver" ? doc.label : `${doc.ownerName} ${doc.label}`,
    expirationDetails,
    magicUrl,
  });

  async function handleCopy() {
    if (!magicUrl || !doc) return;
    try {
      await navigator.clipboard.writeText(magicUrl);
      setCopied(true);
      toast.success("Magic upload link copied");
      void logReminder(doc, "magic_link", driver?.phone ?? driver?.email ?? doc.ownerName);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy link — copy it manually from the box above");
    }
  }

  function handleChannelClick(channel: "email" | "sms") {
    if (!doc) return;
    const sentTo =
      channel === "email" ? (driver?.email ?? doc.ownerName) : (driver?.phone ?? doc.ownerName);
    void logReminder(doc, channel, sentTo);
    toast.success(
      channel === "email"
        ? `Email draft opened${driver?.email ? ` for ${driver.email}` : ""}`
        : `SMS draft opened${driver?.phone ? ` for ${driver.phone}` : ""}`,
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <span className="inline-flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
            <Link2 className="size-5" />
          </span>
          <DialogTitle className="pt-1 font-display text-xl">Send Compliance Reminder</DialogTitle>
          <DialogDescription>
            Notify {doc.ownerName} about{" "}
            <span className="font-semibold text-foreground">{doc.label}</span> ({expirationDetails})
            with a zero-login upload link.
          </DialogDescription>
        </DialogHeader>

        {doc.ownerKind === "vehicle" && data.drivers.length > 0 && (
          <div className="space-y-1.5">
            <Label>Assign upload link to driver</Label>
            <Select value={driver?.id ?? ""} onValueChange={(v) => setSelectedDriverId(v)}>
              <SelectTrigger aria-label="Driver for magic upload link">
                <SelectValue placeholder="Choose driver" />
              </SelectTrigger>
              <SelectContent>
                {data.drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2 rounded-xl border border-border bg-muted/50 p-3.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground">
            <span>
              Email:{" "}
              <strong className="text-foreground">{driver?.email || "Enter in mail app"}</strong>
            </span>
            <span>
              SMS:{" "}
              <strong className="text-foreground">
                {driver?.phone || "Enter in messages app"}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 pl-3">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
              {magicUrl}
            </span>
            <Button type="button" size="sm" variant="surface" onClick={() => void handleCopy()}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy Link"}
            </Button>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-3">
          <Button asChild variant="signal" className="w-full whitespace-nowrap">
            <a href={emailHref} onClick={() => handleChannelClick("email")}>
              <Mail /> Send Email
            </a>
          </Button>
          <Button asChild variant="surface" className="w-full whitespace-nowrap">
            <a href={smsHref} onClick={() => handleChannelClick("sms")}>
              <MessageSquareText /> Send SMS
            </a>
          </Button>
          <Button
            type="button"
            variant="surface"
            className="w-full whitespace-nowrap"
            onClick={() => void handleCopy()}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy Magic Link"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

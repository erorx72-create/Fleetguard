import { useState, type ReactNode } from "react";
import { Check, Copy, Link2, Mail, MessageSquareText, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  buildMagicUploadUrl,
  buildReminderEmailHref,
  buildReminderSmsHref,
} from "@/components/doc-actions";
import { useCompany } from "@/hooks/use-company";
import { supabase } from "@/integrations/supabase/client";
import { useInvalidateFleet } from "@/hooks/use-fleet";
import type { Driver } from "@/lib/fleet";

export function MagicLinkDialog({
  driver,
  trigger,
  compact = false,
}: {
  driver: Driver;
  trigger?: ReactNode;
  compact?: boolean;
}) {
  const invalidate = useInvalidateFleet();
  const { company } = useCompany();
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const link = origin ? buildMagicUploadUrl(origin, driver.magic_token) : "";
  const firstName = driver.full_name.split(" ")[0] || driver.full_name;

  const emailHref = buildReminderEmailHref({
    toEmail: driver.email,
    driverName: firstName,
    companyName: company?.name,
    docLabel: "CDL / DOT Medical Card",
    expirationDetails: "Requested for review",
    magicUrl: link,
  });

  const smsHref = buildReminderSmsHref({
    toPhone: driver.phone,
    driverName: firstName,
    docLabel: "compliance documents",
    expirationDetails: "needed for your driver file",
    magicUrl: link,
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Magic link copied");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy link — select and copy it from the box above");
    }
  }

  async function reset() {
    setResetting(true);
    const { error } = await supabase
      .from("drivers")
      .update({ magic_token: crypto.randomUUID() })
      .eq("id", driver.id);
    setResetting(false);
    if (error) toast.error("Could not reset link");
    else {
      toast.success("New link generated — the old one no longer works");
      await invalidate();
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="surface" size={compact ? "sm" : "lg"}>
            <Link2 /> Driver Magic Link
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-gradient-signal text-primary-foreground shadow-glow">
            <Smartphone className="size-6" />
          </span>
          <DialogTitle className="pt-2 font-display text-xl">
            Magic upload link for {firstName}
          </DialogTitle>
          <DialogDescription>
            {firstName} opens this on their phone and snaps photos of their CDL or Medical Card. No
            app, no password.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/60 p-2 pl-4">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {link}
          </span>
          <Button size="sm" variant="signal" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy Link"}
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button asChild variant="surface" className="w-full whitespace-nowrap">
            <a
              href={emailHref}
              onClick={() =>
                toast.success(`Email draft opened${driver.email ? ` for ${driver.email}` : ""}`)
              }
            >
              <Mail /> {driver.email ? `Email ${firstName}` : "Send via Email"}
            </a>
          </Button>
          <Button asChild variant="surface" className="w-full whitespace-nowrap">
            <a
              href={smsHref}
              onClick={() =>
                toast.success(`SMS draft opened${driver.phone ? ` for ${driver.phone}` : ""}`)
              }
            >
              <MessageSquareText /> {driver.phone ? `Text ${driver.phone}` : "Send via SMS"}
            </a>
          </Button>
        </div>

        <div className="flex justify-end border-t border-border pt-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={resetting}
            onClick={() => void reset()}
            className="text-muted-foreground"
          >
            <RefreshCw className={resetting ? "animate-spin" : undefined} /> Reset link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

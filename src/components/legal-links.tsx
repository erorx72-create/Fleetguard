import { Link } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export const SUPPORT_EMAIL = "erorx72@gmail.com";
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
  "FleetGuard Support Request",
)}`;

export function LegalLinks({
  className,
  showSupportButton = false,
}: {
  className?: string | undefined;
  showSupportButton?: boolean | undefined;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-2 text-sm", className)}>
      <Link
        to="/privacy"
        className="font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Privacy Policy
      </Link>
      <Link
        to="/terms"
        className="font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Terms of Service
      </Link>
      <a
        href={SUPPORT_MAILTO}
        className={cn(
          "inline-flex items-center gap-1.5 font-semibold transition-colors",
          showSupportButton
            ? "rounded-lg border border-border bg-card px-3 py-1.5 text-foreground hover:border-primary/40 hover:text-primary"
            : "text-primary hover:underline",
        )}
      >
        <Mail className="size-3.5 shrink-0" />
        <span>Contact Support ({SUPPORT_EMAIL})</span>
      </a>
    </div>
  );
}

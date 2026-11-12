import { Lock } from "lucide-react";
import { PricingModalContent } from "@/components/pricing-cards";
import type { PlanId } from "@/hooks/use-subscription";

export function PaywallOverlay({ activePlanId }: { activePlanId?: PlanId | undefined }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/75 p-4 backdrop-blur-md md:items-center md:p-8"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div className="my-auto w-full max-w-5xl rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-lift md:p-10">
        <div className="mx-auto mb-6 max-w-2xl text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger-foreground">
            <Lock className="size-7" />
          </div>
          <h1 id="paywall-title" className="font-display text-3xl font-extrabold text-foreground">
            Your 3-Day Free Trial Has Ended
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account is over 72 hours old and does not have an active paid subscription. Select
            a plan below to restore full access to your fleet compliance dashboard.
          </p>
        </div>

        <PricingModalContent activePlanId={activePlanId} />
      </div>
    </div>
  );
}

export function PaywallLoadingSkeleton() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 backdrop-blur-md">
      <div className="h-8 w-8 animate-pulse rounded-full bg-navy-foreground/20" />
    </div>
  );
}

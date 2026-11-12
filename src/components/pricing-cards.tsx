import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Crown, Gem, Check, type LucideIcon } from "lucide-react";
import { LegalLinks } from "@/components/legal-links";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  FLAT_PRICING_HEADER,
  PLANS,
  buildMailto,
  type Plan,
  type PlanId,
} from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";

const PLAN_ICONS: Record<Plan["icon"], LucideIcon> = {
  starter: ShieldCheck,
  platinum: Crown,
  diamond: Gem,
};

function useUserEmail() {
  return useQuery({
    queryKey: ["user-email"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.email ?? "";
    },
    staleTime: 30_000,
  });
}

export function PricingCards({
  onModalClose,
  activePlanId,
}: {
  onModalClose?: (() => void) | undefined;
  activePlanId?: PlanId | undefined;
}) {
  const { data: email } = useUserEmail();

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {PLANS.map((plan, idx) => (
        <PricingCard
          key={plan.id}
          plan={plan}
          email={email ?? ""}
          delay={idx * 0.08}
          onModalClose={onModalClose}
          isCurrent={activePlanId === plan.id}
        />
      ))}
    </div>
  );
}

function PricingCard({
  plan,
  email,
  delay,
  onModalClose,
  isCurrent,
}: {
  plan: Plan;
  email: string;
  delay: number;
  onModalClose?: (() => void) | undefined;
  isCurrent?: boolean | undefined;
}) {
  const Icon = PLAN_ICONS[plan.icon];
  const isFeatured = plan.id === "platinum";

  return (
    <div
      className={cn(
        "surface-card surface-interactive animate-rise flex flex-col p-6",
        isFeatured && "bg-gradient-signal text-primary-foreground shadow-glow",
      )}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="mb-4 flex items-center gap-3">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            isFeatured ? "bg-white/15" : "bg-accent",
          )}
        >
          <Icon className="size-6" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-base font-extrabold tracking-tight">{plan.name}</h3>
          <p className={cn("text-xs", isFeatured ? "text-white/80" : "text-muted-foreground")}>
            {plan.audience}
          </p>
        </div>
      </div>

      <div className="mb-5 border-b border-current/15 pb-4">
        <p className="font-display text-3xl font-extrabold tabular-nums">
          ${plan.price.toLocaleString("en-US")}
          <span
            className={cn(
              "ml-1 text-sm font-semibold",
              isFeatured ? "text-white/80" : "text-muted-foreground",
            )}
          >
            /month flat
          </span>
        </p>
        {isCurrent && (
          <p
            className={cn("mt-1 text-xs font-semibold", isFeatured ? "text-white" : "text-primary")}
          >
            Current active tier
          </p>
        )}
      </div>

      <ul className="mb-6 space-y-2.5 text-sm">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check
              className={cn(
                "mt-0.5 size-4 shrink-0",
                isFeatured ? "text-white" : "text-success-foreground",
              )}
            />
            <span className={isFeatured ? "text-white/95" : "text-foreground"}>{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        asChild
        variant={isFeatured ? "surface" : "signal"}
        className="mt-auto w-full"
        onClick={onModalClose}
      >
        <a href={buildMailto(plan.id, email)}>Select Plan</a>
      </Button>
    </div>
  );
}

export function PricingModalContent({
  onClose,
  activePlanId,
}: {
  onClose?: (() => void) | undefined;
  activePlanId?: PlanId | undefined;
}) {
  return (
    <div className="px-1 py-2">
      <div className="mb-6 text-center">
        <p className="text-sm font-extrabold tracking-tight text-primary">{FLAT_PRICING_HEADER}</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold text-foreground">
          Choose Your FleetGuard Plan
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select a flat monthly plan below to send your activation request directly to our team.
        </p>
      </div>
      <PricingCards onModalClose={onClose} activePlanId={activePlanId} />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          Month-to-month flat rate. Zero per-driver fees or surprise charges.
        </p>
        <LegalLinks showSupportButton className="text-xs" />
      </div>
    </div>
  );
}

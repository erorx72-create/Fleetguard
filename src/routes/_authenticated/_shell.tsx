import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { format } from "date-fns";
import { Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AppSidebar } from "@/components/app-sidebar";
import { LegalLinks } from "@/components/legal-links";
import { CompanyProvider, useCompany } from "@/hooks/use-company";
import { TrialBanner } from "@/components/trial-banner";
import { PaywallOverlay } from "@/components/paywall-overlay";
import { PricingModalContent } from "@/components/pricing-cards";
import { isSuperAdminEmail, useSubscription } from "@/hooks/use-subscription";
import { useSessionGuard } from "@/hooks/use-session-guard";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_shell")({
  component: ShellLayout,
});

function formatTrialBadge(hoursRemaining: number): string {
  const totalMinutes = Math.max(0, Math.round(hoursRemaining * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  if (days >= 1) return `Free Trial: ${days}d ${hours}h left`;
  return `Free Trial: ${hours}h ${mins}m left`;
}

function ShellLayout() {
  useSessionGuard();
  const [showPricing, setShowPricing] = useState(false);
  const { data: subscription } = useSubscription();
  const { data: authUser } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user ?? null;
    },
    staleTime: 60_000,
  });
  const isSuperAdmin = isSuperAdminEmail(authUser?.email);
  const isLocked = isSuperAdmin ? false : (subscription?.is_locked ?? false);
  const trialHours = subscription?.trial_hours_remaining ?? 72;
  const isTrialActive = isSuperAdmin ? false : (subscription?.is_trial_active ?? true);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = shellRef.current as (HTMLDivElement & { inert?: boolean }) | null;
    if (el) el.inert = isLocked;
  }, [isLocked]);

  useEffect(() => {
    if (!isLocked) return;
    setShowPricing(false);
    const blockEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", blockEscape, true);
    return () => window.removeEventListener("keydown", blockEscape, true);
  }, [isLocked]);

  return (
    <CompanyProvider>
      <div
        ref={shellRef}
        aria-hidden={isLocked}
        className={cn(isLocked && "pointer-events-none select-none")}
      >
        <SidebarProvider>
          <div className="flex min-h-screen w-full">
            <AppSidebar onOpenPricing={() => setShowPricing(true)} />
            <SidebarInset className="bg-background">
              {isTrialActive && !isLocked && (
                <TrialBanner hoursRemaining={trialHours} onUpgrade={() => setShowPricing(true)} />
              )}
              <TopBar
                trialHours={trialHours}
                isTrialActive={isTrialActive && !isLocked}
                onOpenPricing={() => setShowPricing(true)}
              />
              <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 md:px-8 md:py-10">
                <Outlet />
              </main>
              <footer className="print-hidden border-t border-border/70 bg-card/40 px-5 py-4 md:px-8">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                  <p>© {new Date().getFullYear()} FleetGuard. All-inclusive DOT compliance.</p>
                  <LegalLinks className="text-xs" />
                </div>
              </footer>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </div>

      {isLocked && <PaywallOverlay activePlanId={subscription?.plan} />}

      <Dialog open={showPricing && !isLocked} onOpenChange={setShowPricing}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogTitle className="sr-only">FleetGuard Pricing Plans</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a subscription plan to upgrade your account.
          </DialogDescription>
          <PricingModalContent
            activePlanId={subscription?.plan}
            onClose={() => setShowPricing(false)}
          />
        </DialogContent>
      </Dialog>
    </CompanyProvider>
  );
}

function TopBar({
  trialHours,
  isTrialActive,
  onOpenPricing,
}: {
  trialHours: number;
  isTrialActive: boolean;
  onOpenPricing: () => void;
}) {
  const { company } = useCompany();
  const isCritical = trialHours < 24;

  return (
    <header className="print-hidden sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl md:px-6">
      <SidebarTrigger className="text-muted-foreground" />
      <span className="h-5 w-px bg-border" />
      <p className="truncate text-sm font-semibold">{company?.name}</p>
      <div className="ml-auto flex items-center gap-3">
        {isTrialActive && (
          <button
            type="button"
            onClick={onOpenPricing}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-xs font-semibold tabular-nums transition-colors",
              isCritical
                ? "border-danger/30 bg-danger-soft text-danger-foreground hover:bg-danger/15"
                : "border-warning/30 bg-warning-soft text-warning-foreground hover:bg-warning/15",
            )}
          >
            <Clock className="size-3.5" />
            {formatTrialBadge(trialHours)}
          </button>
        )}
        <p className="hidden font-mono text-xs text-muted-foreground sm:block">
          {format(new Date(), "EEE, MMM d yyyy")}
        </p>
      </div>
    </header>
  );
}

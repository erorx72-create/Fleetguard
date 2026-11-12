import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Building2, Lock, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { PricingModalContent } from "@/components/pricing-cards";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCompany } from "@/hooks/use-company";
import { useFleet } from "@/hooks/use-fleet";
import { useRoleAccess, type TeamRole } from "@/hooks/use-role-access";
import { useSubscription } from "@/hooks/use-subscription";

export const Route = createFileRoute("/_authenticated/_shell/team")({
  head: () => ({
    meta: [
      { title: "Team & Access — FleetGuard" },
      { name: "description", content: "Manage logins, DOT company access, and plan capabilities." },
      { property: "og:title", content: "Team & Access — FleetGuard" },
      {
        property: "og:description",
        content: "Manage logins, DOT company access, and plan capabilities.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamPage,
});

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  safety_manager: "Internal Safety Manager",
  agency_staff: "Agency Staff",
};

function TeamPage() {
  const { data: subscription } = useSubscription();
  const { company } = useCompany();
  const { data: fleet } = useFleet();
  const {
    planId,
    plan,
    canInviteTeam,
    canAddAgencyStaff,
    canUseMultiCompany,
    canWhiteLabelAudit,
    members,
    inviteMember,
    removeMember,
    visibleCompanies,
    whiteLabel,
    updateWhiteLabel,
  } = useRoleAccess();

  const [showPricing, setShowPricing] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"safety_manager" | "agency_staff">("safety_manager");
  const [targetCompanyId, setTargetCompanyId] = useState<string>("all");

  const [inviting, setInviting] = useState(false);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;
    const assignedRole = canAddAgencyStaff ? role : "safety_manager";
    setInviting(true);
    const result = await inviteMember({
      fullName,
      email,
      role: assignedRole,
      companyId: canUseMultiCompany ? targetCompanyId : (company?.id ?? "all"),
    });
    setInviting(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${fullName.trim()} added as ${ROLE_LABELS[assignedRole]}`);
    setFullName("");
    setEmail("");
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Role-Based Access"
        title="Team & Plan Access"
        description="Manage login roles, DOT company isolation, and flat-rate plan allowances."
        actions={
          <Button variant="signal" onClick={() => setShowPricing(true)}>
            View Pricing Plans
          </Button>
        }
      />

      <section className="grid gap-5 md:grid-cols-3">
        <div className="surface-card p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Active Tier
          </p>
          <p className="mt-2 font-display text-xl font-extrabold text-foreground">{plan.name}</p>
          <p className="mt-1 font-mono text-sm text-primary tabular-nums">{plan.priceLabel}</p>
        </div>

        <div className="surface-card p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            DOT Company Scope
          </p>
          <p className="mt-2 font-display text-xl font-extrabold tabular-nums text-foreground">
            {visibleCompanies.length} / {plan.companyLimit} DOT{" "}
            {plan.companyLimit === 1 ? "Company" : "Companies"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {canUseMultiCompany
              ? "Multi-Company Master Dropdown active (up to 50 DOT Companies)"
              : `Strictly locked to ${company?.name ?? "1 DOT Company"}`}
          </p>
        </div>

        <div className="surface-card p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Trucks & Drivers
          </p>
          <p className="mt-2 font-display text-xl font-extrabold tabular-nums text-foreground">
            {fleet.vehicles.length} / {plan.truckLimit > 1000 ? "Unlimited" : plan.truckLimit}{" "}
            Trucks
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Unlimited drivers included · {fleet.drivers.length} active drivers
          </p>
        </div>
      </section>

      {!canInviteTeam ? (
        <section className="surface-card p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-foreground">
                <Lock className="size-5 text-primary" />
                <h2 className="font-display text-xl font-bold">Single Owner Login Only</h2>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                The STARTER PLAN includes Single Owner Login only with team invites disabled.
                Upgrade to PLATINUM DIRECTORS PLAN ($299/month flat) for separate Owner + Internal
                Safety Manager logins locked to your 1 DOT company, or DIAMOND AGENCY PLAN
                ($1,499/month flat) for multiple agency staff logins across up to 50 DOT companies.
              </p>
            </div>
            <Button variant="signal" className="shrink-0" onClick={() => setShowPricing(true)}>
              Upgrade Plan
            </Button>
          </div>
        </section>
      ) : (
        <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div className="surface-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-2.5">
                <Users className="size-5 text-primary" />
                <h2 className="font-display text-lg font-bold">Authorized Logins</h2>
              </div>
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {members.length} active
              </span>
            </div>
            <div className="divide-y divide-border">
              {members.map((m) => {
                const companyLabel =
                  m.companyId === "all"
                    ? "All Client Companies"
                    : (visibleCompanies.find((c) => c.id === m.companyId)?.name ??
                      company?.name ??
                      "Assigned Company");
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-4 px-6 py-4 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground">{m.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.email} · {ROLE_LABELS[m.role]} · {companyLabel}
                      </p>
                    </div>
                    {m.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${m.fullName}`}
                        onClick={async () => {
                          await removeMember(m.id);
                          toast.success(`${m.fullName} removed`);
                        }}
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleInvite} className="surface-card space-y-4 p-6">
            <div>
              <h2 className="font-display text-lg font-bold">
                {planId === "platinum"
                  ? "Add Internal Safety Manager"
                  : "Add Agency Staff / Safety Manager"}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {planId === "platinum"
                  ? `Strictly locked to ${company?.name ?? "your 1 DOT company"}.`
                  : "Assign staff to one carrier or across all managed DOT companies."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staff-name">Full name</Label>
              <Input
                id="staff-name"
                required
                placeholder="Jordan Lee"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staff-email">Work email</Label>
              <Input
                id="staff-email"
                type="email"
                required
                placeholder="safety@carrier.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
              />
            </div>

            {canAddAgencyStaff && (
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as "safety_manager" | "agency_staff")}
                >
                  <SelectTrigger aria-label="Role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agency_staff">Agency Staff</SelectItem>
                    <SelectItem value="safety_manager">Safety Manager</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {canUseMultiCompany ? (
              <div className="space-y-1.5">
                <Label>DOT Company Access</Label>
                <Select value={targetCompanyId} onValueChange={setTargetCompanyId}>
                  <SelectTrigger aria-label="DOT Company Access">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Client DOT Companies</SelectItem>
                    {visibleCompanies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                <Building2 className="size-4 shrink-0 text-primary" />
                <span>Locked to 1 DOT Company: {company?.name ?? "Primary Fleet"}</span>
              </div>
            )}

            <Button type="submit" variant="signal" className="w-full" disabled={inviting}>
              <Plus /> Add Login
            </Button>
          </form>
        </section>
      )}

      {canWhiteLabelAudit && (
        <section className="surface-card space-y-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="size-5 text-primary" />
              <div>
                <h2 className="font-display text-lg font-bold">White-Label DOT Audit Reports</h2>
                <p className="text-xs text-muted-foreground">
                  Replace FleetGuard branding on exported and printed DOT audit reports with your
                  agency name.
                </p>
              </div>
            </div>
            <Switch
              checked={whiteLabel.enabled}
              aria-label="Enable white-label audit reports"
              onCheckedChange={(checked) => updateWhiteLabel({ ...whiteLabel, enabled: checked })}
            />
          </div>
          {whiteLabel.enabled && (
            <div className="max-w-md space-y-1.5">
              <Label htmlFor="wl-agency-name">Agency brand name on audit reports</Label>
              <Input
                id="wl-agency-name"
                placeholder="Apex DOT Compliance Partners"
                value={whiteLabel.agencyName}
                onChange={(e) => updateWhiteLabel({ ...whiteLabel, agencyName: e.target.value })}
                className="h-10"
              />
            </div>
          )}
        </section>
      )}

      <Dialog open={showPricing} onOpenChange={setShowPricing}>
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
    </div>
  );
}

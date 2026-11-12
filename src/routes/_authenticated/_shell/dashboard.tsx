import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertOctagon,
  ArrowRight,
  Building2,
  ClipboardCheck,
  Clock,
  Loader2,
  Search,
  Trash2,
  Truck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { KpiCard } from "@/components/kpi-card";
import { PageHeader } from "@/components/page-header";
import { UrgentTable } from "@/components/urgent-table";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useFleet } from "@/hooks/use-fleet";
import { isRed, safetyScore } from "@/lib/compliance";
import { urgentDocs } from "@/lib/fleet";
import { lookupDotCarrier } from "@/lib/gov-lookup.functions";
import { companyFormSchema } from "@/lib/validation";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { AgencyCompanyMenu } from "@/components/agency-company-menu";
import { PendingReviews } from "@/components/pending-reviews";

export const Route = createFileRoute("/_authenticated/_shell/dashboard")({
  head: () => ({
    meta: [
      { title: "Command Center — FleetGuard" },
      { name: "description", content: "Live DOT compliance overview for your fleet." },
      { property: "og:title", content: "Command Center — FleetGuard" },
      { property: "og:description", content: "Live DOT compliance overview for your fleet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const { data, isLoading, error: fleetError, company } = useFleet();
  const runDotLookup = useServerFn(lookupDotCarrier);

  const [dotModalOpen, setDotModalOpen] = useState(false);
  const [clearingSample, setClearingSample] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [savingDot, setSavingDot] = useState(false);

  const [dotInput, setDotInput] = useState("");
  const [legalName, setLegalName] = useState("");
  const [dbaName, setDbaName] = useState("");
  const [physicalAddress, setPhysicalAddress] = useState("");
  const [carrierStatus, setCarrierStatus] = useState("");
  const [clearSampleToo, setClearSampleToo] = useState(true);

  const expiring = data.documents.filter((d) => d.status === "expiring").length;
  const critical = data.documents.filter((d) => isRed(d.status)).length;
  const urgent = urgentDocs(data);
  const score = safetyScore(data.documents.map((d) => d.status));
  const trucks = data.vehicles.filter((v) => v.kind === "truck").length;

  const showOnboardingCard = Boolean(company && (!company.dot_number || !company.sample_cleared));

  function openDotModal() {
    if (!company) return;
    setDotInput(company.dot_number ?? "");
    setLegalName(company.name);
    setDbaName(company.dba_name ?? "");
    setPhysicalAddress(company.physical_address ?? "");
    setCarrierStatus(company.carrier_status ?? "");
    setClearSampleToo(!company.sample_cleared);
    setDotModalOpen(true);
  }

  async function handleClearSample() {
    if (!company) return;
    setClearingSample(true);
    const { error } = await supabase.rpc("clear_sample_data", { _company: company.id });
    setClearingSample(false);
    if (error) {
      toast.error(error.message || "Could not clear sample data");
      return;
    }
    toast.success("Sample drivers and trucks cleared. Add your real fleet anytime.");
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["companies"] }),
      qc.invalidateQueries({ queryKey: ["fleet", company.id] }),
    ]);
  }

  async function handleFmcsaLookup() {
    const digits = dotInput.replace(/\D/g, "");
    if (!digits) {
      toast.error("Enter a USDOT number first.");
      return;
    }
    setLookingUp(true);
    try {
      const res = await runDotLookup({ data: { dotNumber: digits } });
      if (res.found) {
        setDotInput(res.dotNumber);
        setLegalName(res.legalName);
        setDbaName(res.dbaName);
        setPhysicalAddress(res.physicalAddress);
        setCarrierStatus(res.status);
        toast.success(`FMCSA verified: ${res.legalName}`);
      } else {
        toast.info(res.message ?? "No carrier found in FMCSA SAFER — enter details manually.");
      }
    } catch {
      toast.info("FMCSA lookup timed out — enter carrier details manually.");
    } finally {
      setLookingUp(false);
    }
  }

  async function handleSaveRealDot(e: FormEvent) {
    e.preventDefault();
    if (!company) return;

    const parsed = companyFormSchema.safeParse({
      name: legalName,
      dotNumber: dotInput,
      dbaName,
      physicalAddress,
      carrierStatus,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check carrier fields and try again.");
      return;
    }

    setSavingDot(true);
    const { error } = await supabase
      .from("companies")
      .update({
        name: parsed.data.name,
        dot_number: parsed.data.dotNumber || null,
        dba_name: parsed.data.dbaName || null,
        physical_address: parsed.data.physicalAddress || null,
        carrier_status: parsed.data.carrierStatus || null,
      })
      .eq("id", company.id);

    if (error) {
      setSavingDot(false);
      toast.error(error.message || "Could not update company DOT record.");
      return;
    }

    if (clearSampleToo && !company.sample_cleared) {
      await supabase.rpc("clear_sample_data", { _company: company.id });
    }

    setSavingDot(false);
    setDotModalOpen(false);
    toast.success("Real USDOT carrier profile saved.");
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["companies"] }),
      qc.invalidateQueries({ queryKey: ["fleet", company.id] }),
    ]);
  }

  return (
    <div className="space-y-8">
      <AgencyCompanyMenu />
      <PageHeader
        eyebrow="Command Center"
        title={company ? company.name : "Loading…"}
        description={
          fleetError
            ? "Could not load fleet compliance data."
            : critical > 0
              ? `${critical} item${critical === 1 ? " needs" : "s need"} action now. Clear the red first.`
              : expiring > 0
                ? `No violations — ${expiring} item${expiring === 1 ? "" : "s"} expiring within 30 days.`
                : "Every driver and unit is compliant. Nice work."
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="signal" size="lg">
              <Link to="/audit">
                <ClipboardCheck /> 1-Click DOT Audit
              </Link>
            </Button>
            <Link
              to="/audit"
              className="surface-card surface-interactive flex items-center gap-4 px-5 py-3"
            >
              <span className="text-right">
                <span className="block text-xs font-semibold text-muted-foreground">
                  Fleet Safety Score
                </span>
                <span
                  className={cn(
                    "font-display text-2xl font-extrabold tabular-nums",
                    score >= 90
                      ? "text-success-foreground"
                      : score >= 70
                        ? "text-warning-foreground"
                        : "text-danger-foreground",
                  )}
                >
                  {isLoading ? "—" : `${score}%`}
                </span>
              </span>
              <ArrowRight className="size-4 text-muted-foreground" />
            </Link>
          </div>
        }
      />

      {fleetError && !isLoading && (
        <Alert variant="destructive">
          <AlertOctagon className="size-4" />
          <AlertTitle>Unable to load fleet compliance data</AlertTitle>
          <AlertDescription>
            {fleetError instanceof Error
              ? fleetError.message
              : "Please refresh the page or check your connection."}
          </AlertDescription>
        </Alert>
      )}

      {showOnboardingCard && company && (
        <section className="surface-card flex flex-col justify-between gap-4 border-primary/25 bg-accent/40 p-5 md:flex-row md:items-center">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Building2 className="size-4 text-primary" />
              {!company.dot_number
                ? "Connect your real USDOT number with FMCSA Auto-Fill"
                : "Ready to switch from sample demo records to your real fleet?"}
            </p>
            <p className="text-xs text-muted-foreground">
              {!company.dot_number
                ? "Look up your official FMCSA SAFER carrier record to auto-fill Legal Name, DBA, and Address."
                : "One-click clears the seeded demo drivers and trucks cleanly without counting against your monthly unit quota."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {!company.dot_number && (
              <Button type="button" variant="signal" onClick={openDotModal}>
                <Search /> Register Real USDOT
              </Button>
            )}
            {!company.sample_cleared && (
              <Button
                type="button"
                variant="surface"
                disabled={clearingSample}
                onClick={() => void handleClearSample()}
              >
                {clearingSample ? <Loader2 className="animate-spin" /> : <Trash2 />}
                Clear Sample Data
              </Button>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
        ) : (
          <>
            <KpiCard
              label="Total Active Trucks"
              value={trucks}
              hint={`${data.vehicles.length} units incl. trailers`}
              icon={Truck}
              delay={0}
            />
            <KpiCard
              label="Total Drivers"
              value={data.drivers.length}
              hint="Driver qualification files"
              icon={Users}
              delay={0.05}
            />
            <KpiCard
              label="Expiring in 30 Days"
              value={expiring}
              hint="Renew before they turn red"
              icon={Clock}
              tone="warning"
              delay={0.1}
            />
            <KpiCard
              label="Critical / Expired"
              value={critical}
              hint="Out of compliance today"
              icon={AlertOctagon}
              tone="danger"
              delay={0.15}
            />
          </>
        )}
      </div>

      {company && <PendingReviews key={company.id} companyId={company.id} fleet={data} />}
      <section
        className="surface-card animate-rise overflow-hidden"
        style={{ animationDelay: "0.2s" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-5">
          <div>
            <h2 className="flex items-center gap-3 text-xl font-bold">
              Urgent Action Required
              {urgent.length > 0 && (
                <StatusBadge
                  status={critical > 0 ? "expired" : "expiring"}
                  size="sm"
                  label={`${urgent.length} open`}
                />
              )}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Red and yellow items, closest expiration first.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/alerts">
              View all alerts <ArrowRight />
            </Link>
          </Button>
        </div>
        {isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <UrgentTable docs={urgent.slice(0, 8)} data={data} />
        )}
      </section>

      <Dialog open={dotModalOpen} onOpenChange={setDotModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={handleSaveRealDot} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="font-display text-xl">
                Register Real USDOT Carrier
              </DialogTitle>
              <DialogDescription>
                Verify your carrier via official US FMCSA SAFER lookup or enter fields manually.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="real-dot">USDOT number</Label>
              <div className="flex gap-2">
                <Input
                  id="real-dot"
                  placeholder="USDOT 1234567"
                  value={dotInput}
                  onChange={(e) => setDotInput(e.target.value)}
                  className="h-11 font-mono"
                />
                <Button
                  type="button"
                  variant="surface"
                  className="h-11 shrink-0"
                  disabled={lookingUp || !dotInput.replace(/\D/g, "")}
                  onClick={() => void handleFmcsaLookup()}
                >
                  {lookingUp ? <Loader2 className="animate-spin" /> : <Search />}
                  Lookup FMCSA
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="real-name">Legal carrier name</Label>
              <Input
                id="real-name"
                required
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="real-dba">DBA name (optional)</Label>
                <Input
                  id="real-dba"
                  value={dbaName}
                  onChange={(e) => setDbaName(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="real-status">Carrier status</Label>
                <Input
                  id="real-status"
                  placeholder="ACTIVE"
                  value={carrierStatus}
                  onChange={(e) => setCarrierStatus(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="real-addr">Physical address</Label>
              <Input
                id="real-addr"
                placeholder="City, State"
                value={physicalAddress}
                onChange={(e) => setPhysicalAddress(e.target.value)}
                className="h-10"
              />
            </div>
            {company && !company.sample_cleared && (
              <label className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
                <Checkbox
                  checked={clearSampleToo}
                  onCheckedChange={(v) => setClearSampleToo(v === true)}
                />
                <span>
                  <span className="font-semibold">Clear sample demo fleet on save</span>
                  <span className="block text-xs text-muted-foreground">
                    Removes sample drivers & trucks so your real carrier starts clean.
                  </span>
                </span>
              </label>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDotModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="signal" disabled={savingDot}>
                {savingDot && <Loader2 className="animate-spin" />} Save Carrier
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

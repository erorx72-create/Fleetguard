import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Check, ChevronsUpDown, Loader2, Lock, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { lookupDotCarrier } from "@/lib/gov-lookup.functions";
import { companyFormSchema } from "@/lib/validation";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSidebar } from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/use-company";
import { useRoleAccess } from "@/hooks/use-role-access";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function CompanySwitcher({ onUpgrade }: { onUpgrade?: (() => void) | undefined }) {
  const { company, setCompanyId } = useCompany();
  const { canUseMultiCompany, visibleCompanies, plan } = useRoleAccess();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [adding, setAdding] = useState(false);

  const atLimit = visibleCompanies.length >= plan.companyLimit;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent/60 p-2 text-left transition-colors hover:bg-sidebar-accent",
              collapsed && "justify-center border-transparent bg-transparent p-0",
            )}
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-signal font-display text-sm font-bold text-primary-foreground">
              {company ? initials(company.name) : <Building2 className="size-4" />}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-sidebar-accent-foreground">
                    {company?.name ?? "Loading…"}
                  </span>
                  <span className="block truncate font-mono text-[11px] text-sidebar-foreground/70">
                    {company?.dot_number ?? "No DOT # on file"}
                  </span>
                </span>
                <ChevronsUpDown className="size-4 text-sidebar-foreground/60" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
            <span>{canUseMultiCompany ? "DOT Companies" : "Locked to 1 DOT Company"}</span>
            <span className="font-mono tabular-nums">
              {visibleCompanies.length}/{plan.companyLimit}
            </span>
          </DropdownMenuLabel>
          {visibleCompanies.map((c) => (
            <DropdownMenuItem key={c.id} onSelect={() => setCompanyId(c.id)} className="gap-3 py-2">
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-accent font-display text-xs font-bold text-primary">
                {initials(c.name)}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
              {c.id === company?.id && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {canUseMultiCompany ? (
            <DropdownMenuItem
              disabled={atLimit}
              onSelect={() => setAdding(true)}
              className="gap-3 py-2 font-semibold text-primary"
            >
              <Plus className="size-4" />{" "}
              {atLimit ? "50 DOT company limit reached" : "Add trucking company"}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => {
                if (onUpgrade) onUpgrade();
                else toast.info("Upgrade to DIAMOND AGENCY PLAN for up to 50 DOT companies.");
              }}
              className="gap-3 py-2 text-xs font-semibold text-muted-foreground"
            >
              <Lock className="size-4 shrink-0 text-primary" />
              <span>Multi-company requires Diamond Agency</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AddCompanyDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

export function AddCompanyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const { setCompanyId } = useCompany();
  const runDotLookup = useServerFn(lookupDotCarrier);
  const [name, setName] = useState("");
  const [dot, setDot] = useState("");
  const [dbaName, setDbaName] = useState("");
  const [physicalAddress, setPhysicalAddress] = useState("");
  const [carrierStatus, setCarrierStatus] = useState("");
  const [sample, setSample] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState("fleet_owner");

  async function lookupFmcsa() {
    const digits = dot.replace(/\D/g, "");
    if (!digits) {
      toast.error("Enter a USDOT number first.");
      return;
    }
    setLookingUp(true);
    try {
      const res = await runDotLookup({ data: { dotNumber: digits } });
      if (res.found) {
        setDot(res.dotNumber);
        setName(res.legalName);
        setDbaName(res.dbaName);
        setPhysicalAddress(res.physicalAddress);
        setCarrierStatus(res.status);
        toast.success(`FMCSA verified: ${res.legalName}`);
      } else {
        toast.info(res.message ?? "FMCSA record not found — enter carrier details manually.");
      }
    } catch {
      toast.info("FMCSA lookup timed out — enter carrier details manually.");
    } finally {
      setLookingUp(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = companyFormSchema.safeParse({
      name,
      dotNumber: dot,
      dbaName,
      physicalAddress,
      carrierStatus,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check carrier fields and try again.");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.rpc("create_company", {
      _name: parsed.data.name,
      _with_sample: sample,
      ...(parsed.data.dotNumber ? { _dot_number: parsed.data.dotNumber } : {}),
    });
    if (error || !data) {
      setBusy(false);
      toast.error(error?.message ?? "Could not create company");
      return;
    }

    if (parsed.data.dbaName || parsed.data.physicalAddress || parsed.data.carrierStatus) {
      await supabase
        .from("companies")
        .update({
          dba_name: parsed.data.dbaName || null,
          physical_address: parsed.data.physicalAddress || null,
          carrier_status: parsed.data.carrierStatus || null,
        })
        .eq("id", data);
    }

    const { error: typeError } = await supabase.rpc("configure_company_type", {
      _company: data,
      _type: type,
    });
    setBusy(false);
    if (typeError) toast.error("Company created, but its type could not be saved");
    await qc.invalidateQueries({ queryKey: ["companies"] });
    setCompanyId(data);
    toast.success(`${parsed.data.name} added`);
    setName("");
    setDot("");
    setDbaName("");
    setPhysicalAddress("");
    setCarrierStatus("");
    setSample(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Add a trucking company</DialogTitle>
            <DialogDescription>
              Look up any USDOT number from US FMCSA SAFER to auto-fill legal carrier info.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="c-dot">USDOT number</Label>
            <div className="flex gap-2">
              <Input
                id="c-dot"
                placeholder="USDOT 1234567"
                value={dot}
                onChange={(e) => setDot(e.target.value)}
                className="h-11 font-mono"
              />
              <Button
                type="button"
                variant="surface"
                className="h-11 shrink-0"
                disabled={lookingUp || !dot.replace(/\D/g, "")}
                onClick={() => void lookupFmcsa()}
              >
                {lookingUp ? <Loader2 className="animate-spin" /> : <Search />}
                Lookup FMCSA
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Legal carrier name</Label>
            <Input
              id="c-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="c-dba">DBA name (optional)</Label>
              <Input
                id="c-dba"
                value={dbaName}
                onChange={(e) => setDbaName(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-status">Carrier status</Label>
              <Input
                id="c-status"
                placeholder="ACTIVE"
                value={carrierStatus}
                onChange={(e) => setCarrierStatus(e.target.value)}
                className="h-10"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-addr">Physical address</Label>
            <Input
              id="c-addr"
              placeholder="City, State"
              value={physicalAddress}
              onChange={(e) => setPhysicalAddress(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Company type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger aria-label="Company type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fleet_owner">Fleet owner</SelectItem>
                <SelectItem value="safety_agency">Safety agency</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm">
            <Checkbox checked={sample} onCheckedChange={(v) => setSample(v === true)} />
            <span>
              <span className="font-semibold">Start with sample drivers & trucks</span>
              <span className="block text-xs text-muted-foreground">
                Great for a quick demo — delete anytime.
              </span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="signal" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Create company
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

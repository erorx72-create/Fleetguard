import { useState } from "react";
import { Building2, Plus } from "lucide-react";
import { useCompany } from "@/hooks/use-company";
import { useRoleAccess } from "@/hooks/use-role-access";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddCompanyDialog } from "@/components/company-switcher";

export function AgencyCompanyMenu() {
  const { company, setCompanyId } = useCompany();
  const { canUseMultiCompany, visibleCompanies, plan } = useRoleAccess();
  const [adding, setAdding] = useState(false);

  // Starter & Platinum Directors are strictly locked to 1 DOT Company.
  if (!canUseMultiCompany) {
    return null;
  }

  const atLimit = visibleCompanies.length >= plan.companyLimit;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border pb-5">
      <Building2 className="size-5 text-primary" />
      <span className="font-semibold">Agency Master Dropdown</span>
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {visibleCompanies.length} / {plan.companyLimit} DOT companies
      </span>
      <Select value={company?.id ?? ""} onValueChange={setCompanyId}>
        <SelectTrigger aria-label="Agency companies" className="w-full sm:w-72">
          <SelectValue placeholder="Select company" />
        </SelectTrigger>
        <SelectContent>
          {visibleCompanies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="surface" disabled={atLimit} onClick={() => setAdding(true)}>
        <Plus /> Add company
      </Button>
      <AddCompanyDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}

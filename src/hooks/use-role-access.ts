import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/hooks/use-company";
import { getPlanConfig, useSubscription, type PlanId } from "@/hooks/use-subscription";
import { supabase } from "@/integrations/supabase/client";
import { inviteMemberSchema } from "@/lib/validation";

export type TeamRole = "owner" | "safety_manager" | "agency_staff";

export interface TeamMember {
  id: string;
  email: string;
  fullName: string;
  role: TeamRole;
  companyId: string | "all";
  addedAt: string;
}

const WHITELABEL_STORAGE_KEY = "fleetguard.whitelabel.v1";

export interface WhiteLabelSettings {
  enabled: boolean;
  agencyName: string;
}

const DEFAULT_WHITELABEL: WhiteLabelSettings = {
  enabled: false,
  agencyName: "",
};

export function useRoleAccess() {
  const qc = useQueryClient();
  const { data: subscription } = useSubscription();
  const { company, companies } = useCompany();
  const planId: PlanId = subscription?.plan ?? "starter";
  const plan = getPlanConfig(planId);

  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerEmail, setOwnerEmail] = useState<string>("owner@fleet.local");
  const [whiteLabel, setWhiteLabel] = useState<WhiteLabelSettings>(DEFAULT_WHITELABEL);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.id) setOwnerId(data.user.id);
      if (data.user?.email) setOwnerEmail(data.user.email);
    });
  }, []);

  useEffect(() => {
    try {
      const wlRaw = window.localStorage.getItem(WHITELABEL_STORAGE_KEY);
      if (wlRaw) {
        const parsedWl = JSON.parse(wlRaw) as WhiteLabelSettings;
        if (parsedWl && typeof parsedWl.enabled === "boolean") {
          setWhiteLabel(parsedWl);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  const { data: dbMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["company-members", ownerId],
    enabled: Boolean(ownerId),
    queryFn: async () => {
      if (!ownerId) return [];
      const { data, error } = await supabase
        .from("company_members")
        .select("id, email, full_name, role, company_id, created_at, status")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: true });
      if (error || !data) return [];
      return data
        .filter((row) => row.status !== "revoked")
        .map((row) => ({
          id: row.id,
          email: row.email,
          fullName: row.full_name,
          role: (row.role === "agency_staff" ? "agency_staff" : "safety_manager") as TeamRole,
          companyId: row.company_id ?? "all",
          addedAt: row.created_at,
        }));
    },
    staleTime: 30_000,
  });

  const updateWhiteLabel = useCallback((next: WhiteLabelSettings) => {
    setWhiteLabel(next);
    try {
      window.localStorage.setItem(WHITELABEL_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  const canInviteTeam = plan.allowTeamInvites;
  const canAddSafetyManager = planId === "platinum" || planId === "diamond";
  const canAddAgencyStaff = planId === "diamond";
  const canUseMultiCompany = plan.allowMultiCompany;
  const canWhiteLabelAudit = planId === "diamond";

  const scopedMembers = useMemo(() => {
    const ownerRow: TeamMember = {
      id: "owner-primary",
      email: ownerEmail,
      fullName: "Account Owner",
      role: "owner",
      companyId: planId === "diamond" ? "all" : (company?.id ?? "all"),
      addedAt: subscription?.trial_started_at ?? new Date().toISOString(),
    };
    if (planId === "starter") return [ownerRow];
    if (planId === "platinum") {
      return [
        ownerRow,
        ...dbMembers.filter(
          (m) => m.role === "safety_manager" && (!company || m.companyId === company.id),
        ),
      ];
    }
    return [ownerRow, ...dbMembers];
  }, [ownerEmail, planId, company, dbMembers, subscription?.trial_started_at]);

  const inviteMember = useCallback(
    async (input: {
      email: string;
      fullName: string;
      role: Exclude<TeamRole, "owner">;
      companyId?: string;
    }) => {
      const parsed = inviteMemberSchema.safeParse({
        fullName: input.fullName,
        email: input.email,
        role: input.role,
      });
      if (!parsed.success) {
        return {
          ok: false as const,
          error: parsed.error.issues[0]?.message ?? "Check staff name and email address.",
        };
      }

      if (!canInviteTeam) {
        return { ok: false as const, error: "Starter Plan supports Single Owner Login only." };
      }
      if (planId === "platinum" && parsed.data.role !== "safety_manager") {
        return {
          ok: false as const,
          error: "Platinum Directors Plan allows Internal Safety Manager logins only.",
        };
      }
      if (!ownerId) {
        return { ok: false as const, error: "Please sign in to manage team logins." };
      }

      const assignedCompanyId =
        planId === "diamond"
          ? input.companyId && input.companyId !== "all"
            ? input.companyId
            : null
          : (company?.id ?? null);

      const { error } = await supabase.from("company_members").insert({
        owner_id: ownerId,
        company_id: assignedCompanyId,
        email: parsed.data.email,
        full_name: parsed.data.fullName,
        role: parsed.data.role,
        status: "active",
      });

      if (error) {
        return { ok: false as const, error: error.message };
      }

      await qc.invalidateQueries({ queryKey: ["company-members", ownerId] });
      return { ok: true as const };
    },
    [canInviteTeam, planId, company?.id, ownerId, qc],
  );

  const removeMember = useCallback(
    async (id: string) => {
      if (id === "owner-primary" || !ownerId) return;
      const { error } = await supabase
        .from("company_members")
        .delete()
        .eq("id", id)
        .eq("owner_id", ownerId);
      if (!error) {
        await qc.invalidateQueries({ queryKey: ["company-members", ownerId] });
      }
    },
    [ownerId, qc],
  );

  const visibleCompanies = useMemo(() => {
    if (canUseMultiCompany) return companies.slice(0, plan.companyLimit);
    return company ? [company] : companies.slice(0, 1);
  }, [canUseMultiCompany, companies, company, plan.companyLimit]);

  return {
    planId,
    plan,
    canInviteTeam,
    canAddSafetyManager,
    canAddAgencyStaff,
    canUseMultiCompany,
    canWhiteLabelAudit,
    members: scopedMembers,
    inviteMember,
    removeMember,
    visibleCompanies,
    whiteLabel: canWhiteLabelAudit ? whiteLabel : DEFAULT_WHITELABEL,
    updateWhiteLabel,
  };
}

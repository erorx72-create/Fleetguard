import { createFileRoute, Navigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle2, Loader2, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { PLANS, type PlanId } from "@/hooks/use-subscription";
import { adminActivateSchema, sanitizeText } from "@/lib/validation";

const SUPER_ADMIN_EMAIL = "erorx72@gmail.com";

export const Route = createFileRoute("/_authenticated/_shell/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user?.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Super Admin Activation — FleetGuard" },
      { name: "description", content: "Manage customer subscription activations." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [activatingKey, setActivatingKey] = useState<string | null>(null);

  const userQuery = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user ?? null;
    },
    staleTime: 60_000,
  });

  const isSuperAdmin = userQuery.data?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;

  const accountsQuery = useQuery({
    queryKey: ["admin-accounts", appliedQuery],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_search_accounts", {
        _query: sanitizeText(appliedQuery, 120),
      });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });

  if (!userQuery.isLoading && !isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  async function activate(userId: string, email: string, plan: PlanId) {
    const parsed = adminActivateSchema.safeParse({ userId, plan, days: 30 });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid activation request");
      return;
    }

    const key = `${userId}:${plan}`;
    setActivatingKey(key);
    const { error } = await supabase.rpc("admin_activate_subscription", {
      _target_user_id: parsed.data.userId,
      _plan: parsed.data.plan,
      _days: parsed.data.days,
    });
    setActivatingKey(null);

    if (error) {
      toast.error(error.message || "Could not activate subscription");
      return;
    }

    const planName = PLANS.find((p) => p.id === plan)?.name ?? plan.toUpperCase();
    toast.success(`${planName} activated for ${email} (30 days).`);
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-accounts"] }),
      qc.invalidateQueries({ queryKey: ["subscription-status"] }),
      qc.invalidateQueries({ queryKey: ["companies"] }),
    ]);
  }

  const rows = accountsQuery.data ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Super Admin"
        title="Subscription Activation"
        description="Search any registered fleet owner by email, company name, or USDOT number and activate their 30-day plan with one click."
        actions={
          <Badge
            variant="outline"
            className="gap-1.5 border-primary/40 bg-accent px-3 py-1.5 text-xs font-semibold text-primary"
          >
            <ShieldAlert className="size-3.5" /> Admin: {SUPER_ADMIN_EMAIL}
          </Badge>
        }
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setAppliedQuery(searchInput);
        }}
        className="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              if (e.target.value === "") setAppliedQuery("");
            }}
            placeholder="Search by user email, company name, or USDOT #…"
            className="h-11 pl-10"
          />
        </div>
        <Button type="submit" variant="signal" size="lg">
          Search accounts
        </Button>
      </form>

      <section className="surface-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-base font-bold">
            Registered Accounts{" "}
            <span className="font-mono text-sm text-muted-foreground">({rows.length})</span>
          </h2>
        </div>

        {accountsQuery.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : accountsQuery.error ? (
          <div className="p-6 text-sm text-danger-foreground">
            {accountsQuery.error instanceof Error
              ? accountsQuery.error.message
              : "Could not load accounts."}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No registered users matched that search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3">User / Registered</th>
                  <th className="px-5 py-3">Company / DOT #</th>
                  <th className="px-5 py-3">Plan & Status</th>
                  <th className="px-5 py-3">Valid Until</th>
                  <th className="px-5 py-3 text-right">1-Click 30-Day Activate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isPaid = r.status === "active" || r.status === "paid";
                  return (
                    <tr key={r.user_id} className="border-b border-border/70 last:border-0">
                      <td className="px-5 py-4">
                        <p className="font-semibold">{r.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.full_name ? `${r.full_name} · ` : ""}
                          Joined {format(new Date(r.user_created_at), "MMM d, yyyy")}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium">{r.company_name ?? "No company yet"}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {r.dot_number ?? "No DOT #"}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs uppercase">
                            {r.plan}
                          </Badge>
                          <Badge
                            variant={isPaid ? "default" : "secondary"}
                            className={
                              isPaid
                                ? "bg-success-soft text-success-foreground hover:bg-success-soft"
                                : "bg-warning-soft text-warning-foreground hover:bg-warning-soft"
                            }
                          >
                            {isPaid && <CheckCircle2 className="mr-1 size-3" />}
                            {r.status}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-muted-foreground tabular-nums">
                        {r.billing_cycle_end
                          ? format(new Date(r.billing_cycle_end), "MMM d, yyyy")
                          : `Trial ends ${format(new Date(r.trial_expires_at), "MMM d, HH:mm")}`}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          {(["starter", "platinum", "diamond"] as const).map((tier) => {
                            const key = `${r.user_id}:${tier}`;
                            const busy = activatingKey === key;
                            const activeTier = isPaid && r.plan === tier;
                            return (
                              <Button
                                key={tier}
                                size="sm"
                                variant={activeTier ? "signal" : "surface"}
                                disabled={activatingKey !== null}
                                onClick={() => activate(r.user_id, r.email, tier)}
                              >
                                {busy && <Loader2 className="animate-spin" />}
                                {tier === "starter"
                                  ? "Starter ($99)"
                                  : tier === "platinum"
                                    ? "Platinum ($299)"
                                    : "Diamond ($1,499)"}
                              </Button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

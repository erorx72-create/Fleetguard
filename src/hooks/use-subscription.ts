import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PlanId = "starter" | "platinum" | "diamond";

export interface SubscriptionStatus {
  plan: PlanId;
  status: string;
  trial_started_at: string;
  trial_expires_at: string;
  trial_hours_remaining: number;
  is_trial_active: boolean;
  is_locked: boolean;
  days_since_creation: number;
  user_created_at?: string;
}

export const FLAT_PRICING_HEADER =
  "All-Inclusive Standard Rate — 100% Flat Pricing. No Per-Driver Fees. Zero Hidden Charges.";

export const TRIAL_DURATION_HOURS = 72;
export const SUPER_ADMIN_EMAIL = "erorx72@gmail.com";

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function isAccountLocked(
  status: string | null | undefined,
  createdAt: string | null | undefined,
  nowMs: number = Date.now(),
  email?: string | null | undefined,
): boolean {
  if (isSuperAdminEmail(email)) return false;
  const normalized = (status ?? "trial").toLowerCase();
  if (normalized === "paid" || normalized === "active") return false;
  if (!createdAt) return false;
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) return false;
  const ageHours = (nowMs - createdMs) / 3_600_000;
  return ageHours > TRIAL_DURATION_HOURS;
}

export function normalizePlanId(plan: string | null | undefined): PlanId {
  if (plan === "platinum" || plan === "diamond") return plan;
  return "starter";
}

const FALLBACK: SubscriptionStatus = {
  plan: "starter",
  status: "trial",
  trial_started_at: new Date().toISOString(),
  trial_expires_at: new Date(Date.now() + 72 * 3600_000).toISOString(),
  trial_hours_remaining: 72,
  is_trial_active: true,
  is_locked: false,
  days_since_creation: 0,
};

export function useSubscription() {
  return useQuery<SubscriptionStatus>({
    queryKey: ["subscription-status"],
    queryFn: async () => {
      const [{ data: userData }, rpcRes] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc("get_subscription_status"),
      ]);

      const userEmail = userData.user?.email;
      const isSuperAdmin = isSuperAdminEmail(userEmail);
      const userCreatedAt = userData.user?.created_at;
      const rpcRow = rpcRes.data && rpcRes.data.length > 0 ? rpcRes.data[0] : undefined;

      if (rpcRes.error && !userCreatedAt) {
        throw rpcRes.error;
      }

      const status = rpcRow?.status ?? "trial";
      const plan = normalizePlanId(rpcRow?.plan);
      const isPaidOrActive = status === "paid" || status === "active";
      const lockedByAge = isAccountLocked(status, userCreatedAt, Date.now(), userEmail);
      const isLocked = isSuperAdmin
        ? false
        : !isPaidOrActive && (Boolean(rpcRow?.is_locked) || lockedByAge);

      let trialHoursRemaining = rpcRow?.trial_hours_remaining ?? 72;
      if (userCreatedAt) {
        const ageHours = Math.max(0, (Date.now() - new Date(userCreatedAt).getTime()) / 3_600_000);
        trialHoursRemaining = isPaidOrActive ? 0 : Math.max(0, TRIAL_DURATION_HOURS - ageHours);
      }

      const trialStartedAt = rpcRow?.trial_started_at ?? userCreatedAt ?? FALLBACK.trial_started_at;
      const trialExpiresAt =
        rpcRow?.trial_expires_at ??
        new Date(new Date(trialStartedAt).getTime() + 72 * 3600_000).toISOString();

      return {
        plan,
        status,
        trial_started_at: trialStartedAt,
        trial_expires_at: trialExpiresAt,
        trial_hours_remaining: trialHoursRemaining,
        is_trial_active: !isSuperAdmin && !isPaidOrActive && !isLocked && trialHoursRemaining > 0,
        is_locked: isLocked,
        days_since_creation: rpcRow?.days_since_creation ?? 0,
        ...(userCreatedAt ? { user_created_at: userCreatedAt } : {}),
      };
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export interface Plan {
  id: PlanId;
  name: string;
  audience: string;
  price: number;
  priceLabel: string;
  icon: "starter" | "platinum" | "diamond";
  truckLimit: number;
  companyLimit: number;
  allowTeamInvites: boolean;
  allowMultiCompany: boolean;
  features: string[];
  badge: string;
}

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "STARTER PLAN",
    audience: "Small Fleet Owners (1-10 trucks)",
    price: 99,
    priceLabel: "$99/month flat",
    icon: "starter",
    truckLimit: 10,
    companyLimit: 1,
    allowTeamInvites: false,
    allowMultiCompany: false,
    features: [
      "Small Fleet Owners (1-10 trucks)",
      "1 DOT Company",
      "Single Owner Login only (team invite UI disabled)",
      "Unlimited Drivers",
      "Driver Magic Links",
      "1-Click DOT Audit",
    ],
    badge: FLAT_PRICING_HEADER,
  },
  {
    id: "platinum",
    name: "PLATINUM DIRECTORS PLAN",
    audience: "Medium Fleets (11-30 trucks)",
    price: 299,
    priceLabel: "$299/month flat",
    icon: "platinum",
    truckLimit: 30,
    companyLimit: 1,
    allowTeamInvites: true,
    allowMultiCompany: false,
    features: [
      "Medium Fleets (11-30 trucks)",
      "1 DOT Company",
      "Separate Owner + Internal Safety Manager Logins (strictly locked to the same 1 DOT company)",
      "Unlimited Drivers",
      "Priority Alerts",
      "Fleet Safety Score",
    ],
    badge: FLAT_PRICING_HEADER,
  },
  {
    id: "diamond",
    name: "DIAMOND AGENCY PLAN",
    audience: "3rd-Party Compliance & Safety Agencies",
    price: 1499,
    priceLabel: "$1,499/month flat",
    icon: "diamond",
    truckLimit: 999999,
    companyLimit: 50,
    allowTeamInvites: true,
    allowMultiCompany: true,
    features: [
      "3rd-Party Compliance & Safety Agencies",
      "Unlimited Trucks",
      "Multi-Company Master Dropdown (up to 50 distinct DOT Companies)",
      "Multiple Agency Staff Logins",
      "White-label Audit Reports",
    ],
    badge: FLAT_PRICING_HEADER,
  },
];

export function getPlanConfig(planId: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === planId) ?? PLANS[0]!;
}

const MAILTO_SUBJECTS: Record<PlanId, string> = {
  starter: "Starter Plan Subscription Request",
  platinum: "Platinum Directors Plan Subscription Request",
  diamond: "Diamond Agency Plan Subscription Request",
};

const MAILTO_BODIES: Record<PlanId, string> = {
  starter:
    "Hello FleetGuard Team, I would like to buy a 1-month subscription for the STARTER PLAN ($99/month, all-inclusive, no hidden fees) for my fleet. Please send me the payment details to activate my account. My registered email is: [Logged-In User Email]",
  platinum:
    "Hello FleetGuard Team, I am a professional safety director and I would like to buy a 1-month subscription for the PLATINUM DIRECTORS PLAN ($299/month, all-inclusive, no hidden fees) to manage my fleets. Please send me the payment details. My registered email is: [Logged-In User Email]",
  diamond:
    "Hello FleetGuard Team, We are an independent compliance agency and we would like to buy a 1-month subscription for the DIAMOND AGENCY PLAN ($1,499/month, all-inclusive, no hidden fees) to manage all our carrier clients. Please send us the payment details. My registered email is: [Logged-In User Email]",
};

export function buildMailto(planId: PlanId, userEmail: string): string {
  const subject = MAILTO_SUBJECTS[planId];
  const resolvedEmail = userEmail.trim() || "[Logged-In User Email]";
  const body = MAILTO_BODIES[planId].replace("[Logged-In User Email]", resolvedEmail);
  return `mailto:erorx72@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export { FALLBACK as SUBSCRIPTION_FALLBACK };

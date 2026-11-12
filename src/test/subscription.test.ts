import { describe, expect, it } from "vitest";
import { FLAT_PRICING_HEADER, PLANS, buildMailto, isAccountLocked } from "@/hooks/use-subscription";

describe("pricing plans and flat-rate header", () => {
  it("uses the exact all-inclusive flat pricing header", () => {
    expect(FLAT_PRICING_HEADER).toBe(
      "All-Inclusive Standard Rate — 100% Flat Pricing. No Per-Driver Fees. Zero Hidden Charges.",
    );
  });

  it("configures exact titles, prices, and role-based limits for all 3 plans", () => {
    expect(PLANS.map((p) => ({ id: p.id, name: p.name, price: p.price }))).toEqual([
      { id: "starter", name: "STARTER PLAN", price: 99 },
      { id: "platinum", name: "PLATINUM DIRECTORS PLAN", price: 299 },
      { id: "diamond", name: "DIAMOND AGENCY PLAN", price: 1499 },
    ]);

    const [starter, platinum, diamond] = PLANS;
    expect(starter?.allowTeamInvites).toBe(false);
    expect(starter?.allowMultiCompany).toBe(false);
    expect(starter?.companyLimit).toBe(1);
    expect(starter?.truckLimit).toBe(10);

    expect(platinum?.allowTeamInvites).toBe(true);
    expect(platinum?.allowMultiCompany).toBe(false);
    expect(platinum?.companyLimit).toBe(1);
    expect(platinum?.truckLimit).toBe(30);

    expect(diamond?.allowTeamInvites).toBe(true);
    expect(diamond?.allowMultiCompany).toBe(true);
    expect(diamond?.companyLimit).toBe(50);
    expect(diamond?.truckLimit).toBeGreaterThan(1000);
  });
});

describe("3-day trial paywall lock", () => {
  const now = new Date("2026-11-12T12:00:00Z").getTime();

  it("unlocks accounts within 72 hours of created_at", () => {
    const createdAt = new Date(now - 48 * 3600_000).toISOString();
    expect(isAccountLocked("trial", createdAt, now)).toBe(false);
  });

  it("locks accounts older than 72 hours when status is not paid or active", () => {
    const createdAt = new Date(now - 72.5 * 3600_000).toISOString();
    expect(isAccountLocked("trial", createdAt, now)).toBe(true);
    expect(isAccountLocked("expired", createdAt, now)).toBe(true);
  });

  it("never locks paid or active accounts regardless of age", () => {
    const createdAt = new Date(now - 240 * 3600_000).toISOString();
    expect(isAccountLocked("paid", createdAt, now)).toBe(false);
    expect(isAccountLocked("active", createdAt, now)).toBe(false);
  });

  it("never locks the Super Admin account (erorx72@gmail.com) regardless of age", () => {
    const createdAt = new Date(now - 240 * 3600_000).toISOString();
    expect(isAccountLocked("trial", createdAt, now, "erorx72@gmail.com")).toBe(false);
    expect(isAccountLocked("trial", createdAt, now, "ERORX72@gmail.com")).toBe(false);
    expect(isAccountLocked("trial", createdAt, now, "owner@fleet.com")).toBe(true);
  });
});

describe("mailto subscription links", () => {
  const email = "dispatch@lonestarfreight.com";

  it("builds Starter mailto with exact subject and body", () => {
    const href = buildMailto("starter", email);
    expect(href.startsWith("mailto:erorx72@gmail.com?")).toBe(true);
    const decoded = decodeURIComponent(href);
    expect(decoded).toContain("subject=Starter Plan Subscription Request");
    expect(decoded).toContain(
      `Hello FleetGuard Team, I would like to buy a 1-month subscription for the STARTER PLAN ($99/month, all-inclusive, no hidden fees) for my fleet. Please send me the payment details to activate my account. My registered email is: ${email}`,
    );
  });

  it("builds Platinum Directors mailto with exact subject and body", () => {
    const href = buildMailto("platinum", email);
    const decoded = decodeURIComponent(href);
    expect(decoded).toContain("subject=Platinum Directors Plan Subscription Request");
    expect(decoded).toContain(
      `Hello FleetGuard Team, I am a professional safety director and I would like to buy a 1-month subscription for the PLATINUM DIRECTORS PLAN ($299/month, all-inclusive, no hidden fees) to manage my fleets. Please send me the payment details. My registered email is: ${email}`,
    );
  });

  it("builds Diamond Agency mailto with exact subject and body", () => {
    const href = buildMailto("diamond", email);
    const decoded = decodeURIComponent(href);
    expect(decoded).toContain("subject=Diamond Agency Plan Subscription Request");
    expect(decoded).toContain(
      `Hello FleetGuard Team, We are an independent compliance agency and we would like to buy a 1-month subscription for the DIAMOND AGENCY PLAN ($1,499/month, all-inclusive, no hidden fees) to manage all our carrier clients. Please send us the payment details. My registered email is: ${email}`,
    );
  });
});

describe("database security & lock enforcement (mock parity)", () => {
  it("blocks users from tampering with subscriptions or deleting quota history", async () => {
    const { createMockSupabaseClient } = await import("@/integrations/supabase/mock");
    const db = createMockSupabaseClient();

    const subUpdate = await db
      .from("subscriptions")
      .update({ plan: "diamond", status: "paid" })
      .eq("user_id", "00000000-0000-4000-8000-000000000001");
    expect(subUpdate.error).not.toBeNull();

    const quotaDelete = await db
      .from("truck_quota_counters")
      .delete()
      .eq("owner_id", "00000000-0000-4000-8000-000000000001");
    expect(quotaDelete.error).not.toBeNull();
  });

  it("blocks VIN updates, DOT swaps on Starter, and Starter team invites, and locks quota across deletes", async () => {
    const { createMockSupabaseClient } = await import("@/integrations/supabase/mock");
    const db = createMockSupabaseClient();
    const companyId = "10000000-0000-4000-8000-000000000001";

    // VIN immutability
    const vinUpdate = await db
      .from("vehicles")
      .update({ vin: "11111111111111111" })
      .eq("id", "40000000-0000-4000-8000-000000000001");
    expect(vinUpdate.error?.message).toContain("immutable");

    // Starter DOT lock (update & delete blocked once DOT exists)
    const dotUpdate = await db
      .from("companies")
      .update({ dot_number: "USDOT 9999999" })
      .eq("id", companyId);
    expect(dotUpdate.error?.message).toContain("locked");

    const compDelete = await db.from("companies").delete().eq("id", companyId);
    expect(compDelete.error?.message).toContain("locked");

    // Starter RBAC rejects inviting staff
    const inviteRes = await db.from("company_members").insert({
      owner_id: "00000000-0000-4000-8000-000000000001",
      company_id: companyId,
      email: "manager@fleet.com",
      full_name: "Safety Manager",
      role: "safety_manager",
    });
    expect(inviteRes.error?.message).toContain("Single Owner Login");

    // Anti-data flipping: 2 initial trucks + 8 more = 10; delete 1, 11th insert must STILL fail
    for (let i = 3; i <= 10; i++) {
      const res = await db
        .from("vehicles")
        .insert({ company_id: companyId, unit_number: `30${i}`, kind: "truck" })
        .select("id")
        .single();
      expect(res.error).toBeNull();
    }
    const delRes = await db
      .from("vehicles")
      .delete()
      .eq("id", "40000000-0000-4000-8000-000000000001");
    expect(delRes.error).toBeNull();

    const eleventh = await db
      .from("vehicles")
      .insert({ company_id: companyId, unit_number: "999", kind: "truck" })
      .select("id")
      .single();
    expect(eleventh.error?.message).toContain("quota");

    // Super Admin (erorx72@gmail.com) is never locked out by trial paywall
    await db.auth.signInWithPassword({ email: "erorx72@gmail.com", password: "demo-password" });
    const adminSub = await db.rpc("get_subscription_status");
    expect(adminSub.error).toBeNull();
    expect(adminSub.data?.[0]?.is_locked).toBe(false);
  });
});

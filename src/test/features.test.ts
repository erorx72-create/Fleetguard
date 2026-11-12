import { describe, expect, it } from "vitest";
import {
  adminActivateSchema,
  companyFormSchema,
  dotLookupSchema,
  driverFormSchema,
  inviteMemberSchema,
  normalizeDotNumber,
  sanitizeText,
  vehicleFormSchema,
  vinDecodeSchema,
} from "@/lib/validation";

describe("XSS sanitization & Zod validation schemas", () => {
  it("strips script tags, angle brackets, control chars, and javascript: URIs", () => {
    const dirty = "  <script>alert(1)</script>javascript:void(0)\u0000 Lone Star Carrier  ";
    const clean = sanitizeText(dirty);
    expect(clean).not.toContain("<");
    expect(clean).not.toContain(">");
    expect(clean.toLowerCase()).not.toContain("javascript:");
    expect(clean).toContain("Lone Star Carrier");
  });

  it("validates 17-character NHTSA VINs and rejects invalid I/O/Q characters", () => {
    expect(vinDecodeSchema.safeParse({ vin: "1fujgldr5clbp8834" }).success).toBe(true);
    expect(vinDecodeSchema.safeParse({ vin: "1FUJGLDR5CLBP883O" }).success).toBe(false);
    expect(vinDecodeSchema.safeParse({ vin: "SHORTVIN" }).success).toBe(false);
  });

  it("normalizes DOT numbers cleanly and parses company/vehicle/driver schemas", () => {
    expect(normalizeDotNumber("USDOT 3482915")).toBe("3482915");
    expect(dotLookupSchema.safeParse({ dotNumber: "USDOT-3482915" }).data?.dotNumber).toBe(
      "3482915",
    );

    const vRes = vehicleFormSchema.safeParse({
      kind: "truck",
      unit_number: "#402",
      vin: "3akjhhdr7lsla4421",
      plate: "tx 99ab",
      year: "2024",
      make: "FREIGHTLINER",
      model: "CASCADIA",
    });
    expect(vRes.success).toBe(true);
    expect(vRes.data?.unit_number).toBe("402");
    expect(vRes.data?.vin).toBe("3AKJHHDR7LSLA4421");
    expect(vRes.data?.year).toBe(2024);

    expect(
      companyFormSchema.safeParse({ name: "<b>Apex</b> Freight", dotNumber: "USDOT 12345" }).data
        ?.name,
    ).toBe("bApex/b Freight");
    expect(driverFormSchema.safeParse({ full_name: "A" }).success).toBe(false);
    expect(
      inviteMemberSchema.safeParse({
        fullName: "Jane Safety",
        email: "Jane@Fleet.com",
        role: "safety_manager",
      }).data?.email,
    ).toBe("jane@fleet.com");
    expect(
      adminActivateSchema.safeParse({
        userId: "00000000-0000-4000-8000-000000000001",
        plan: "platinum",
        days: 30,
      }).success,
    ).toBe(true);
  });
});

describe("Super Admin activation, clear_sample_data, and 2-device concurrent session limit", () => {
  it("restricts admin RPCs strictly to erorx72@gmail.com and activates plans for 30 days", async () => {
    const { createMockSupabaseClient } = await import("@/integrations/supabase/mock");
    const db = createMockSupabaseClient();

    await db.auth.signInWithPassword({ email: "carrier@example.com", password: "Password123!" });
    const deniedSearch = await db.rpc("admin_search_accounts", { _query: "" });
    expect(deniedSearch.error?.message).toContain("Unauthorized");

    const deniedActivate = await db.rpc("admin_activate_subscription", {
      _target_user_id: "00000000-0000-4000-8000-000000000001",
      _plan: "diamond",
      _days: 30,
    });
    expect(deniedActivate.error?.message).toContain("Unauthorized");

    await db.auth.signInWithPassword({ email: "erorx72@gmail.com", password: "Password123!" });
    const searchRes = await db.rpc("admin_search_accounts", { _query: "" });
    expect(searchRes.error).toBeNull();
    expect(searchRes.data?.length).toBeGreaterThan(0);

    const activateRes = await db.rpc("admin_activate_subscription", {
      _target_user_id: searchRes.data![0]!.user_id,
      _plan: "diamond",
      _days: 30,
    });
    expect(activateRes.error).toBeNull();

    const subStatus = await db.rpc("get_subscription_status");
    expect(subStatus.data?.[0]?.plan).toBe("diamond");
    expect(subStatus.data?.[0]?.status).toBe("active");
    expect(subStatus.data?.[0]?.is_locked).toBe(false);
  });

  it("clears seeded sample fleet data cleanly on clear_sample_data", async () => {
    const { createMockSupabaseClient } = await import("@/integrations/supabase/mock");
    const db = createMockSupabaseClient();
    await db.auth.signInWithPassword({ email: "erorx72@gmail.com", password: "Password123!" });
    const companyId = "10000000-0000-4000-8000-000000000001";

    const clearRes = await db.rpc("clear_sample_data", { _company: companyId });
    expect(clearRes.error).toBeNull();

    const driversAfter = await db.from("drivers").select("*").eq("company_id", companyId);
    const trucksAfter = await db.from("vehicles").select("*").eq("company_id", companyId);
    expect(driversAfter.data?.length).toBe(0);
    expect(trucksAfter.data?.length).toBe(0);
  });

  it("evicts the oldest device session when more than 2 distinct devices sign in concurrently", async () => {
    const { createMockSupabaseClient } = await import("@/integrations/supabase/mock");
    const db = createMockSupabaseClient();
    await db.auth.signInWithPassword({ email: "owner@fleet.com", password: "Password123!" });

    const s1 = await db.rpc("upsert_user_session", {
      _device_fingerprint: "device-alpha",
      _ip_address: "10.0.0.1",
    });
    const s2 = await db.rpc("upsert_user_session", {
      _device_fingerprint: "device-beta",
      _ip_address: "10.0.0.2",
    });
    const id1 = s1.data![0]!.session_id;
    const id2 = s2.data![0]!.session_id;

    expect((await db.rpc("check_session_valid", { _session_id: id1 })).data).toBe(true);
    expect((await db.rpc("check_session_valid", { _session_id: id2 })).data).toBe(true);

    // 3rd distinct device triggers eviction of oldest (device-alpha)
    const s3 = await db.rpc("upsert_user_session", {
      _device_fingerprint: "device-gamma",
      _ip_address: "10.0.0.3",
    });
    const id3 = s3.data![0]!.session_id;
    expect(s3.data![0]!.max_sessions_exceeded).toBe(true);

    expect((await db.rpc("check_session_valid", { _session_id: id1 })).data).toBe(false);
    expect((await db.rpc("check_session_valid", { _session_id: id2 })).data).toBe(true);
    expect((await db.rpc("check_session_valid", { _session_id: id3 })).data).toBe(true);
  });
});

describe("Send Reminder links & Driver Magic Link end-to-end compliance flow", () => {
  it("builds valid mailto:, sms:, and Magic Upload URLs with expiration details", async () => {
    const { buildMagicUploadUrl, buildReminderEmailHref, buildReminderSmsHref } =
      await import("@/components/doc-actions");
    const { resolveFileMimeType } = await import("@/lib/submission-validation");

    const magicUrl = buildMagicUploadUrl(
      "https://fleetguard.app",
      "30000000-0000-4000-8000-000000000003",
      "cdl",
    );
    expect(magicUrl).toBe("https://fleetguard.app/u/30000000-0000-4000-8000-000000000003?type=cdl");

    const emailHref = buildReminderEmailHref({
      toEmail: "david.rodriguez@example.com",
      driverName: "David Rodriguez",
      companyName: "Lone Star Freight Co.",
      docLabel: "CDL License",
      expirationDetails: "Expired 5 days ago",
      magicUrl,
    });
    expect(emailHref.startsWith("mailto:david.rodriguez%40example.com?")).toBe(true);
    const decodedEmail = decodeURIComponent(emailHref);
    expect(decodedEmail).toContain("CDL License");
    expect(decodedEmail).toContain("Expired 5 days ago");
    expect(decodedEmail).toContain(magicUrl);

    const smsHref = buildReminderSmsHref({
      toPhone: "(305) 555-0199",
      driverName: "David Rodriguez",
      docLabel: "CDL License",
      expirationDetails: "Expired 5 days ago",
      magicUrl,
    });
    expect(smsHref.startsWith("sms:3055550199?&body=")).toBe(true);
    expect(decodeURIComponent(smsHref)).toContain(magicUrl);

    expect(resolveFileMimeType({ name: "cdl-front.jpg", type: "" })).toBe("image/jpeg");
    expect(resolveFileMimeType({ name: "medcard.heic", type: "" })).toBe("image/heic");
    expect(resolveFileMimeType({ name: "inspection.pdf", type: "" })).toBe("application/pdf");
    expect(resolveFileMimeType({ name: "script.exe", type: "" })).toBeNull();
  });

  it("completes driver magic-link upload to storage/db and updates driver document to compliant on approval", async () => {
    const { createMockSupabaseClient } = await import("@/integrations/supabase/mock");
    const { statusFromDays, daysUntil } = await import("@/lib/compliance");
    const db = createMockSupabaseClient();

    // Unauthenticated driver looks up their magic link token (David Rodriguez, expired CDL)
    const token = "30000000-0000-4000-8000-000000000003";
    const { data: driver } = await db
      .from("drivers")
      .select("id,company_id,full_name")
      .eq("magic_token", token)
      .maybeSingle();
    expect(driver).not.toBeNull();

    const submissionId = crypto.randomUUID();
    const filePath = `${driver!.company_id}/${driver!.id}/${submissionId}/cdl-photo.jpg`;
    const photoFile = new File(["fake-jpeg-bytes"], "cdl-photo.jpg", { type: "image/jpeg" });

    // Reserve, upload to storage, mark pending
    const resInsert = await db.from("document_submissions").insert({
      id: submissionId,
      company_id: driver!.company_id,
      driver_id: driver!.id,
      doc_type: "cdl",
      file_path: filePath,
      file_name: "cdl-photo.jpg",
      review_status: "rejected",
    });
    expect(resInsert.error).toBeNull();

    const upRes = await db.storage
      .from("document-uploads")
      .upload(filePath, photoFile, { contentType: "image/jpeg" });
    expect(upRes.error).toBeNull();

    const finishRes = await db
      .from("document_submissions")
      .update({ review_status: "pending", state_of_issuance: "TX" })
      .eq("id", submissionId);
    expect(finishRes.error).toBeNull();

    // Manager approves uploaded photo with future expiration date -> document turns compliant immediately
    const futureExpiry = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    const approveRes = await db.rpc("approve_document_submission", {
      _submission: submissionId,
      _expires_on: futureExpiry,
      _state: "TX",
    });
    expect(approveRes.error).toBeNull();

    const { data: docs } = await db
      .from("documents")
      .select("*")
      .eq("driver_id", driver!.id)
      .eq("doc_type", "cdl");
    const cdlDoc = docs?.[0];
    expect(cdlDoc?.file_path).toBe(filePath);
    expect(cdlDoc?.expires_on).toBe(futureExpiry);
    expect(statusFromDays(daysUntil(cdlDoc?.expires_on ?? null))).toBe("compliant");
  });
});

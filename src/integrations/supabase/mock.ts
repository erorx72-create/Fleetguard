import type { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

type Row = Record<string, unknown>;
type TableName = keyof Database["public"]["Tables"];

interface MockUser {
  id: string;
  email: string;
  created_at: string;
  user_metadata: {
    full_name?: string;
    company_name?: string;
  };
}

interface MockSession {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  user: MockUser;
}

interface StoredFile {
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
}

interface MockDbState {
  session: MockSession | null;
  tables: Record<TableName, Row[]>;
  files: Record<string, StoredFile>;
}

const STORAGE_KEY = "fleetguard.mockdb.v1";

const DEFAULT_USER_ID = "00000000-0000-4000-8000-000000000001";
const DEFAULT_COMPANY_ID = "10000000-0000-4000-8000-000000000001";

const SAMPLE_DRIVER_IDS = [
  "20000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "20000000-0000-4000-8000-000000000003",
] as const;

const SAMPLE_DRIVER_TOKENS = [
  "30000000-0000-4000-8000-000000000001",
  "30000000-0000-4000-8000-000000000002",
  "30000000-0000-4000-8000-000000000003",
] as const;

const SAMPLE_VEHICLE_IDS = [
  "40000000-0000-4000-8000-000000000001",
  "40000000-0000-4000-8000-000000000002",
] as const;

function dateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function createSampleFleetRows(
  companyId: string,
  useDeterministicIds: boolean,
): {
  drivers: Row[];
  vehicles: Row[];
  documents: Row[];
} {
  const ts = nowIso();
  const dIds = useDeterministicIds ? [...SAMPLE_DRIVER_IDS] : [makeUuid(), makeUuid(), makeUuid()];
  const dTokens = useDeterministicIds
    ? [...SAMPLE_DRIVER_TOKENS]
    : [makeUuid(), makeUuid(), makeUuid()];
  const vIds = useDeterministicIds ? [...SAMPLE_VEHICLE_IDS] : [makeUuid(), makeUuid()];

  const drivers: Row[] = [
    {
      id: dIds[0]!,
      company_id: companyId,
      full_name: "Marcus Johnson",
      phone: "(214) 555-0182",
      email: "marcus.johnson@example.com",
      hire_date: "2021-03-15",
      magic_token: dTokens[0]!,
      status: "Active",
      created_at: ts,
    },
    {
      id: dIds[1]!,
      company_id: companyId,
      full_name: "Sarah Mitchell",
      phone: "(602) 555-0147",
      email: "sarah.mitchell@example.com",
      hire_date: "2022-08-01",
      magic_token: dTokens[1]!,
      status: "Active",
      created_at: ts,
    },
    {
      id: dIds[2]!,
      company_id: companyId,
      full_name: "David Rodriguez",
      phone: "(305) 555-0199",
      email: "david.rodriguez@example.com",
      hire_date: "2023-01-10",
      magic_token: dTokens[2]!,
      status: "Active",
      created_at: ts,
    },
  ];

  const vehicles: Row[] = [
    {
      id: vIds[0]!,
      company_id: companyId,
      kind: "truck",
      unit_number: "101",
      vin: "1FUJGLDR5CLBP8834",
      plate: "TX 8KL-2291",
      year: 2022,
      make: "FREIGHTLINER",
      model: "CASCADIA",
      status: "Active",
      created_at: ts,
    },
    {
      id: vIds[1]!,
      company_id: companyId,
      kind: "truck",
      unit_number: "204",
      vin: "3AKJHHDR7LSLA4421",
      plate: "AZ 9PD-1180",
      year: 2023,
      make: "FREIGHTLINER",
      model: "CASCADIA",
      status: "Active",
      created_at: ts,
    },
  ];

  const driverExpiries: Array<Record<string, number>> = [
    { cdl: 540, medical_card: 300, mvr: 210, drug_test: 180 },
    { cdl: 820, medical_card: 12, mvr: 160, drug_test: 95 },
    { cdl: -5, medical_card: 240, mvr: 24, drug_test: 130 },
  ];

  const vehicleExpiries: Array<Record<string, number>> = [
    { annual_inspection: 250, registration: 190, insurance: 320 },
    { annual_inspection: 21, registration: 140, insurance: 75 },
  ];

  const documents: Row[] = [];
  dIds.forEach((driverId, idx) => {
    const map = driverExpiries[idx] ?? {};
    for (const docType of ["cdl", "medical_card", "mvr", "drug_test"]) {
      documents.push({
        id: makeUuid(),
        company_id: companyId,
        driver_id: driverId,
        vehicle_id: null,
        doc_type: docType,
        expires_on: dateOffset(map[docType] ?? 180),
        file_path: null,
        file_name: null,
        state_of_issuance: null,
        uploaded_at: null,
        updated_at: ts,
      });
    }
  });

  vIds.forEach((vehicleId, idx) => {
    const map = vehicleExpiries[idx] ?? {};
    for (const docType of ["annual_inspection", "registration", "insurance"]) {
      documents.push({
        id: makeUuid(),
        company_id: companyId,
        driver_id: null,
        vehicle_id: vehicleId,
        doc_type: docType,
        expires_on: dateOffset(map[docType] ?? 180),
        file_path: null,
        file_name: null,
        state_of_issuance: null,
        uploaded_at: null,
        updated_at: ts,
      });
    }
  });

  return { drivers, vehicles, documents };
}

function createInitialState(): MockDbState {
  const ts = nowIso();
  const trialExpires = new Date(Date.now() + 72 * 3600_000).toISOString();
  const billingEnd = new Date(Date.now() + 30 * 86400_000).toISOString();
  const sample = createSampleFleetRows(DEFAULT_COMPANY_ID, true);

  return {
    session: null,
    files: {},
    tables: {
      profiles: [
        {
          id: DEFAULT_USER_ID,
          full_name: "Fleet Manager",
          email: "demo@fleetguard.local",
          created_at: ts,
        },
      ],
      companies: [
        {
          id: DEFAULT_COMPANY_ID,
          owner_id: DEFAULT_USER_ID,
          name: "Lone Star Freight Co.",
          dot_number: "USDOT 3482915",
          dba_name: null,
          physical_address: "Dallas, TX",
          carrier_status: "ACTIVE",
          sample_cleared: false,
          type: "fleet_owner",
          tier: "starter",
          trial_started_at: ts,
          created_at: ts,
        },
      ],
      drivers: sample.drivers,
      vehicles: sample.vehicles,
      documents: sample.documents,
      document_submissions: [],
      reminders: [],
      subscriptions: [
        {
          id: makeUuid(),
          user_id: DEFAULT_USER_ID,
          plan: "starter",
          status: "trial",
          trial_started_at: ts,
          trial_expires_at: trialExpires,
          paid_at: null,
          billing_cycle_start: ts,
          billing_cycle_end: billingEnd,
          created_at: ts,
          updated_at: ts,
        },
      ],
      truck_creation_log: [],
      truck_quota_counters: [
        {
          id: makeUuid(),
          owner_id: DEFAULT_USER_ID,
          billing_cycle_start: ts,
          trucks_created: sample.vehicles.length,
          created_at: ts,
          updated_at: ts,
        },
      ],
      company_members: [],
      api_rate_limits: [],
      user_sessions: [],
    },
  };
}

let serverMemoryState: MockDbState | null = null;

function loadState(): MockDbState {
  if (typeof window === "undefined") {
    if (!serverMemoryState) serverMemoryState = createInitialState();
    return serverMemoryState;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MockDbState;
      if (parsed && parsed.tables && parsed.tables.companies) {
        return parsed;
      }
    }
  } catch {
    // ignore storage errors
  }
  const initial = createInitialState();
  saveState(initial);
  return initial;
}

function saveState(state: MockDbState): void {
  if (typeof window === "undefined") {
    serverMemoryState = state;
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

type AuthListener = (event: string, session: MockSession | null) => void;
const authListeners = new Set<AuthListener>();

function emitAuth(event: string, session: MockSession | null): void {
  for (const listener of authListeners) {
    try {
      listener(event, session);
    } catch {
      // ignore listener errors
    }
  }
}

function buildQuery(table: TableName) {
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row | Row[] | null = null;
  const filters: Array<{ col: string; val: unknown }> = [];
  let orderBy: { col: string; ascending: boolean } | null = null;
  let singleMode: "none" | "single" | "maybeSingle" = "none";

  const execute = async (): Promise<{ data: unknown; error: Error | null }> => {
    const state = loadState();
    const rows = state.tables[table] ?? [];
    const matches = (row: Row) => filters.every((f) => row[f.col] === f.val);

    if (op === "select") {
      let result = rows.filter(matches).map((r) => ({ ...r }));
      if (orderBy) {
        const { col, ascending } = orderBy;
        result = result.sort((a, b) => {
          const av = String(a[col] ?? "");
          const bv = String(b[col] ?? "");
          return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      if (singleMode === "single") {
        if (result.length === 0) {
          return { data: null, error: new Error(`No row found in ${table}`) };
        }
        return { data: result[0]!, error: null };
      }
      if (singleMode === "maybeSingle") {
        return { data: result[0] ?? null, error: null };
      }
      return { data: result, error: null };
    }

    if (op === "insert") {
      const items = Array.isArray(payload) ? payload : payload ? [payload] : [];

      if (
        table === "subscriptions" ||
        table === "truck_quota_counters" ||
        table === "truck_creation_log"
      ) {
        return {
          data: null,
          error: new Error("Only administrators can modify billing or quota history."),
        };
      }

      if (table === "companies") {
        const sub = state.tables.subscriptions[0];
        const plan = String(sub?.["plan"] ?? "starter");
        const maxCompanies = plan === "diamond" ? 50 : 1;
        if (state.tables.companies.length + items.length > maxCompanies) {
          return {
            data: null,
            error: new Error(
              maxCompanies === 1
                ? "Your plan allows 1 DOT company. Upgrade to the Diamond Agency Plan for up to 50 companies."
                : `Company limit reached for your plan (max ${maxCompanies} companies).`,
            ),
          };
        }
        for (const item of items) {
          const dot = String((item as Row)["dot_number"] ?? "")
            .replace(/[^a-zA-Z0-9]/g, "")
            .toUpperCase()
            .replace(/^(US)?DOT/, "");
          if (dot) {
            const exists = state.tables.companies.some(
              (c) =>
                String(c["dot_number"] ?? "")
                  .replace(/[^a-zA-Z0-9]/g, "")
                  .toUpperCase()
                  .replace(/^(US)?DOT/, "") === dot,
            );
            if (exists) {
              return {
                data: null,
                error: new Error("This DOT number is already registered under another account."),
              };
            }
          }
        }
      }

      if (table === "company_members") {
        const sub = state.tables.subscriptions[0];
        const plan = String(sub?.["plan"] ?? "starter");
        if (plan === "starter") {
          return {
            data: null,
            error: new Error(
              "Starter Plan supports Single Owner Login only. Inviting sub-users or staff accounts is not permitted.",
            ),
          };
        }
        for (const item of items) {
          const role = String((item as Row)["role"] ?? "");
          const companyId = (item as Row)["company_id"] as string | null | undefined;
          if (plan === "platinum") {
            if (role !== "safety_manager") {
              return {
                data: null,
                error: new Error(
                  "Platinum Directors Plan allows Internal Safety Manager logins only.",
                ),
              };
            }
            if (!companyId || !state.tables.companies.some((c) => c["id"] === companyId)) {
              return {
                data: null,
                error: new Error(
                  "Platinum Safety Managers must be strictly bound to your single company_id.",
                ),
              };
            }
          } else if (plan === "diamond" && companyId) {
            if (!state.tables.companies.some((c) => c["id"] === companyId)) {
              return {
                data: null,
                error: new Error("Agency staff can only access companies owned by your agency."),
              };
            }
          }
        }
      }

      if (table === "vehicles") {
        const sub = state.tables.subscriptions[0];
        const plan = String(sub?.["plan"] ?? "starter");
        const maxVehicles = plan === "diamond" ? 999999 : plan === "platinum" ? 30 : 10;
        const cycleStart = String(sub?.["billing_cycle_start"] ?? "");
        const counterRow = (state.tables.truck_quota_counters ?? []).find(
          (q) => q["billing_cycle_start"] === cycleStart,
        );
        const existingCount = state.tables.vehicles.length;
        const quotaUsed = Math.max(existingCount, Number(counterRow?.["trucks_created"] ?? 0));
        if (quotaUsed + items.length > maxVehicles) {
          return {
            data: null,
            error: new Error(
              `Truck limit reached for ${plan.toUpperCase()} plan (max ${maxVehicles} trucks per billing cycle). Deleting trucks does not reset your quota.`,
            ),
          };
        }
      }

      const ts = nowIso();
      const inserted: Row[] = items.map((item) => {
        const row: Row = {
          id: makeUuid(),
          created_at: ts,
          ...item,
        };
        if (table === "drivers") {
          row["magic_token"] = row["magic_token"] ?? makeUuid();
          row["status"] = row["status"] ?? "Active";
        }
        if (table === "vehicles") {
          row["kind"] = row["kind"] ?? "truck";
          row["status"] = row["status"] ?? "Active";
          row["vin"] = row["vin"] ? String(row["vin"]).trim().toUpperCase() || null : null;
        }
        if (table === "document_submissions") {
          row["review_status"] = row["review_status"] ?? "pending";
          row["submitted_at"] = row["submitted_at"] ?? ts;
        }
        return row;
      });

      state.tables[table] = [...rows, ...inserted];

      // Auto-create checklist rows on driver/vehicle insert
      if (table === "drivers") {
        for (const d of inserted) {
          for (const docType of ["cdl", "medical_card", "mvr", "drug_test"]) {
            state.tables.documents.push({
              id: makeUuid(),
              company_id: d["company_id"],
              driver_id: d["id"],
              vehicle_id: null,
              doc_type: docType,
              expires_on: null,
              file_path: null,
              file_name: null,
              state_of_issuance: null,
              uploaded_at: null,
              updated_at: ts,
            });
          }
        }
      } else if (table === "vehicles") {
        const sub = state.tables.subscriptions[0];
        const cycleStart = String(sub?.["billing_cycle_start"] ?? ts);
        state.tables.truck_quota_counters = state.tables.truck_quota_counters ?? [];
        for (const v of inserted) {
          state.tables.truck_creation_log.push({
            id: makeUuid(),
            owner_id: DEFAULT_USER_ID,
            company_id: v["company_id"],
            vehicle_id: v["id"],
            billing_cycle_start: cycleStart,
            created_at: ts,
          });
          const existingQuota = state.tables.truck_quota_counters.find(
            (q) => q["billing_cycle_start"] === cycleStart,
          );
          if (existingQuota) {
            existingQuota["trucks_created"] = Number(existingQuota["trucks_created"] ?? 0) + 1;
            existingQuota["updated_at"] = ts;
          } else {
            state.tables.truck_quota_counters.push({
              id: makeUuid(),
              owner_id: DEFAULT_USER_ID,
              billing_cycle_start: cycleStart,
              trucks_created: 1,
              created_at: ts,
              updated_at: ts,
            });
          }
          for (const docType of ["annual_inspection", "registration", "insurance"]) {
            state.tables.documents.push({
              id: makeUuid(),
              company_id: v["company_id"],
              driver_id: null,
              vehicle_id: v["id"],
              doc_type: docType,
              expires_on: null,
              file_path: null,
              file_name: null,
              state_of_issuance: null,
              uploaded_at: null,
              updated_at: ts,
            });
          }
        }
      }

      saveState(state);
      if (singleMode === "single" || singleMode === "maybeSingle") {
        return { data: inserted[0] ?? null, error: null };
      }
      return { data: inserted, error: null };
    }

    if (op === "update") {
      if (
        table === "subscriptions" ||
        table === "truck_quota_counters" ||
        table === "truck_creation_log"
      ) {
        return {
          data: null,
          error: new Error(
            "Only administrators can modify subscription status, plan tier, or quota history.",
          ),
        };
      }
      const patch = (Array.isArray(payload) ? payload[0] : payload) ?? {};
      const ts = nowIso();
      if (table === "profiles" && "created_at" in patch) {
        return { data: null, error: new Error("profiles.created_at is immutable.") };
      }
      if (table === "companies") {
        const sub = state.tables.subscriptions[0];
        const plan = String(sub?.["plan"] ?? "starter");
        for (const row of rows.filter(matches)) {
          if ("tier" in patch && patch["tier"] !== row["tier"]) {
            return { data: null, error: new Error("companies.tier is controlled by billing.") };
          }
          const onlySampleCleared =
            patch["sample_cleared"] === true &&
            row["sample_cleared"] === false &&
            !("name" in patch) &&
            !("dot_number" in patch) &&
            !("type" in patch);
          if (
            !onlySampleCleared &&
            (plan === "starter" || plan === "platinum") &&
            String(row["dot_number"] ?? "").trim() !== ""
          ) {
            return {
              data: null,
              error: new Error(
                `DOT company record is locked on ${plan.toUpperCase()} plan and cannot be updated or swapped.`,
              ),
            };
          }
          if ("dot_number" in patch && patch["dot_number"]) {
            const norm = String(patch["dot_number"])
              .replace(/[^a-zA-Z0-9]/g, "")
              .toUpperCase()
              .replace(/^(US)?DOT/, "");
            if (norm) {
              const conflict = state.tables.companies.some(
                (other) =>
                  other["id"] !== row["id"] &&
                  String(other["dot_number"] ?? "")
                    .replace(/[^a-zA-Z0-9]/g, "")
                    .toUpperCase()
                    .replace(/^(US)?DOT/, "") === norm,
              );
              if (conflict) {
                return {
                  data: null,
                  error: new Error("This DOT number is already registered under another account."),
                };
              }
            }
          }
        }
      }
      if (table === "vehicles" && "vin" in patch) {
        const nextVin = patch["vin"] ? String(patch["vin"]).trim().toUpperCase() || null : null;
        for (const row of rows.filter(matches)) {
          if ((row["vin"] ?? null) !== nextVin) {
            return {
              data: null,
              error: new Error("VIN is 100% immutable after unit creation and cannot be updated."),
            };
          }
        }
      }
      const updated: Row[] = [];
      state.tables[table] = rows.map((row) => {
        if (!matches(row)) return row;
        const next = { ...row, ...patch };
        if (table === "documents") next["updated_at"] = ts;
        updated.push(next);
        return next;
      });
      if (table === "document_submissions") {
        for (const sub of updated) {
          const did = String(sub["driver_id"] ?? "");
          const hasPending = state.tables.document_submissions.some(
            (s) => s["driver_id"] === did && s["review_status"] === "pending",
          );
          const drv = state.tables.drivers.find((d) => d["id"] === did);
          if (drv) drv["status"] = hasPending ? "Pending Approval" : "Active";
        }
      }
      saveState(state);
      if (singleMode === "single") {
        if (updated.length === 0) return { data: null, error: new Error("Row not found") };
        return { data: updated[0]!, error: null };
      }
      if (singleMode === "maybeSingle") {
        return { data: updated[0] ?? null, error: null };
      }
      return { data: updated, error: null };
    }

    // delete
    if (
      table === "subscriptions" ||
      table === "truck_quota_counters" ||
      table === "truck_creation_log"
    ) {
      return {
        data: null,
        error: new Error("Billing and truck quota history records cannot be deleted."),
      };
    }
    if (table === "companies") {
      const sub = state.tables.subscriptions[0];
      const plan = String(sub?.["plan"] ?? "starter");
      if (plan === "starter" || plan === "platinum") {
        return {
          data: null,
          error: new Error(
            "Starter and Platinum plans are locked to 1 DOT company and cannot delete or swap companies.",
          ),
        };
      }
    }
    const removed = rows.filter(matches);
    const removedIds = new Set(removed.map((r) => String(r["id"] ?? "")));
    state.tables[table] = rows.filter((row) => !matches(row));
    if (table === "drivers") {
      state.tables.documents = state.tables.documents.filter(
        (doc) => !removedIds.has(String(doc["driver_id"] ?? "")),
      );
    } else if (table === "vehicles") {
      state.tables.documents = state.tables.documents.filter(
        (doc) => !removedIds.has(String(doc["vehicle_id"] ?? "")),
      );
    }
    saveState(state);
    return { data: removed, error: null };
  };

  const builder = {
    select(_cols?: string) {
      return builder;
    },
    insert(rows: Row | Row[]) {
      op = "insert";
      payload = rows;
      return builder;
    },
    update(patch: Row) {
      op = "update";
      payload = patch;
      return builder;
    },
    delete() {
      op = "delete";
      return builder;
    },
    eq(col: string, val: unknown) {
      filters.push({ col, val });
      return builder;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      orderBy = { col, ascending: opts?.ascending ?? true };
      return builder;
    },
    single() {
      singleMode = "single";
      return builder;
    },
    maybeSingle() {
      singleMode = "maybeSingle";
      return builder;
    },
    then<TResult1 = { data: unknown; error: Error | null }, TResult2 = never>(
      onfulfilled?:
        | ((value: { data: unknown; error: Error | null }) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return execute().then(onfulfilled, onrejected);
    },
  };

  return builder;
}

function makeMockSession(
  email: string,
  createdAt: string,
  fullName?: string,
  companyName?: string,
): MockSession {
  const user: MockUser = {
    id: DEFAULT_USER_ID,
    email,
    created_at: createdAt,
    user_metadata: {
      ...(fullName ? { full_name: fullName } : {}),
      ...(companyName ? { company_name: companyName } : {}),
    },
  };
  return {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    user,
  };
}

export function createMockSupabaseClient(): ReturnType<typeof createClient<Database>> {
  const client = {
    auth: {
      async getSession() {
        const state = loadState();
        return { data: { session: state.session }, error: null };
      },
      async getUser() {
        const state = loadState();
        return { data: { user: state.session?.user ?? null }, error: null };
      },
      async signInWithPassword(creds: { email: string; password: string }) {
        const state = loadState();
        const profile = state.tables.profiles[0];
        const createdAt = String(profile?.["created_at"] ?? nowIso());
        const session = makeMockSession(creds.email, createdAt);
        state.session = session;
        saveState(state);
        emitAuth("SIGNED_IN", session);
        return { data: { user: session.user, session }, error: null };
      },
      async signUp(creds: {
        email: string;
        password: string;
        options?: { data?: { full_name?: string; company_name?: string } };
      }) {
        const state = loadState();
        const fullName = creds.options?.data?.full_name;
        const companyName = creds.options?.data?.company_name?.trim();
        const createdAt = nowIso();
        const session = makeMockSession(creds.email, createdAt, fullName, companyName);
        state.session = session;
        if (state.tables.profiles[0]) {
          state.tables.profiles[0]["created_at"] = createdAt;
          state.tables.profiles[0]["email"] = creds.email;
        }
        if (state.tables.subscriptions[0]) {
          state.tables.subscriptions[0]["trial_started_at"] = createdAt;
          state.tables.subscriptions[0]["trial_expires_at"] = new Date(
            Date.now() + 72 * 3600_000,
          ).toISOString();
        }
        if (companyName && state.tables.companies.length > 0) {
          state.tables.companies[0] = {
            ...state.tables.companies[0]!,
            name: companyName,
            dot_number: null,
          };
        }
        saveState(state);
        emitAuth("SIGNED_IN", session);
        return { data: { user: session.user, session }, error: null };
      },
      async setSession(tokens: { access_token?: string; refresh_token?: string }) {
        const state = loadState();
        const createdAt = String(state.tables.profiles[0]?.["created_at"] ?? nowIso());
        const session = state.session ?? makeMockSession("demo@fleetguard.local", createdAt);
        session.access_token = tokens.access_token ?? session.access_token;
        session.refresh_token = tokens.refresh_token ?? session.refresh_token;
        state.session = session;
        saveState(state);
        emitAuth("SIGNED_IN", session);
        return { data: { user: session.user, session }, error: null };
      },
      async signOut() {
        const state = loadState();
        state.session = null;
        saveState(state);
        emitAuth("SIGNED_OUT", null);
        return { error: null };
      },
      onAuthStateChange(callback: AuthListener) {
        authListeners.add(callback);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                authListeners.delete(callback);
              },
            },
          },
        };
      },
    },
    from(table: TableName) {
      return buildQuery(table);
    },
    async rpc(fnName: string, args: Record<string, unknown> = {}) {
      const state = loadState();
      if (fnName === "get_subscription_status") {
        const sub = state.tables.subscriptions[0];
        const status = String(sub?.["status"] ?? "trial");
        const plan = String(sub?.["plan"] ?? "starter");
        const userCreated = String(
          state.session?.user.created_at ?? sub?.["trial_started_at"] ?? nowIso(),
        );
        const trialStarted = String(sub?.["trial_started_at"] ?? userCreated);
        const trialExpires = String(
          sub?.["trial_expires_at"] ??
            new Date(new Date(userCreated).getTime() + 72 * 3600_000).toISOString(),
        );
        const accountAgeHours = Math.max(
          0,
          (Date.now() - new Date(userCreated).getTime()) / 3_600_000,
        );
        const isSuperAdmin = state.session?.user.email?.toLowerCase() === "erorx72@gmail.com";
        const isPaidOrActive = status === "paid" || status === "active";
        const isLocked = isSuperAdmin ? false : !isPaidOrActive && accountAgeHours > 72;
        const hoursRemaining = isPaidOrActive ? 0 : Math.max(0, 72 - accountAgeHours);
        return {
          data: [
            {
              plan,
              status,
              trial_started_at: trialStarted,
              trial_expires_at: trialExpires,
              trial_hours_remaining: hoursRemaining,
              is_trial_active: !isSuperAdmin && !isPaidOrActive && !isLocked,
              is_locked: isLocked,
              days_since_creation: Math.floor(accountAgeHours / 24),
            },
          ],
          error: null,
        };
      }

      if (fnName === "create_company") {
        const sub = state.tables.subscriptions[0];
        const plan = String(sub?.["plan"] ?? "starter");
        const maxCompanies = plan === "diamond" ? 50 : 1;
        if (state.tables.companies.length >= maxCompanies) {
          return {
            data: null,
            error: new Error(
              maxCompanies === 1
                ? "Your plan allows 1 DOT company. Upgrade to the DIAMOND AGENCY PLAN for up to 50 companies."
                : "Company limit reached for your plan (50).",
            ),
          };
        }
        const name = String(args["_name"] ?? "").trim();
        if (!name) return { data: null, error: new Error("Company name is required") };
        const dotNumber = args["_dot_number"] ? String(args["_dot_number"]).trim() : null;
        const withSample = Boolean(args["_with_sample"]);
        const id = makeUuid();
        const ts = nowIso();
        state.tables.companies.push({
          id,
          owner_id: state.session?.user.id ?? DEFAULT_USER_ID,
          name,
          dot_number: dotNumber,
          type: "fleet_owner",
          tier: plan,
          trial_started_at: ts,
          created_at: ts,
        });
        if (withSample) {
          const sample = createSampleFleetRows(id, false);
          state.tables.drivers.push(...sample.drivers);
          state.tables.vehicles.push(...sample.vehicles);
          state.tables.documents.push(...sample.documents);
        }
        saveState(state);
        return { data: id, error: null };
      }

      if (fnName === "configure_company_type") {
        const companyId = String(args["_company"] ?? "");
        const type = String(args["_type"] ?? "fleet_owner");
        state.tables.companies = state.tables.companies.map((c) =>
          c["id"] === companyId ? { ...c, type } : c,
        );
        saveState(state);
        return { data: null, error: null };
      }

      if (fnName === "admin_search_accounts") {
        if (state.session?.user.email?.toLowerCase() !== "erorx72@gmail.com") {
          return { data: null, error: new Error("Unauthorized: Super Admin access required.") };
        }
        const q = String(args["_query"] ?? "")
          .trim()
          .toLowerCase();
        const qNorm = q.replace(/[^a-z0-9]/g, "").replace(/^(us)?dot/, "");
        const profile = state.tables.profiles[0];
        const sub = state.tables.subscriptions[0];
        const comp = state.tables.companies[0];
        const row = {
          user_id: String(profile?.["id"] ?? DEFAULT_USER_ID),
          email: String(profile?.["email"] ?? state.session?.user.email ?? ""),
          full_name: (profile?.["full_name"] as string | null) ?? null,
          user_created_at: String(profile?.["created_at"] ?? nowIso()),
          plan: String(sub?.["plan"] ?? "starter"),
          status: String(sub?.["status"] ?? "trial"),
          trial_expires_at: String(sub?.["trial_expires_at"] ?? nowIso()),
          billing_cycle_start: (sub?.["billing_cycle_start"] as string | null) ?? null,
          billing_cycle_end: (sub?.["billing_cycle_end"] as string | null) ?? null,
          paid_at: (sub?.["paid_at"] as string | null) ?? null,
          company_id: (comp?.["id"] as string | null) ?? null,
          company_name: (comp?.["name"] as string | null) ?? null,
          dot_number: (comp?.["dot_number"] as string | null) ?? null,
        };
        const matchesQuery =
          !q ||
          row.email.toLowerCase().includes(q) ||
          (row.full_name ?? "").toLowerCase().includes(q) ||
          (row.company_name ?? "").toLowerCase().includes(q) ||
          (row.dot_number ?? "").toLowerCase().includes(q) ||
          (Boolean(qNorm) &&
            (row.dot_number ?? "")
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "")
              .replace(/^(us)?dot/, "")
              .includes(qNorm));
        return { data: matchesQuery ? [row] : [], error: null };
      }

      if (fnName === "admin_activate_subscription") {
        if (state.session?.user.email?.toLowerCase() !== "erorx72@gmail.com") {
          return { data: null, error: new Error("Unauthorized: Super Admin access required.") };
        }
        const plan = String(args["_plan"] ?? "starter");
        const days = Number(args["_days"] ?? 30);
        if (!["starter", "platinum", "diamond"].includes(plan)) {
          return { data: null, error: new Error(`Invalid plan tier: ${plan}`) };
        }
        const ts = nowIso();
        const end = new Date(Date.now() + days * 86400_000).toISOString();
        if (state.tables.subscriptions[0]) {
          state.tables.subscriptions[0] = {
            ...state.tables.subscriptions[0]!,
            plan,
            status: "active",
            paid_at: ts,
            billing_cycle_start: ts,
            billing_cycle_end: end,
            updated_at: ts,
          };
        }
        state.tables.companies = state.tables.companies.map((c) => ({ ...c, tier: plan }));
        saveState(state);
        return { data: null, error: null };
      }

      if (fnName === "clear_sample_data") {
        const companyId = String(args["_company"] ?? "");
        const comp = state.tables.companies.find((c) => c["id"] === companyId);
        if (!comp) return { data: null, error: new Error("Company not found") };

        const sampleVins = new Set(["1FUJGLDR5CLBP8834", "3AKJHHDR7LSLA4421"]);
        const removedVehicles = state.tables.vehicles.filter(
          (v) => v["company_id"] === companyId && sampleVins.has(String(v["vin"] ?? "")),
        );
        const removedVehicleIds = new Set(removedVehicles.map((v) => String(v["id"] ?? "")));

        const removedDrivers = state.tables.drivers.filter(
          (d) =>
            d["company_id"] === companyId &&
            ["Marcus Johnson", "Sarah Mitchell", "David Rodriguez"].includes(
              String(d["full_name"] ?? ""),
            ) &&
            String(d["email"] ?? "").endsWith("@example.com"),
        );
        const removedDriverIds = new Set(removedDrivers.map((d) => String(d["id"] ?? "")));

        state.tables.vehicles = state.tables.vehicles.filter(
          (v) => !removedVehicleIds.has(String(v["id"] ?? "")),
        );
        state.tables.drivers = state.tables.drivers.filter(
          (d) => !removedDriverIds.has(String(d["id"] ?? "")),
        );
        state.tables.documents = state.tables.documents.filter(
          (doc) =>
            !removedVehicleIds.has(String(doc["vehicle_id"] ?? "")) &&
            !removedDriverIds.has(String(doc["driver_id"] ?? "")),
        );

        if (
          !comp["sample_cleared"] &&
          removedVehicles.length > 0 &&
          state.tables.truck_quota_counters[0]
        ) {
          state.tables.truck_quota_counters[0]["trucks_created"] = Math.max(
            0,
            Number(state.tables.truck_quota_counters[0]["trucks_created"] ?? 0) -
              removedVehicles.length,
          );
        }
        comp["sample_cleared"] = true;
        saveState(state);
        return { data: null, error: null };
      }

      if (fnName === "upsert_user_session") {
        const fp = String(args["_device_fingerprint"] ?? "");
        const ip = String(args["_ip_address"] ?? "127.0.0.1");
        const ua = args["_user_agent"] ? String(args["_user_agent"]) : null;
        const ts = nowIso();
        const uid = state.session?.user.id ?? DEFAULT_USER_ID;

        const existing = state.tables.user_sessions.find(
          (s) => s["user_id"] === uid && s["device_fingerprint"] === fp && !s["is_terminated"],
        );
        if (existing) {
          existing["last_active_at"] = ts;
          saveState(state);
          return {
            data: [
              {
                session_id: String(existing["id"]),
                is_terminated: false,
                impossible_travel_detected: false,
                max_sessions_exceeded: false,
              },
            ],
            error: null,
          };
        }

        const active = state.tables.user_sessions
          .filter((s) => s["user_id"] === uid && !s["is_terminated"])
          .sort((a, b) => String(a["last_active_at"]).localeCompare(String(b["last_active_at"])));

        let exceeded = false;
        while (active.length >= 2) {
          exceeded = true;
          const oldest = active.shift();
          if (oldest) oldest["is_terminated"] = true;
        }

        const sessionId = makeUuid();
        state.tables.user_sessions.push({
          id: sessionId,
          user_id: uid,
          session_token: makeUuid(),
          device_fingerprint: fp,
          ip_address: ip,
          ip_geo: null,
          user_agent: ua,
          created_at: ts,
          last_active_at: ts,
          is_terminated: false,
        });
        saveState(state);
        return {
          data: [
            {
              session_id: sessionId,
              is_terminated: false,
              impossible_travel_detected: false,
              max_sessions_exceeded: exceeded,
            },
          ],
          error: null,
        };
      }

      if (fnName === "check_session_valid") {
        const sid = String(args["_session_id"] ?? "");
        const sess = state.tables.user_sessions.find((s) => s["id"] === sid);
        return { data: Boolean(sess && !sess["is_terminated"]), error: null };
      }

      if (fnName === "approve_document_submission") {
        const submissionId = String(args["_submission"] ?? "");
        const expiresOn = String(args["_expires_on"] ?? "");
        const stateIssuance = args["_state"] ? String(args["_state"]).trim() : null;
        const vehicleId = args["_vehicle"] ? String(args["_vehicle"]) : null;
        const sub = state.tables.document_submissions.find((s) => s["id"] === submissionId);
        if (!sub) return { data: null, error: new Error("Submission unavailable") };

        const docType = String(sub["doc_type"]);
        const target = state.tables.documents.find((d) =>
          docType === "annual_inspection"
            ? d["vehicle_id"] === vehicleId && d["doc_type"] === docType
            : d["driver_id"] === sub["driver_id"] && d["doc_type"] === docType,
        );
        if (!target) return { data: null, error: new Error("Checklist item not found") };

        target["file_path"] = sub["file_path"];
        target["file_name"] = sub["file_name"];
        target["uploaded_at"] = sub["submitted_at"];
        target["expires_on"] = expiresOn;
        target["state_of_issuance"] = docType === "cdl" ? stateIssuance : null;
        target["updated_at"] = nowIso();

        sub["review_status"] = "approved";
        sub["reviewed_at"] = nowIso();
        sub["reviewed_by"] = state.session?.user.id ?? DEFAULT_USER_ID;

        const subDriverId = String(sub["driver_id"] ?? "");
        const hasRemainingPending = state.tables.document_submissions.some(
          (s) => s["driver_id"] === subDriverId && s["review_status"] === "pending",
        );
        const drv = state.tables.drivers.find((d) => d["id"] === subDriverId);
        if (drv) drv["status"] = hasRemainingPending ? "Pending Approval" : "Active";

        saveState(state);
        return { data: null, error: null };
      }

      return { data: null, error: null };
    },
    storage: {
      from(_bucket: string) {
        const fileToStoredUrl = async (file: File): Promise<string> => {
          if (typeof FileReader !== "undefined" && file.size > 0 && file.size <= 1_500_000) {
            try {
              const dataUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () =>
                  resolve(typeof reader.result === "string" ? reader.result : "");
                reader.onerror = () => resolve("");
                reader.readAsDataURL(file);
              });
              if (dataUrl) return dataUrl;
            } catch {
              // ignore and fall back
            }
          }
          return typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
            ? URL.createObjectURL(file)
            : "";
        };

        return {
          async upload(path: string, file: File) {
            const dataUrl = await fileToStoredUrl(file);
            const state = loadState();
            state.files[path] = {
              name: path.split("/").pop() ?? file.name,
              mime: file.type || "application/octet-stream",
              size: file.size,
              dataUrl,
            };
            saveState(state);
            return { data: { path }, error: null };
          },
          async uploadToSignedUrl(path: string, _token: string, file: File) {
            const dataUrl = await fileToStoredUrl(file);
            const state = loadState();
            state.files[path] = {
              name: path.split("/").pop() ?? file.name,
              mime: file.type || "application/octet-stream",
              size: file.size,
              dataUrl,
            };
            saveState(state);
            return { data: { path }, error: null };
          },
          async createSignedUrl(path: string, _expiresIn: number) {
            const state = loadState();
            const file = state.files[path];
            const fallbackSvg =
              "data:image/svg+xml;utf8," +
              encodeURIComponent(
                `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360"><rect width="100%" height="100%" fill="#f8fafc"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="18" fill="#0f172a">Uploaded Document Preview (${path.split("/").pop() ?? "file"})</text></svg>`,
              );
            return {
              data: { signedUrl: file?.dataUrl || fallbackSvg },
              error: null,
            };
          },
          async createSignedUploadUrl(path: string) {
            return {
              data: { signedUrl: path, path, token: makeUuid() },
              error: null,
            };
          },
          async list(prefix: string) {
            const state = loadState();
            const normalized = prefix.replace(/\/+$/, "");
            const items = Object.entries(state.files)
              .filter(([key]) => key.startsWith(`${normalized}/`))
              .map(([key, f]) => ({
                name: key.slice(normalized.length + 1),
                metadata: { mimetype: f.mime, size: f.size },
              }));
            return { data: items, error: null };
          },
        };
      },
    },
  };

  return client as unknown as ReturnType<typeof createClient<Database>>;
}

import { z } from "zod";

/**
 * Strips ASCII control characters, angle brackets, and dangerous URI prefixes
 * to defend against XSS / script injection before persistence or display.
 */
export function sanitizeText(value: string, maxLength = 200): string {
  const withoutControls = Array.from(value, (ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127 ? " " : ch;
  }).join("");
  return withoutControls
    .replace(/[<>]/g, "")
    .replace(/javascript:/gi, "")
    .replace(/data:/gi, "")
    .trim()
    .slice(0, maxLength);
}

export function normalizeDotNumber(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .replace(/^(US)?DOT/, "");
}

export const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeVin(value: string): string {
  return sanitizeText(value, 32)
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

export const dotLookupSchema = z.object({
  dotNumber: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 1 && v.length <= 8, "Enter a valid 1 to 8 digit USDOT number."),
});

export const vinDecodeSchema = z.object({
  vin: z
    .string()
    .transform((v) => normalizeVin(v))
    .refine(
      (v) => VIN_REGEX.test(v),
      "Enter a valid 17-character VIN (letters except I/O/Q and digits).",
    ),
});

export const companyFormSchema = z.object({
  name: z
    .string()
    .transform((v) => sanitizeText(v, 140))
    .refine((v) => v.length >= 2, "Company name must be at least 2 characters."),
  dotNumber: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v, 32) : "")),
  dbaName: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v, 140) : "")),
  physicalAddress: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v, 220) : "")),
  carrierStatus: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v, 60) : "")),
});

export const vehicleFormSchema = z.object({
  kind: z.enum(["truck", "trailer"]),
  unit_number: z
    .string()
    .transform((v) => sanitizeText(v, 30).replace(/^#/, ""))
    .refine((v) => v.length >= 1, "Unit number is required."),
  vin: z
    .string()
    .optional()
    .transform((v) => (v ? normalizeVin(v) : ""))
    .refine((v) => v === "" || VIN_REGEX.test(v), "VIN must be 17 valid characters when provided."),
  plate: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v, 24).toUpperCase() : "")),
  year: z
    .union([z.number().int().min(1950).max(2035), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return null;
      const num = typeof v === "number" ? v : Number.parseInt(String(v).replace(/\D/g, ""), 10);
      return Number.isFinite(num) && num >= 1950 && num <= 2035 ? num : null;
    }),
  make: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v, 60) : "")),
  model: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v, 60) : "")),
});

export const driverFormSchema = z.object({
  full_name: z
    .string()
    .transform((v) => sanitizeText(v, 120))
    .refine((v) => v.length >= 2, "Driver full name is required."),
  phone: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v, 30) : "")),
  email: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v, 120).toLowerCase() : ""))
    .refine(
      (v) => v === "" || z.string().email().safeParse(v).success,
      "Enter a valid email address.",
    ),
  hire_date: z
    .string()
    .optional()
    .transform((v) => (v ? sanitizeText(v, 20) : "")),
});

export const inviteMemberSchema = z.object({
  fullName: z
    .string()
    .transform((v) => sanitizeText(v, 120))
    .refine((v) => v.length >= 2, "Staff full name is required."),
  email: z
    .string()
    .transform((v) => sanitizeText(v, 120).toLowerCase())
    .pipe(z.string().email("Enter a valid staff email address.")),
  role: z.enum(["safety_manager", "agency_staff"]),
});

export const adminActivateSchema = z.object({
  userId: z.string().uuid("Invalid target user ID."),
  plan: z.enum(["starter", "platinum", "diamond"]),
  days: z.number().int().min(1).max(3650).default(30),
});

import { createServerFn } from "@tanstack/react-start";
import { dotLookupSchema, sanitizeText, vinDecodeSchema } from "@/lib/validation";

export interface CarrierLookupResult {
  found: boolean;
  dotNumber: string;
  legalName: string;
  dbaName: string;
  physicalAddress: string;
  status: string;
  source: "fmcsa_qcmobile" | "fmcsa_safer" | "fallback";
  message?: string;
}

export interface VinDecodeResult {
  found: boolean;
  vin: string;
  year: number | null;
  make: string;
  model: string;
  message?: string;
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSaferField(html: string, labelPattern: RegExp): string {
  const thMatch = html.match(labelPattern);
  if (!thMatch || thMatch.index === undefined) return "";
  const afterLabel = html.slice(thMatch.index + thMatch[0].length);
  const tdMatch = afterLabel.match(/<td\b[^>]*>([\s\S]*?)<\/td>/i);
  if (!tdMatch?.[1]) return "";
  return sanitizeText(decodeHtmlEntities(tdMatch[1]), 220);
}

/**
 * Official US Government FMCSA/SAFER carrier lookup with 4.5s timeout and graceful fallback
 * so registration UI never freezes.
 */
export const lookupDotCarrier = createServerFn({ method: "POST" })
  .inputValidator(dotLookupSchema)
  .handler(async ({ data }): Promise<CarrierLookupResult> => {
    const digits = data.dotNumber;
    const formattedDot = `USDOT ${digits}`;
    const webKey = typeof process !== "undefined" ? process.env["FMCSA_WEB_KEY"] : undefined;

    // 1. Optional FMCSA QCMobile JSON API if key is configured
    if (webKey) {
      try {
        const res = await fetch(
          `https://mobile.fmcsa.dot.gov/qc/services/carriers/${encodeURIComponent(digits)}?webKey=${encodeURIComponent(webKey)}`,
          { signal: AbortSignal.timeout(4500), headers: { Accept: "application/json" } },
        );
        if (res.ok) {
          const json = (await res.json()) as {
            content?: {
              carrier?: {
                legalName?: string;
                dbaName?: string;
                phyStreet?: string;
                phyCity?: string;
                phyState?: string;
                phyZipcode?: string;
                allowedToOperate?: string;
                statusCode?: string;
              };
            };
          };
          const c = json.content?.carrier;
          if (c?.legalName) {
            const addr = [c.phyStreet, c.phyCity, c.phyState, c.phyZipcode]
              .filter(Boolean)
              .join(", ");
            return {
              found: true,
              dotNumber: formattedDot,
              legalName: sanitizeText(c.legalName, 140),
              dbaName: sanitizeText(c.dbaName ?? "", 140),
              physicalAddress: sanitizeText(addr, 220),
              status:
                c.allowedToOperate === "Y"
                  ? "ACTIVE"
                  : sanitizeText(c.statusCode ?? "INACTIVE", 60),
              source: "fmcsa_qcmobile",
            };
          }
        }
      } catch {
        // Fall through to free public FMCSA SAFER snapshot
      }
    }

    // 2. Free public US FMCSA SAFER Company Snapshot
    try {
      const saferUrl = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${encodeURIComponent(digits)}`;
      const res = await fetch(saferUrl, {
        signal: AbortSignal.timeout(4500),
        headers: {
          "User-Agent": "FleetGuardCompliance/1.0",
          Accept: "text/html",
        },
      });
      if (!res.ok) {
        return {
          found: false,
          dotNumber: formattedDot,
          legalName: "",
          dbaName: "",
          physicalAddress: "",
          status: "",
          source: "fallback",
          message: "FMCSA lookup unavailable right now — enter carrier details manually.",
        };
      }

      const html = await res.text();
      if (/Record Not Found|Carrier Not Found|No records matching/i.test(html)) {
        return {
          found: false,
          dotNumber: formattedDot,
          legalName: "",
          dbaName: "",
          physicalAddress: "",
          status: "",
          source: "fmcsa_safer",
          message: `No carrier found for ${formattedDot} in FMCSA SAFER — enter details manually.`,
        };
      }

      const legalName = extractSaferField(html, /Legal Name\s*:[\s\S]*?<\/th>/i);
      const dbaName = extractSaferField(html, /DBA Name\s*:[\s\S]*?<\/th>/i);
      const physicalAddress = extractSaferField(html, /Physical Address\s*:[\s\S]*?<\/th>/i);
      const usdotStatus = extractSaferField(html, /USDOT Status\s*:[\s\S]*?<\/th>/i);

      if (!legalName) {
        return {
          found: false,
          dotNumber: formattedDot,
          legalName: "",
          dbaName: "",
          physicalAddress: "",
          status: "",
          source: "fallback",
          message: "Could not parse FMCSA record — enter carrier details manually.",
        };
      }

      return {
        found: true,
        dotNumber: formattedDot,
        legalName,
        dbaName,
        physicalAddress,
        status: usdotStatus || "ACTIVE",
        source: "fmcsa_safer",
      };
    } catch {
      return {
        found: false,
        dotNumber: formattedDot,
        legalName: "",
        dbaName: "",
        physicalAddress: "",
        status: "",
        source: "fallback",
        message: "FMCSA SAFER request timed out — enter carrier details manually.",
      };
    }
  });

/**
 * Official free US DOT NHTSA vPIC VIN decoder with 4.5s timeout and graceful fallback.
 */
export const decodeNhtsaVin = createServerFn({ method: "POST" })
  .inputValidator(vinDecodeSchema)
  .handler(async ({ data }): Promise<VinDecodeResult> => {
    const vin = data.vin;
    try {
      const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(vin)}?format=json`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(4500),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        return {
          found: false,
          vin,
          year: null,
          make: "",
          model: "",
          message: "NHTSA VIN decoder unavailable — enter Year/Make/Model manually.",
        };
      }

      const json = (await res.json()) as {
        Results?: Array<{
          ModelYear?: string;
          Make?: string;
          Model?: string;
          ErrorCode?: string;
          ErrorText?: string;
        }>;
      };
      const row = json.Results?.[0];
      if (!row) {
        return {
          found: false,
          vin,
          year: null,
          make: "",
          model: "",
          message: "No NHTSA record matched this VIN.",
        };
      }

      const parsedYear = row.ModelYear ? Number.parseInt(row.ModelYear, 10) : NaN;
      const year =
        Number.isFinite(parsedYear) && parsedYear >= 1950 && parsedYear <= 2035 ? parsedYear : null;
      const make = sanitizeText(row.Make ?? "", 60);
      const model = sanitizeText(row.Model ?? "", 60);

      return {
        found: Boolean(year || make || model),
        vin,
        year,
        make,
        model,
        ...(year || make || model
          ? {}
          : { message: sanitizeText(row.ErrorText ?? "VIN not recognized by NHTSA", 140) }),
      };
    } catch {
      return {
        found: false,
        vin,
        year: null,
        make: "",
        model: "",
        message: "NHTSA VIN lookup timed out — enter Year/Make/Model manually.",
      };
    }
  });

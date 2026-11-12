import { z } from "zod";

export const submissionTypes = [
  "cdl",
  "medical_card",
  "annual_inspection",
  "mvr",
  "drug_test",
] as const;
export const finishSubmissionSchema = z.object({
  token: z.string().uuid(),
  submissionId: z.string().uuid(),
  state: z.string().trim().max(80).optional(),
});

export function validUploadPath(
  path: string,
  companyId: string,
  driverId: string,
  submissionId: string,
) {
  return (
    path.startsWith(`${companyId}/${driverId}/${submissionId}/`) &&
    !path.includes("..") &&
    path.split("/").length === 4
  );
}

const EXTENSION_MIME_MAP: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
};

export function resolveFileMimeType(file: Pick<File, "name" | "type">): string | null {
  const raw = (file.type || "").toLowerCase();
  if (raw.startsWith("image/") || raw === "application/pdf") return raw;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME_MAP[ext] ?? null;
}
